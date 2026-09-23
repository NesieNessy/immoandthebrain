import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { breakEvenFacts, equityPayback, measureEconomics, totalPayback, viewEndIndex } from './metrics';

describe('analysis metrics', () => {
  it('viewEndIndex is the last month of B', () => {
    expect(viewEndIndex(15)).toBe(179);
  });

  it('break-even facts match the timeline and report the trough', () => {
    const result = runRentCalculator(calculatorParams({ equityIncluded: true, equityAmount: 50000 }), []);
    const facts = breakEvenFacts(result);
    expect(facts.month).toBe(result.breakEven);
    const trough = Math.min(...result.timeline.map((row) => row.cumulativeCashflow));
    expect(facts.troughAmount).toBe(trough);
    expect(facts.troughMonth).toBe(result.timeline.find((row) => row.cumulativeCashflow === trough)?.yyyymm);
    expect(facts.withRentIndex.month).toBe(result.breakEvenWithRentIndex);
  });

  it('equity payback: first month where the summed after-tax cashflow covers the equity', () => {
    const result = runRentCalculator(calculatorParams({ equityAmount: 12000 }), []);
    const payback = equityPayback(result);
    let sum = 0;
    const index = result.timeline.findIndex((row) => (sum += row.afterTaxCashflow) >= 12000);
    expect(payback.month).toBe(result.timeline[index].yyyymm);
    expect(payback.years).toBeCloseTo((index + 1) / 12, 5);
  });

  it('equity payback ignores the equityIncluded switch', () => {
    const a = equityPayback(runRentCalculator(calculatorParams({ equityAmount: 12000, equityIncluded: false }), []));
    const b = equityPayback(runRentCalculator(calculatorParams({ equityAmount: 12000, equityIncluded: true }), []));
    expect(a).toEqual(b);
  });

  it('total payback does not deduct debt service', () => {
    const noDebt = totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 120000 }), []));
    const withDebt = totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 120000, monthlyDebtService: 900 }), []));
    expect(withDebt.month).toBe(noDebt.month);
    expect(noDebt.month).not.toBeNull();
  });

  it('payback is null when never reached within the horizon', () => {
    expect(totalPayback(runRentCalculator(calculatorParams({ totalInvestment: 1e12 }), [])).month).toBeNull();
  });

  it('measure economics: Δ = with − without, verdict at the end of B', () => {
    const params = calculatorParams();
    const cases = [renovationCase('a', 10000)];
    const [row] = measureEconomics(params, cases, 15);
    const withPlan = runRentCalculator(params, cases).timeline;
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases).timeline;
    const end = viewEndIndex(15);
    expect(row.id).toBe('a');
    expect(row.deltaAtViewEnd).toBeCloseTo(withPlan[end].cumulativeCashflow - without[end].cumulativeCashflow, 2);
    expect(row.worthIt).toBe(row.deltaAtViewEnd >= 0);
    expect(row.delta).toHaveLength(end + 1);
    if (row.paybackMonth) expect(row.paybackMonth > row.paymentMonth).toBe(true);
  });

  it('measure economics skips measures that are not in the plan (e.g. excluded)', () => {
    const rows = measureEconomics(calculatorParams({ excludedModernizationIds: ['a'] }), [renovationCase('a', 10000)], 15);
    expect(rows).toEqual([]);
  });
});
