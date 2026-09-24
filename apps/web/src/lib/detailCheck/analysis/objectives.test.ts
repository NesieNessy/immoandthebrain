import { describe, expect, it } from 'vitest';
import { compareScores, EARLIEST_BREAK_EVEN, FASTEST_POSITIVE_CASHFLOW, MAX_RENT_IN_VIEW, OBJECTIVES, type ScoredPlan } from './objectives';

const plan = (breakEvenOffset: number, endingCashflow: number, sustainablyPositiveOffset: number): ScoredPlan =>
  ({ breakEvenOffset, endingCashflow, sustainablyPositiveOffset, rentSumInView: 0 });

describe('compareScores', () => {
  it('decides on the first differing position', () => {
    expect(compareScores([1, 9], [2, 0])).toBeLessThan(0);
    expect(compareScores([2, 0], [1, 9])).toBeGreaterThan(0);
  });

  it('falls through to the next position on a tie', () => {
    expect(compareScores([1, 3], [1, 5])).toBeLessThan(0);
    expect(compareScores([1, 5], [1, 5])).toBe(0);
  });

  it('never yields NaN when scores contain Infinity', () => {
    expect(compareScores([Infinity, 1], [Infinity, 1])).toBe(0);
    expect(compareScores([Infinity, 1], [Infinity, 2])).toBeLessThan(0);
    expect(compareScores([Infinity, 2], [Infinity, 1])).toBeGreaterThan(0);
    expect(compareScores([-Infinity, 1], [-Infinity, 1])).toBe(0);
  });
});

describe('EARLIEST_BREAK_EVEN', () => {
  it('prefers the earlier break-even, then the higher ending cashflow', () => {
    const sorted = [plan(24, 900, 0), plan(12, 100, 0), plan(12, 500, 0)]
      .sort((a, b) => compareScores(EARLIEST_BREAK_EVEN.score(a), EARLIEST_BREAK_EVEN.score(b)));
    expect(sorted).toEqual([plan(12, 500, 0), plan(12, 100, 0), plan(24, 900, 0)]);
  });

  it('matches the optimizer\'s former comparator exactly', () => {
    const plans = [plan(24, 900, 0), plan(12, 100, 0), plan(12, 500, 0), plan(9999, -Infinity, 0)];
    const former = [...plans].sort((a, b) => a.breakEvenOffset - b.breakEvenOffset || b.endingCashflow - a.endingCashflow);
    const registry = [...plans].sort((a, b) => compareScores(EARLIEST_BREAK_EVEN.score(a), EARLIEST_BREAK_EVEN.score(b)));
    expect(registry).toEqual(former);
  });
});

describe('FASTEST_POSITIVE_CASHFLOW', () => {
  it('prefers the earlier sustainably positive month, then the higher ending cashflow', () => {
    const sorted = [plan(0, 900, 30), plan(0, 100, 10), plan(0, 500, 10)]
      .sort((a, b) => compareScores(FASTEST_POSITIVE_CASHFLOW.score(a), FASTEST_POSITIVE_CASHFLOW.score(b)));
    expect(sorted).toEqual([plan(0, 500, 10), plan(0, 100, 10), plan(0, 900, 30)]);
  });
});

describe('OBJECTIVES', () => {
  it('registers every objective under its own id', () => {
    for (const [id, objective] of Object.entries(OBJECTIVES)) expect(objective.id).toBe(id);
  });

  it('registers all three goals', () => {
    expect(Object.keys(OBJECTIVES).sort()).toEqual(['EARLIEST_BREAK_EVEN', 'FASTEST_POSITIVE_CASHFLOW', 'MAX_RENT_IN_VIEW']);
  });
});

describe('MAX_RENT_IN_VIEW', () => {
  it('prefers more rent in the view period, then earlier break-even', () => {
    const more = { breakEvenOffset: 50, endingCashflow: 0, sustainablyPositiveOffset: 0, rentSumInView: 200000 };
    const less = { breakEvenOffset: 10, endingCashflow: 0, sustainablyPositiveOffset: 0, rentSumInView: 199000 };
    expect(compareScores(MAX_RENT_IN_VIEW.score(more), MAX_RENT_IN_VIEW.score(less))).toBe(-1);
    const tieEarlier = { ...more, breakEvenOffset: 40 };
    expect(compareScores(MAX_RENT_IN_VIEW.score(tieEarlier), MAX_RENT_IN_VIEW.score(more))).toBe(-1);
  });
});
