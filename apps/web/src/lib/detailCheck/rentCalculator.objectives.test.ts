import { describe, expect, it } from 'vitest';
import { buildTimeline, runRentCalculator } from './rentCalculator';
import { calculatorParams, renovationCase } from './testFixtures';

const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];
const optimized = (overrides = {}) => calculatorParams({ placementMode: 'OPTIMIZED', ...overrides });

describe('optimizer objective selection', () => {
  it('EARLIEST_BREAK_EVEN explicitly equals the default', () => {
    const implicit = runRentCalculator(optimized(), cases);
    const explicit = runRentCalculator(optimized({ optimizationObjective: 'EARLIEST_BREAK_EVEN' }), cases);
    expect(explicit.modernizationPlan).toEqual(implicit.modernizationPlan);
  });

  it('is ignored when placements are fixed or placementMode is DEFAULT', () => {
    const base = runRentCalculator(calculatorParams(), cases);
    const withGoal = runRentCalculator(calculatorParams({ optimizationObjective: 'MAX_RENT_IN_VIEW' }), cases);
    expect(withGoal.modernizationPlan).toEqual(base.modernizationPlan);
  });

  it('MAX_RENT_IN_VIEW never yields less rent in B than the break-even optimum', () => {
    const sumInView = (params: ReturnType<typeof optimized>) => {
      const result = runRentCalculator(params, cases);
      return result.timeline.slice(0, 15 * 12).reduce((sum, row) => sum + row.rentTotal, 0);
    };
    expect(sumInView(optimized({ optimizationObjective: 'MAX_RENT_IN_VIEW' })))
      .toBeGreaterThanOrEqual(sumInView(optimized({ optimizationObjective: 'EARLIEST_BREAK_EVEN' })) - 0.01);
  });

  it('FASTEST_POSITIVE_CASHFLOW never reaches a lasting positive cashflow later than the break-even optimum', () => {
    const month = (goal: 'FASTEST_POSITIVE_CASHFLOW' | 'EARLIEST_BREAK_EVEN') =>
      runRentCalculator(optimized({ optimizationObjective: goal, monthlyDebtService: 900 }), cases).sustainablyPositiveFrom ?? '9999-12';
    expect(month('FASTEST_POSITIVE_CASHFLOW') <= month('EARLIEST_BREAK_EVEN')).toBe(true);
  });

  it('rentSumInView sums rentTotal over the view period', () => {
    const params = calculatorParams({ viewPeriodYears: 10 });
    const result = runRentCalculator(params, cases);
    const timeline = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan);
    const expected = result.timeline.slice(0, 120).reduce((sum, row) => sum + row.rentTotal, 0);
    expect(timeline.rentSumInView).toBeCloseTo(expected, 2);
  });
});
