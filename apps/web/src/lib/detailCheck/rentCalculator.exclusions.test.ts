import { describe, expect, it } from 'vitest';
import { runRentCalculator } from './rentCalculator';
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
