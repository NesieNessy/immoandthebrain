import { describe, expect, it } from 'vitest';
import { calculatorParams, renovationCase } from '../testFixtures';
import { runGoal, type OptimizationGoal } from './optimize';
import { recommend } from './recommend';

const CANDIDATE_GOALS: OptimizationGoal[] = ['EARLIEST_BREAK_EVEN', 'MAX_RENT_IN_VIEW', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_ROI', 'MAX_EQUITY_IRR'];

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
  }, 30000);

  it('measures recommend() runtime for 4 planned measures (report timing, no hard perf assertion beyond the timeout)', () => {
    const cases = [renovationCase('a', 8000), renovationCase('b', 15000), renovationCase('c', 25000), renovationCase('d', 45000)];
    const params = calculatorParams({ equityAmount: 30000 });

    const startedAt = performance.now();
    const recommendation = recommend(params, cases);
    const durationMs = performance.now() - startedAt;

    console.log(`recommend() with 4 planned measures took ${durationMs.toFixed(0)} ms`);
    expect(recommendation).not.toBeNull();
    expect(durationMs).toBeLessThan(60000);
  }, 60000);
});
