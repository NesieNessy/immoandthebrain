import { describe, expect, it } from 'vitest';
import { runRentCalculator } from './rentCalculator';
import { calculatorParams, renovationCase } from './testFixtures';

/**
 * SCRUM-96: break-even is the first month AFTER the last month with a
 * negative cumulative cashflow — not the first month that merely touches
 * >= 0 before dipping negative again (the old, buggy definition). Same for
 * the rent-index variant.
 */
describe('break-even (dauerhaft >= 0)', () => {
  it('is the month after a dip-then-recover pattern, not the first month that briefly touches >= 0', () => {
    // Month 0: pure rent, no costs yet → cumulative positive.
    // Month 1: a 5.000 € Sanierungszahlung dips the cumulative negative.
    // Months 2–3: still recovering, still negative.
    // Month 4 on: the resulting §559-Mehrmiete has pushed it back to >= 0
    // for good — this is where break-even must land, not month 0.
    const params = calculatorParams({
      monthlyRentStart: 1000,
      livingAreaM2: 100,
      taxRate: 0,
      rentIncreaseUtilizationPercent: 0,
      modernizationPlacements: { a: '2026-04' },
    });
    const cases = [renovationCase('a', 5000)];
    const result = runRentCalculator(params, cases);
    const rows = result.timeline;

    expect(rows[0].cumulativeCashflow).toBeGreaterThanOrEqual(0);
    expect(rows[1].cumulativeCashflow).toBeLessThan(0);
    expect(rows[2].cumulativeCashflow).toBeLessThan(0);
    expect(rows[3].cumulativeCashflow).toBeLessThan(0);
    expect(rows[4].cumulativeCashflow).toBeGreaterThanOrEqual(0);
    expect(rows.slice(4).every((row) => row.cumulativeCashflow >= 0)).toBe(true);

    expect(result.breakEven).toBe(rows[4].yyyymm);
    expect(result.breakEven).not.toBe(rows[0].yyyymm);
  });

  it('is the first month when the cumulative cashflow is never negative', () => {
    const result = runRentCalculator(calculatorParams(), []);
    expect(result.timeline.every((row) => row.cumulativeCashflow >= 0)).toBe(true);
    expect(result.breakEven).toBe('2026-01');
  });

  it('is null when the cumulative cashflow is still negative in the last horizon month', () => {
    const result = runRentCalculator(calculatorParams({ monthlyDebtService: 5000, loanAmount: 5_000_000, interestRate: 1 }), []);
    expect(result.timeline[result.timeline.length - 1].cumulativeCashflow).toBeLessThan(0);
    expect(result.breakEven).toBeNull();
  });

  it('the rent-index variant follows the same rule', () => {
    const params = calculatorParams({
      monthlyRentStart: 1000,
      livingAreaM2: 100,
      taxRate: 0,
      rentIncreaseUtilizationPercent: 0,
      modernizationPlacements: { a: '2026-04' },
    });
    const cases = [renovationCase('a', 5000)];
    const result = runRentCalculator(params, cases);
    expect(result.breakEvenWithRentIndex).not.toBeNull();
  });
});
