import { describe, expect, it } from 'vitest';
import { calculatorParams, renovationCase } from '../testFixtures';
import { runGoal, type OptimizationGoal } from './optimize';
import { recommend } from './recommend';

const CANDIDATE_GOALS: OptimizationGoal[] = ['NO_MODERNIZATION', 'EARLIEST_BREAK_EVEN', 'MAX_RENT_IN_VIEW', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_ROI', 'MAX_EQUITY_IRR'];

function monthsFrom(start: string, month: string | null): number {
  if (!month) return 9999;
  const [sy, sm] = start.split('-').map(Number);
  const [y, m] = month.split('-').map(Number);
  return (y - sy) * 12 + (m - sm);
}

describe('recommend', () => {
  it('is null outside KNOWN mode', () => {
    expect(recommend(calculatorParams({ mode: 'POTENTIAL' }), [])).toBeNull();
  });

  it('picks the goal with the best [breakEvenOffset, -endingCashflow] among the five candidates, independently verified', () => {
    const cases = [renovationCase('a', 10000), renovationCase('b', 60000)];
    const params = calculatorParams({ equityAmount: 40000 });

    const recommendation = recommend(params, cases);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.goal).toBe('RECOMMENDATION');

    let bestGoal: OptimizationGoal | null = null;
    let bestScore: [number, number] | null = null;
    for (const goal of CANDIDATE_GOALS) {
      const proposal = runGoal(params, cases, goal);
      if (!proposal || proposal.tooMany) continue;
      const candidateScore: [number, number] = [monthsFrom(params.startYyyymm, proposal.after.breakEven), -proposal.after.endingCashflow];
      if (!bestScore || candidateScore[0] < bestScore[0] || (candidateScore[0] === bestScore[0] && candidateScore[1] < bestScore[1])) {
        bestScore = candidateScore;
        bestGoal = goal;
      }
    }

    expect(recommendation!.chosenGoal).toBe(bestGoal);
    expect(recommendation!.reasoning).toBeDefined();
    expect(recommendation!.reasoning!.length).toBeGreaterThanOrEqual(1);
    for (const sentence of recommendation!.reasoning!) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.trim().endsWith('.')).toBe(true);
    }
  });

  it('never picks MAX_EQUITY_IRR when there is no equity, and improved reflects the recommendation\'s own criterion (browser-fix, SCRUM-96)', () => {
    // Reproduces the browser workflow: several measures, equityAmount 0. The
    // reported bugs were (a) MAX_EQUITY_IRR won anyway with an arbitrary,
    // unimproved subset although equityIrr is "–" for both before/after, and
    // (b) the card showed "Plan ist bereits optimal" / no "Übernehmen" even
    // though the winning proposal clearly changed and improved the plan.
    const cases = [
      renovationCase('a', 8000),
      renovationCase('b', 15000),
      renovationCase('c', 25000),
      renovationCase('d', 45000),
      renovationCase('e', 500000), // deliberately uneconomical, should end up excluded
    ];
    const params = calculatorParams({ equityAmount: 0 });

    const recommendation = recommend(params, cases);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.chosenGoal).not.toBe('MAX_EQUITY_IRR');

    const planChanged = recommendation!.changes.length > 0 || recommendation!.excludedModernizationIds.length > 0;
    if (planChanged) {
      const beforeScore: [number, number] = [
        monthsFrom(params.startYyyymm, recommendation!.before.breakEven),
        -recommendation!.before.endingCashflow,
      ];
      const afterScore: [number, number] = [
        monthsFrom(params.startYyyymm, recommendation!.after.breakEven),
        -recommendation!.after.endingCashflow,
      ];
      const strictlyBetter = afterScore[0] !== beforeScore[0] ? afterScore[0] < beforeScore[0] : afterScore[1] < beforeScore[1];
      expect(recommendation!.improved).toBe(strictlyBetter);
    } else {
      expect(recommendation!.improved).toBe(false);
    }
  });

  it('reasoning always covers break-even, cumulative cashflow and (if present) EK-Rendite, plus one deduplicated sentence per excluded measure (browser-fix, SCRUM-96)', () => {
    // Two measures share a title on purpose, to exercise the "(2×)" dedup —
    // and there are enough excluded measures that the old 5-sentence cap
    // would have swallowed the headline figures.
    const cases = [
      renovationCase('a', 8000, { massnahme: 'Neue Bodenbeläge (Parkett/Vinyl)' }),
      renovationCase('b', 500000, { massnahme: 'Neue Bodenbeläge (Parkett/Vinyl)' }),
      renovationCase('c', 600000),
      renovationCase('d', 700000),
      renovationCase('e', 800000),
    ];
    const params = calculatorParams({ equityAmount: 0 });

    const recommendation = recommend(params, cases);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.reasoning).toBeDefined();
    const reasoning = recommendation!.reasoning!;

    expect(reasoning.some((sentence) => sentence.startsWith('Break-even'))).toBe(true);
    expect(reasoning.some((sentence) => sentence.startsWith('Kumulierter Cashflow'))).toBe(true);
    // No equity ⇒ equityIrr is null ⇒ no EK-Rendite sentence anywhere.
    expect(reasoning.some((sentence) => sentence.startsWith('Eigenkapitalrendite'))).toBe(false);

    if (recommendation!.excludedTitles.length > 0) {
      expect(reasoning.some((sentence) => sentence.includes('entfällt'))).toBe(true);
    }
    // Deduplication: two excluded measures with the same title must produce
    // one "(2×)" sentence, not two identical ones.
    const measureSentences = reasoning.filter((sentence) => sentence.includes('Neue Bodenbeläge (Parkett/Vinyl)'));
    expect(measureSentences.length).toBeLessThanOrEqual(1);
    if (measureSentences.length === 1 && recommendation!.excludedTitles.filter((t) => t === 'Neue Bodenbeläge (Parkett/Vinyl)').length === 2) {
      expect(measureSentences[0]).toContain('(2×)');
    }
  });

  it('picks NO_MODERNIZATION when none of the planned measures are profitable (SCRUM-96)', () => {
    // Deliberately expensive, low-return measures: costs the modernization
    // never earns back within the Betrachtungszeitraum, so dropping the
    // whole plan must win over every time-based/selection goal.
    // A single, deliberately absurd measure: no exclusion subset or
    // re-placement can ever make it earn back 5.000.000 € within the
    // Betrachtungszeitraum, so "exclude everything" is the true optimum —
    // not an artifact of cap-room interaction between several measures.
    const cases = [renovationCase('a', 5_000_000)];
    const params = calculatorParams();

    const recommendation = recommend(params, cases);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.chosenGoal).toBe('NO_MODERNIZATION');
    expect(recommendation!.excludedModernizationIds).toEqual(['a']);
    expect(recommendation!.reasoning).toBeDefined();
    expect(recommendation!.reasoning![0]).toBe('Rein finanziell lohnt sich keine der geplanten Maßnahmen im Betrachtungszeitraum.');
  });

  it('does not pick NO_MODERNIZATION when a measure is profitable (SCRUM-96)', () => {
    // Same "worth it" fixture as metrics.test.ts: a modest modernization that
    // pays off within a 30-year Betrachtungszeitraum when the landlord never
    // raises rent via §558.
    const cases = [renovationCase('a', 3000)];
    const params = calculatorParams({ monthlyRentStart: 500, livingAreaM2: 100, rentIncreaseUtilizationPercent: 0, viewPeriodYears: 30 });

    const recommendation = recommend(params, cases);
    expect(recommendation).not.toBeNull();
    expect(recommendation!.chosenGoal).not.toBe('NO_MODERNIZATION');
  });

  it('measures recommend() runtime for 4 planned measures (report timing, no hard perf assertion beyond the timeout)', () => {
    const cases = [renovationCase('a', 8000), renovationCase('b', 15000), renovationCase('c', 25000), renovationCase('d', 45000)];
    const params = calculatorParams({ equityAmount: 30000 });

    const startedAt = performance.now();
    const recommendation = recommend(params, cases);
    const durationMs = performance.now() - startedAt;

    console.log(`recommend() with 4 planned measures took ${durationMs.toFixed(0)} ms`);
    expect(recommendation).not.toBeNull();
    // No hard wall-clock assertion here: machine speed varies (CI runners can be
    // several times slower than local), and the global `testTimeout` already guards against runaway/hanging runs.
  });
});
