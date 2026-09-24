import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { equityIrr } from './metrics';
import { MAX_SELECTION_MEASURES, optimizeSelection } from './selection';

describe('optimizeSelection', () => {
  it('is null without planned measures', () => {
    expect(optimizeSelection(calculatorParams(), [], 'MAX_ROI')).toBeNull();
  });

  it('MAX_EQUITY_IRR reports noEquity instead of picking an arbitrary subset when equityAmount is 0 (browser-fix, SCRUM-96)', () => {
    // Reproduces the browser workflow bug: with no equity, equityIrr is null
    // for every candidate subset (it never depends on the plan), so stage 1's
    // tie-break must not silently keep whichever subset happens to sort
    // first.
    const cases = [renovationCase('a', 10000), renovationCase('b', 20000), renovationCase('c', 30000)];
    const params = calculatorParams({ equityAmount: 0 });
    expect(optimizeSelection(params, cases, 'MAX_EQUITY_IRR')).toEqual({ noEquity: true });
  });

  it('MAX_EQUITY_IRR also reports noEquity when equityAmount is unset', () => {
    const cases = [renovationCase('a', 10000)];
    const params = calculatorParams();
    expect(params.equityAmount).toBeUndefined();
    expect(optimizeSelection(params, cases, 'MAX_EQUITY_IRR')).toEqual({ noEquity: true });
  });

  it('reports tooMany above MAX_SELECTION_MEASURES planned measures', () => {
    const cases = Array.from({ length: MAX_SELECTION_MEASURES + 1 }, (_, index) => renovationCase(`m${index}`, 1000));
    expect(optimizeSelection(calculatorParams(), cases, 'MAX_ROI')).toEqual({ tooMany: true });
  });

  it('does not count already-excluded measures against the MAX_SELECTION_MEASURES limit', () => {
    // 10 planned measures means the stage-1 subset search runs 2^10 = 1024
    // full timeline calculations (see report: ~1 measure/s at this size), so
    // this needs a generous timeout — the brute-force nature of stage 1 is a
    // known, accepted cost for this task (see s4-task-3-report.md).
    const cases = Array.from({ length: MAX_SELECTION_MEASURES + 1 }, (_, index) => renovationCase(`m${index}`, 1000));
    const params = calculatorParams({ excludedModernizationIds: ['m0'] });
    expect(optimizeSelection(params, cases, 'MAX_ROI')).not.toEqual({ tooMany: true });
  });

  it('MAX_ROI excludes a measure that is constructed to be uneconomical', () => {
    const cases = [renovationCase('cheap', 5000), renovationCase('expensive', 500000)];
    const params = calculatorParams();
    const result = optimizeSelection(params, cases, 'MAX_ROI');
    expect(result).not.toBeNull();
    expect(result).not.toEqual({ tooMany: true });
    const selection = result as { excludedModernizationIds: string[]; placements: Record<string, string>; score: number };
    expect(selection.excludedModernizationIds).toContain('expensive');
    expect(selection.excludedModernizationIds).not.toContain('cheap');
  });

  it("stage 1's chosen score is at least the best of all seven non-empty subsets of three measures", () => {
    // Needs actual equity — with equityAmount 0/unset, MAX_EQUITY_IRR now
    // short-circuits to `{ noEquity: true }` (browser-fix, SCRUM-96; see the
    // dedicated noEquity tests above) instead of comparing scores at all.
    const cases = [renovationCase('a', 8000), renovationCase('b', 15000), renovationCase('c', 500000)];
    const params = calculatorParams({ equityAmount: 40000 });
    const result = optimizeSelection(params, cases, 'MAX_EQUITY_IRR');
    expect(result).not.toBeNull();
    expect(result).not.toEqual({ tooMany: true });
    const selection = result as { excludedModernizationIds: string[]; placements: Record<string, string>; score: number };

    const ids = ['a', 'b', 'c'];
    let bestStage1 = -Infinity;
    for (let mask = 1; mask < 8; mask += 1) {
      const keep = new Set(ids.filter((_, index) => (mask & (1 << index)) !== 0));
      const excluded = ids.filter((id) => !keep.has(id));
      const run = runRentCalculator({ ...params, excludedModernizationIds: excluded }, cases);
      const score = equityIrr(run, params.viewPeriodYears ?? 15) ?? -Infinity;
      bestStage1 = Math.max(bestStage1, score);
    }
    // Stage 2 (placement fine-tuning) can only improve on stage 1's own best subset's score,
    // so the final selection score must be at least as good as the best stage-1 subset score.
    expect(selection.score).toBeGreaterThanOrEqual(bestStage1 - 1e-6);
  });
});
