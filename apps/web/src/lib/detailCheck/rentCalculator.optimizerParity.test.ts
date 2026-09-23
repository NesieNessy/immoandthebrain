import { describe, expect, it } from 'vitest';
import { runRentCalculator, type CalculatorParams } from './rentCalculator';
import type { RenovationCase } from './renovation';
import fixture from './__fixtures__/realWorkflowSnapshot.json';
import expected from './__fixtures__/realWorkflowSnapshot.optimized.expected.json';

/**
 * Golden snapshot of the modernization optimizer on a real workflow, frozen
 * before its objective became pluggable (SCRUM-96). The refactor must leave
 * the default objective's result bit-identical.
 */
describe('optimizer — parity with the frozen pre-registry result', () => {
  it('reproduces the optimized plan, break-even and ending cashflow', () => {
    const params: CalculatorParams = {
      ...(fixture.params as unknown as CalculatorParams),
      placementMode: 'OPTIMIZED',
      mode: 'KNOWN',
      modernizationPlacements: undefined,
      rentIncreasePlan: undefined,
      rentIncreaseOverrides: undefined,
    };
    const result = runRentCalculator(params, fixture.renovationCases as unknown as RenovationCase[]);
    expect(result.modernizationPlan).toEqual(expected.modernizationPlan);
    expect(result.breakEven).toBe(expected.breakEven);
    expect(result.metrics.endingCashflow).toBe(expected.endingCashflow);
  }, 120_000);
});
