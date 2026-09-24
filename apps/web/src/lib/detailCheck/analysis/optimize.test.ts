import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { keyFigures, runOptimization } from './optimize';

const cases = [renovationCase('a', 10000), renovationCase('b', 20000)];

describe('runOptimization', () => {
  it('returns null outside KNOWN mode or without planned measures', () => {
    expect(runOptimization(calculatorParams({ mode: 'POTENTIAL' }), cases, 'EARLIEST_BREAK_EVEN')).toBeNull();
    expect(runOptimization(calculatorParams(), [], 'EARLIEST_BREAK_EVEN')).toBeNull();
  });

  it('placements reproduce the optimized plan when fed back as fixed placements', () => {
    const params = calculatorParams();
    const proposal = runOptimization(params, cases, 'EARLIEST_BREAK_EVEN')!;
    const optimized = runRentCalculator({ ...params, placementMode: 'OPTIMIZED', modernizationPlacements: undefined }, cases);
    const replay = runRentCalculator({ ...params, modernizationPlacements: proposal.placements }, cases);
    expect(replay.modernizationPlan.map((row) => row.effectiveYyyymm)).toEqual(optimized.modernizationPlan.map((row) => row.effectiveYyyymm));
    expect(proposal.after).toEqual(keyFigures(replay, 15));
  });

  it('before reflects the current plan and changes list only moved measures', () => {
    const params = calculatorParams();
    const proposal = runOptimization(params, cases, 'MAX_RENT_IN_VIEW')!;
    expect(proposal.before).toEqual(keyFigures(runRentCalculator(params, cases), 15));
    expect(proposal.goal).toBe('MAX_RENT_IN_VIEW');
    for (const change of proposal.changes) expect(change.from).not.toBe(change.to);
    expect(proposal.changes.every((change) => proposal.placements[change.id] === change.to)).toBe(true);
  });

  it('keyFigures reads B from viewPeriodYears', () => {
    const result = runRentCalculator(calculatorParams(), cases);
    const figures = keyFigures(result, 10);
    expect(figures.cashflowAtViewEnd).toBe(result.timeline[119].cumulativeCashflow);
    expect(figures.rentSumInView).toBeCloseTo(result.timeline.slice(0, 120).reduce((sum, row) => sum + row.income, 0), 2);
  });
});
