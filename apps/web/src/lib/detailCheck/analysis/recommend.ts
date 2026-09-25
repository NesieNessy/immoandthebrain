import type { CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { createAnalysisCache } from './cache';
import { dedupeTitles, formatCurrency, formatMonth } from './cards';
import { runGoal, type OptimizationGoal, type OptimizationProposal } from './optimize';

/**
 * Empfehlung (SCRUM-96, Schnitt 4): rechnet alle sechs Ziele und wählt das
 * beste nach `[breakEvenOffset, -endingCashflow]` des jeweiligen
 * `after`-Plans — dieselbe lexikographische Regel wie `EARLIEST_BREAK_EVEN`,
 * hier über die Ziele hinweg statt über Zeitpunkte.
 */
// NO_MODERNIZATION listed first so it wins ties against a selection goal that
// happens to land on the very same "exclude everything" result (e.g. MAX_ROI
// when no measure is profitable) — the reasoning's "Rein finanziell lohnt
// sich..." framing only ever comes from this candidate.
const CANDIDATE_GOALS: OptimizationGoal[] = ['NO_MODERNIZATION', 'EARLIEST_BREAK_EVEN', 'MAX_RENT_IN_VIEW', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_ROI', 'MAX_EQUITY_IRR'];

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedCurrency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, signDisplay: 'always' });

function monthsFrom(start: string, month: string | null): number {
  if (!month) return 9999;
  const [sy, sm] = start.split('-').map(Number);
  const [y, m] = month.split('-').map(Number);
  return (y - sy) * 12 + (m - sm);
}

function score(proposal: OptimizationProposal, start: string): [number, number] {
  return [monthsFrom(start, proposal.after.breakEven), -proposal.after.endingCashflow];
}

function scoreOfFigures(figures: OptimizationProposal['before'], start: string): [number, number] {
  return [monthsFrom(start, figures.breakEven), -figures.endingCashflow];
}

function compare(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * Reasoning sentences, always in this order when the underlying numbers
 * exist (browser-fix, SCRUM-96): break-even (earlier/later/newly reached/
 * unchanged), cumulative cashflow after B with delta, the sustainably-
 * positive month if it moved, EK-Rendite if non-null, then one sentence per
 * excluded measure (deduplicated by title). No length cap — a plan with
 * several excluded measures must not crowd out the headline figures.
 */
function reasoningFor(proposal: OptimizationProposal, current: OptimizationProposal['before'], start: string): string[] {
  const sentences: string[] = [];
  const after = proposal.after;

  const beforeOffset = monthsFrom(start, current.breakEven);
  const afterOffset = monthsFrom(start, after.breakEven);
  if (after.breakEven && current.breakEven) {
    if (afterOffset !== beforeOffset) {
      const delta = beforeOffset - afterOffset;
      const direction = delta > 0 ? 'früher' : 'später';
      sentences.push(`Break-even ${formatMonth(after.breakEven)} statt ${formatMonth(current.breakEven)} (${Math.abs(delta)} Monate ${direction}).`);
    } else {
      sentences.push(`Break-even bleibt unverändert bei ${formatMonth(after.breakEven)}.`);
    }
  } else if (after.breakEven && !current.breakEven) {
    sentences.push(`Break-even ${formatMonth(after.breakEven)} (bisher im Betrachtungszeitraum nicht erreicht).`);
  } else if (!after.breakEven && current.breakEven) {
    sentences.push(`Break-even wird im Betrachtungszeitraum nicht mehr erreicht (bisher ${formatMonth(current.breakEven)}).`);
  }

  const cashflowDelta = after.cashflowAtViewEnd - current.cashflowAtViewEnd;
  const cashflowDeltaText = Math.abs(cashflowDelta) >= 0.5 ? ` (${signedCurrency.format(cashflowDelta)})` : '';
  sentences.push(`Kumulierter Cashflow nach dem Betrachtungszeitraum: ${formatCurrency(after.cashflowAtViewEnd)}${cashflowDeltaText}.`);

  const beforeSustainableOffset = monthsFrom(start, current.sustainablyPositiveFrom);
  const afterSustainableOffset = monthsFrom(start, after.sustainablyPositiveFrom);
  if (after.sustainablyPositiveFrom && current.sustainablyPositiveFrom && afterSustainableOffset !== beforeSustainableOffset) {
    const delta = beforeSustainableOffset - afterSustainableOffset;
    const direction = delta > 0 ? 'früher' : 'später';
    sentences.push(
      `Cashflow dauerhaft positiv ab ${formatMonth(after.sustainablyPositiveFrom)} statt ${formatMonth(current.sustainablyPositiveFrom)} (${Math.abs(delta)} Monate ${direction}).`,
    );
  } else if (after.sustainablyPositiveFrom && !current.sustainablyPositiveFrom) {
    sentences.push(`Cashflow dauerhaft positiv ab ${formatMonth(after.sustainablyPositiveFrom)} (bisher im Betrachtungszeitraum nicht erreicht).`);
  }

  if (after.equityIrr != null) {
    sentences.push(`Eigenkapitalrendite: ${percent.format(after.equityIrr)} p. a. (Annahme Wertsteigerung 2 % p. a.).`);
  }

  for (const title of dedupeTitles(proposal.excludedTitles)) {
    sentences.push(`Die Maßnahme ${title} entfällt: Sie holt ihre Kosten im Betrachtungszeitraum nicht herein.`);
  }

  return sentences;
}

/** Die sechs Ziele, die für `RECOMMENDATION` verglichen werden — auch für den Aufrufer nützlich (z. B. um sie parallel in Workern zu starten). */
export { CANDIDATE_GOALS as RECOMMENDATION_CANDIDATE_GOALS };

/**
 * Auswahl + Begründung aus bereits gerechneten Proposals (SCRUM-96,
 * Performance): reine Funktion, damit der Hook die sechs Ziele parallel in
 * Workern rechnen kann und trotzdem dieselbe Auswahl-/Begründungslogik nutzt
 * wie `recommend()`. `proposals` darf für ein Ziel fehlen oder `null`/
 * `tooMany`/`noEquity` sein — solche Ziele werden wie bisher übersprungen
 * (`noEquity`: ohne Eigenkapital ist `equityIrr` für jede Teilmenge `null`,
 * MAX_EQUITY_IRR hat also nichts zu vergleichen und darf nicht willkürlich
 * eine Teilmenge gewinnen lassen).
 */
export function pickRecommendation(
  params: CalculatorParams,
  cases: RenovationCase[],
  proposals: Partial<Record<OptimizationGoal, OptimizationProposal | null>>,
): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;
  const start = params.startYyyymm;

  let best: { goal: OptimizationGoal; proposal: OptimizationProposal; score: [number, number] } | null = null;
  for (const goal of CANDIDATE_GOALS) {
    const proposal = proposals[goal];
    if (!proposal || proposal.tooMany || proposal.noEquity) continue;
    const candidateScore = score(proposal, start);
    if (!best || compare(candidateScore, best.score) < 0) {
      best = { goal, proposal, score: candidateScore };
    }
  }
  if (!best) return null;

  const reasoning = reasoningFor(best.proposal, best.proposal.before, start);
  if (best.goal === 'NO_MODERNIZATION') {
    reasoning.unshift('Rein finanziell lohnt sich keine der geplanten Maßnahmen im Betrachtungszeitraum.');
  }

  // The recommendation's own criterion decides "improved" here — not
  // whatever the winning sub-goal computed for itself (e.g. MAX_EQUITY_IRR's
  // own metric) — and only when the plan actually changed (browser-fix,
  // SCRUM-96): a proposal that excludes measures or moves placements and is
  // strictly better by [breakEvenOffset, -endingCashflow] must show
  // "Verbesserung" and offer "Übernehmen".
  const planChanged = best.proposal.changes.length > 0 || best.proposal.excludedModernizationIds.length > 0;
  const improved = planChanged && compare(scoreOfFigures(best.proposal.after, start), scoreOfFigures(best.proposal.before, start)) < 0;

  return {
    ...best.proposal,
    goal: 'RECOMMENDATION',
    chosenGoal: best.goal,
    improved,
    reasoning: reasoning.length > 0 ? reasoning : undefined,
  };
}

/** Rechnet alle sechs Ziele und liefert den nach Break-even/Endcashflow besten Vorschlag samt Begründung. */
export function recommend(params: CalculatorParams, cases: RenovationCase[]): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;

  // Ein gemeinsamer Cache über alle sechs Ziele: MAX_ROI/MAX_EQUITY_IRR
  // rechnen in Stufe 1 identische Teilmengen, und EARLIEST_BREAK_EVEN kann
  // sowohl als eigenes Ziel als auch in deren Stufe 2 angefragt werden. Nur
  // sinnvoll, wenn alle Ziele im selben Thread laufen (siehe `pickRecommendation`
  // für den parallelen Worker-Fall im Hook).
  const cache = createAnalysisCache();
  const proposals: Partial<Record<OptimizationGoal, OptimizationProposal | null>> = {};
  for (const goal of CANDIDATE_GOALS) {
    proposals[goal] = runGoal(params, cases, goal, cache);
  }

  return pickRecommendation(params, cases, proposals);
}
