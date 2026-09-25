import { describe, expect, it } from 'vitest';
import { financingAfterExclusions, runRentCalculator } from './rentCalculator';
import { calculatorParams, renovationCase } from './testFixtures';

describe('excluded measures (SCRUM-96 selection proposals)', () => {
  const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];

  it('drops an excluded measure from the default plan', () => {
    const plan = runRentCalculator(calculatorParams({ excludedModernizationIds: ['b'] }), cases).modernizationPlan;
    expect(plan.map((item) => item.id)).toEqual(['a']);
  });

  it('drops an excluded measure from the optimized plan too', () => {
    const plan = runRentCalculator(calculatorParams({ placementMode: 'OPTIMIZED', excludedModernizationIds: ['b'] }), cases).modernizationPlan;
    expect(plan.map((item) => item.id)).toEqual(['a']);
  });

  it('excluding all modernization ids leaves nothing to place', () => {
    const plan = runRentCalculator(
      calculatorParams({ placementMode: 'OPTIMIZED', excludedModernizationIds: ['a', 'b'] }),
      cases,
    ).modernizationPlan;
    expect(plan).toEqual([]);
  });

  it('changes nothing when omitted or empty', () => {
    const none = runRentCalculator(calculatorParams(), cases).modernizationPlan;
    const empty = runRentCalculator(calculatorParams({ excludedModernizationIds: [] }), cases).modernizationPlan;
    expect(empty).toEqual(none);
    expect(none.map((item) => item.id).sort()).toEqual(['a', 'b']);
  });
});

describe('financing after exclusions', () => {
  const cases = [renovationCase('a', 10000), renovationCase('b', 30000)];
  const financed = calculatorParams({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000, renovationFinancedAmount: 20000 });

  it('reduces loan, debt service and total investment by the financed share of the excluded cost', () => {
    // f = 20000 / 40000 = 0.5 → excluding b (30000) removes 15000
    const adjusted = financingAfterExclusions({ ...financed, excludedModernizationIds: ['b'] }, cases);
    expect(adjusted.loanAmount).toBe(225000);
    expect(adjusted.totalInvestment).toBe(325000);
    expect(adjusted.monthlyDebtService).toBeCloseTo(1000 * 225000 / 240000, 2);
  });

  it('is a no-op without financed renovation or without exclusions', () => {
    expect(financingAfterExclusions({ ...financed, renovationFinancedAmount: 0, excludedModernizationIds: ['b'] }, cases))
      .toEqual({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000 });
    expect(financingAfterExclusions(financed, cases))
      .toEqual({ loanAmount: 240000, monthlyDebtService: 1000, totalInvestment: 340000 });
  });

  it('caps the financed share at 100 % and never goes below zero', () => {
    const adjusted = financingAfterExclusions({ ...financed, renovationFinancedAmount: 90000, loanAmount: 20000, excludedModernizationIds: ['a', 'b'] }, cases);
    expect(adjusted.loanAmount).toBe(0);
    expect(adjusted.monthlyDebtService).toBe(0);
  });

  it('runRentCalculator uses the adjusted financing only when something is excluded', () => {
    const withExclusion = runRentCalculator({ ...financed, excludedModernizationIds: ['b'] }, cases);
    expect(withExclusion.params.loanAmount).toBe(225000);
    const without = runRentCalculator(financed, cases);
    expect(without.params.loanAmount).toBe(240000);
  });
});
