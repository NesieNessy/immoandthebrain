import type { CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { createAnalysisCache } from './cache';
import { formatCurrency, formatMonth } from './cards';
import { runGoal, type OptimizationGoal, type OptimizationProposal } from './optimize';

/**
 * Empfehlung (SCRUM-96, Schnitt 4): rechnet alle fünf Ziele und wählt das
 * beste nach `[breakEvenOffset, -endingCashflow]` des jeweiligen
 * `after`-Plans — dieselbe lexikographische Regel wie `EARLIEST_BREAK_EVEN`,
 * hier über die Ziele hinweg statt über Zeitpunkte.
 */
const CANDIDATE_GOALS: OptimizationGoal[] = ['EARLIEST_BREAK_EVEN', 'MAX_RENT_IN_VIEW', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_ROI', 'MAX_EQUITY_IRR'];

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

function compare(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function reasoningFor(proposal: OptimizationProposal, current: OptimizationProposal['before'], start: string): string[] {
  const sentences: string[] = [];

  const beforeOffset = monthsFrom(start, current.breakEven);
  const afterOffset = monthsFrom(start, proposal.after.breakEven);
  if (proposal.after.breakEven && current.breakEven && afterOffset !== beforeOffset) {
    const delta = beforeOffset - afterOffset;
    const direction = delta > 0 ? 'früher' : 'später';
    sentences.push(`Break-even ${formatMonth(proposal.after.breakEven)} statt ${formatMonth(current.breakEven)} (${Math.abs(delta)} Monate ${direction}).`);
  } else if (proposal.after.breakEven && !current.breakEven) {
    sentences.push(`Break-even ${formatMonth(proposal.after.breakEven)} (bisher im Betrachtungszeitraum nicht erreicht).`);
  }

  for (const title of proposal.excludedTitles) {
    sentences.push(`Die Maßnahme ${title} entfällt: Sie holt ihre Kosten im Betrachtungszeitraum nicht herein.`);
  }

  if (Number.isFinite(proposal.after.cashflowAtViewEnd)) {
    const delta = proposal.after.cashflowAtViewEnd - current.cashflowAtViewEnd;
    const deltaText = Math.abs(delta) >= 0.5 ? ` (${signedCurrency.format(delta)})` : '';
    sentences.push(`Kumulierter Cashflow nach dem Betrachtungszeitraum: ${formatCurrency(proposal.after.cashflowAtViewEnd)}${deltaText}.`);
  }

  if (proposal.after.equityIrr != null) {
    sentences.push(`Eigenkapitalrendite: ${percent.format(proposal.after.equityIrr)} p. a. (Annahme Wertsteigerung 2 % p. a.).`);
  }

  if (proposal.after.roi != null) {
    sentences.push(`ROI der Maßnahmen im Betrachtungszeitraum: ${percent.format(proposal.after.roi)}.`);
  }

  return sentences.slice(0, 5);
}

/** Die fünf Ziele, die für `RECOMMENDATION` verglichen werden — auch für den Aufrufer nützlich (z. B. um sie parallel in Workern zu starten). */
export { CANDIDATE_GOALS as RECOMMENDATION_CANDIDATE_GOALS };

/**
 * Auswahl + Begründung aus bereits gerechneten Proposals (SCRUM-96,
 * Performance): reine Funktion, damit der Hook die fünf Ziele parallel in
 * Workern rechnen kann und trotzdem dieselbe Auswahl-/Begründungslogik nutzt
 * wie `recommend()`. `proposals` darf für ein Ziel fehlen oder `null`/
 * `tooMany` sein — solche Ziele werden wie bisher übersprungen.
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
    if (!proposal || proposal.tooMany) continue;
    const candidateScore = score(proposal, start);
    if (!best || compare(candidateScore, best.score) < 0) {
      best = { goal, proposal, score: candidateScore };
    }
  }
  if (!best) return null;

  const reasoning = reasoningFor(best.proposal, best.proposal.before, start);

  return {
    ...best.proposal,
    goal: 'RECOMMENDATION',
    chosenGoal: best.goal,
    reasoning: reasoning.length > 0 ? reasoning : undefined,
  };
}

/** Rechnet alle fünf Ziele und liefert den nach Break-even/Endcashflow besten Vorschlag samt Begründung. */
export function recommend(params: CalculatorParams, cases: RenovationCase[]): OptimizationProposal | null {
  if (params.mode !== 'KNOWN') return null;

  // Ein gemeinsamer Cache über alle fünf Ziele: MAX_ROI/MAX_EQUITY_IRR
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
