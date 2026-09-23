import { describe, expect, it } from 'vitest';
import { addMonths, buildTimeline, CALCULATION_HORIZON_MONTHS, runRentCalculator, type CalculatorParams } from './rentCalculator';
import type { RenovationCase } from './renovation';
import fixture from './__fixtures__/realWorkflowSnapshot.json';
import { calculatorParams } from './testFixtures';

/** Reference computed the slow, obvious way from the materialized timeline. */
function fromTimeline(rows: { afterTaxCashflow: number }[]): number {
  let lastNegative = -1;
  rows.forEach((row, offset) => { if (row.afterTaxCashflow < 0) lastNegative = offset; });
  return lastNegative + 1;
}

describe('sustainably positive cashflow', () => {
  const params = fixture.params as unknown as CalculatorParams;
  const cases = fixture.renovationCases as unknown as RenovationCase[];

  it('matches the materialized timeline on a real workflow', () => {
    const result = runRentCalculator(params, cases);
    const offset = fromTimeline(result.timeline);
    expect(result.sustainablyPositiveFrom).toBe(offset < CALCULATION_HORIZON_MONTHS ? addMonths(params.startYyyymm, offset) : null);
  });

  it('is identical with and without materializing the timeline (the optimizer uses the latter)', () => {
    const result = runRentCalculator(params, cases);
    const withRows = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan, true);
    const withoutRows = buildTimeline(params, result.increases558, result.increases558WithRentIndex, result.modernizationPlan, false);
    expect(withoutRows.timeline).toHaveLength(0);
    expect(withoutRows.sustainablyPositiveOffset).toBe(withRows.sustainablyPositiveOffset);
    expect(withRows.sustainablyPositiveOffset).toBe(fromTimeline(withRows.timeline));
  });

  it('is the first month when the cashflow is never negative', () => {
    const result = runRentCalculator(calculatorParams(), []);
    expect(result.sustainablyPositiveFrom).toBe('2026-01');
  });

  it('is null when the cashflow is still negative in the last month', () => {
    const result = runRentCalculator(calculatorParams({ monthlyDebtService: 5000, loanAmount: 5_000_000, interestRate: 1 }), []);
    expect(result.sustainablyPositiveFrom).toBeNull();
  });
});
