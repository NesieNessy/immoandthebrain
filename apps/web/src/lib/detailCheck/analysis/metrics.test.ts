import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import {
  breakEvenFacts,
  equityIrr,
  equityPayback,
  measureEconomics,
  planRoi,
  remainingDebt,
  terminalValue,
  totalPayback,
  viewEndIndex,
} from './metrics';

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

  it('measure economics: Δ = with − without, not worth it within B (observed behaviour)', () => {
    const params = calculatorParams();
    const cases = [renovationCase('a', 10000)];
    const withResult = runRentCalculator(params, cases);
    const [row] = measureEconomics(withResult, params, cases, 15);
    const withPlan = withResult.timeline;
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases).timeline;
    const end = viewEndIndex(15);
    expect(row.id).toBe('a');
    const computedDelta = withPlan[end].cumulativeCashflow - without[end].cumulativeCashflow;
    expect(row.deltaAtViewEnd).toBeCloseTo(computedDelta, 2);
    expect(row.worthIt).toBe(false);
    expect(row.paybackMonth).toBeNull();
    expect(row.delta).toHaveLength(end + 1);
  });

  it('measure economics: a measure that pays off within B', () => {
    // A landlord who never raises rent via §558 (rentIncreaseUtilizationPercent: 0)
    // keeps the §559-Mehrmiete as a permanent income gap over the "without"
    // timeline, so a modest modernization (3.000 € for +20 €/Monat) eventually
    // recoups its cost within a 30-year Betrachtungszeitraum.
    const params = calculatorParams({ monthlyRentStart: 500, livingAreaM2: 100, rentIncreaseUtilizationPercent: 0 });
    const cases = [renovationCase('a', 3000)];
    const B = 30;
    const result = runRentCalculator(params, cases);
    const [row] = measureEconomics(result, params, cases, B);
    const withPlan = result.timeline;
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases).timeline;
    const end = viewEndIndex(B);
    const computedDelta = withPlan[end].cumulativeCashflow - without[end].cumulativeCashflow;

    expect(row.id).toBe('a');
    expect(row.deltaAtViewEnd).toBeCloseTo(computedDelta, 2);
    expect(row.worthIt).toBe(true);
    expect(row.worthIt).toBe(computedDelta >= 0);
    expect(row.paybackMonth).not.toBeNull();

    const paybackIndex = withPlan.findIndex((r) => r.yyyymm === row.paybackMonth);
    expect(row.paybackMonth! > row.paymentMonth).toBe(true);
    expect(row.delta[paybackIndex]).toBeGreaterThanOrEqual(0);
    expect(row.delta[paybackIndex - 1]).toBeLessThan(0);

    const plan = result.modernizationPlan.find((item) => item.id === 'a')!;
    expect(row.costs).toBe(plan.allocableCosts);
    expect(row.capUsePercent).toBeCloseTo((plan.monthlyDelta / result.capAbs) * 100, 2);
  });

  it('measure economics skips measures that are not in the plan (e.g. excluded)', () => {
    const params = calculatorParams({ excludedModernizationIds: ['a'] });
    const cases = [renovationCase('a', 10000)];
    const rows = measureEconomics(runRentCalculator(params, cases), params, cases, 15);
    expect(rows).toEqual([]);
  });
});

describe('equity IRR and ROI', () => {
  it('remainingDebt = loan − Σ(debtService − interest), not below zero', () => {
    const result = runRentCalculator(
      calculatorParams({ loanAmount: 100000, interestRate: 3, repaymentRate: 2, monthlyDebtService: (100000 * 0.05) / 12 }),
      [],
    );
    const principal = result.timeline.slice(0, 120).reduce((sum, row) => sum + row.debtService - row.interest, 0);
    expect(remainingDebt(result, 120)).toBeCloseTo(100000 - principal, 2);
  });

  it('remainingDebt does not go below zero once the loan is fully repaid', () => {
    // A large monthlyDebtService relative to the loan pays it off well within
    // 120 months; the fixture is tuned so Σ(debtService − interest) exceeds
    // loanAmount, which is what exercises the Math.max(0, …) floor.
    const result = runRentCalculator(
      calculatorParams({ loanAmount: 100000, interestRate: 3, repaymentRate: 2, monthlyDebtService: 5000 }),
      [],
    );
    expect(remainingDebt(result, 120)).toBe(0);
  });

  it('IRR solves NPV = 0 for the constructed cashflows', () => {
    const params = calculatorParams({ equityAmount: 50000, purchasePrice: 300000, rentIndexGrowthPercent: 2 });
    const result = runRentCalculator(params, []);
    const irr = equityIrr(result, 15)!;
    const monthly = Math.pow(1 + irr, 1 / 12) - 1;
    let npv = -50000;
    result.timeline.slice(0, 180).forEach((row, index) => {
      npv += row.afterTaxCashflow / Math.pow(1 + monthly, index + 1);
    });
    npv += terminalValue(result, 15) / Math.pow(1 + monthly, 180);
    expect(Math.abs(npv)).toBeLessThan(1);
  });

  it('terminal value uses purchase price grown by g minus remaining debt', () => {
    const result = runRentCalculator(calculatorParams({ purchasePrice: 300000, rentIndexGrowthPercent: 2 }), []);
    expect(terminalValue(result, 15)).toBeCloseTo(300000 * Math.pow(1.02, 15) - remainingDebt(result, 180), 2);
  });

  it('IRR is null without equity', () => {
    expect(equityIrr(runRentCalculator(calculatorParams({ equityAmount: 0 }), []), 15)).toBeNull();
  });

  it('IRR never returns NaN for mixed-sign cashflows, even at the extreme end of the search range', () => {
    // Task 2 review finding: bisecting the monthly rate down to -0.99 makes
    // 1/(1+rate)^180 overflow to Infinity, and Infinity combined with a
    // negative terminal value can produce NaN instead of null. A large loan
    // with a small debt service produces alternating-sign cashflows (heavy
    // interest early, positive afterTaxCashflow later) that exercise this.
    const params = calculatorParams({
      equityAmount: 20000,
      loanAmount: 280000,
      interestRate: 6,
      repaymentRate: 0.5,
      monthlyDebtService: 500,
      purchasePrice: 300000,
      rentIndexGrowthPercent: -50,
    });
    const result = runRentCalculator(params, []);
    const irr = equityIrr(result, 15);
    expect(irr === null || Number.isFinite(irr)).toBe(true);
    expect(Number.isNaN(irr)).toBe(false);
  });

  it('ROI = ΔCF(B) / investment, null without investment', () => {
    const params = calculatorParams();
    const cases = [renovationCase('a', 10000)];
    const withPlan = runRentCalculator(params, cases);
    const without = runRentCalculator({ ...params, excludedModernizationIds: ['a'] }, cases);
    const invest = withPlan.modernizationPlan.reduce((sum, row) => sum + row.allocableCosts, 0);
    expect(planRoi(withPlan, without, 15)).toBeCloseTo(
      (withPlan.timeline[179].cumulativeCashflow - without.timeline[179].cumulativeCashflow) / invest,
      6,
    );
    expect(planRoi(without, without, 15)).toBeNull();
  });
});
