import { describe, expect, it } from 'vitest';
import { addMonths, preProjection558, runRentCalculator } from './rentCalculator';
import { calculatorParams, monthIndex, renovationCase } from './testFixtures';

/**
 * Pins down the six statutory rules from the §558/§559 rule sheet the
 * calculator implements. These were previously checked with throwaway scripts
 * during development (see git history around the Kappungsgrenze and
 * same-month-collision fixes) — this file makes that verification permanent so
 * a future change can't silently reintroduce either bug.
 */

describe('§558 — Sperrfrist (12 Monate Verlangen / 15 Monate Wirksamkeit)', () => {
  it('never places two increases closer together than the configured interval', () => {
    const result = runRentCalculator(calculatorParams({ rentIncreaseIntervalMonths: 15 }), []);
    const dates = result.increases558WithRentIndex.map((item) => item.effectiveYyyymm);
    expect(dates.length).toBeGreaterThan(3);
    for (let i = 1; i < dates.length; i += 1) {
      expect(monthIndex(dates[i]) - monthIndex(dates[i - 1])).toBeGreaterThanOrEqual(15);
    }
  });

  it('respects a custom interval, not just the 15-month default', () => {
    const result = runRentCalculator(calculatorParams({ rentIncreaseIntervalMonths: 27 }), []);
    const dates = result.increases558WithRentIndex.map((item) => item.effectiveYyyymm);
    for (let i = 1; i < dates.length; i += 1) {
      expect(monthIndex(dates[i]) - monthIndex(dates[i - 1])).toBeGreaterThanOrEqual(27);
    }
  });
});

describe('§558 Abs. 3 — Kappungsgrenze (20 % / 15 % je drei Jahre)', () => {
  it('stays at exactly 20 % of the rent at each rolling window start, not the year-one rent', () => {
    // A regression test for a real bug: the ceiling used to be computed as
    // 20 % of monthlyRentStart for the entire 50-year horizon, so once the
    // rent had grown the effective ceiling silently shrank (11 % after twelve
    // years in the case that surfaced this). It must scale with the window.
    const result = runRentCalculator(calculatorParams({ city: 'Musterstadt' }), []);
    const inc = result.increases558WithRentIndex;

    let rent = 1000;
    for (let windowStart = 0; windowStart < 4; windowStart += 1) {
      const from = `${2026 + windowStart * 3}-01`;
      const to = `${2026 + (windowStart + 1) * 3}-01`;
      const raisedInWindow = inc
        .filter((item) => item.effectiveYyyymm >= from && item.effectiveYyyymm < to)
        .reduce((sum, item) => sum + item.monthlyDelta, 0);
      expect(raisedInWindow / rent).toBeCloseTo(0.2, 2);
      rent += raisedInWindow;
    }
  });

  it('uses 15 % instead of 20 % in a dense-market city', () => {
    const normal = runRentCalculator(calculatorParams({ city: 'Musterstadt' }), []);
    const dense = runRentCalculator(calculatorParams({ city: 'Berlin' }), []);
    const sumThroughYearThree = (increases: { effectiveYyyymm: string; monthlyDelta: number }[]) => increases
      .filter((item) => item.effectiveYyyymm < '2029-01')
      .reduce((sum, item) => sum + item.monthlyDelta, 0);

    expect(sumThroughYearThree(normal.increases558WithRentIndex)).toBeCloseTo(200, 0);
    expect(sumThroughYearThree(dense.increases558WithRentIndex)).toBeCloseTo(150, 0);
  });
});

describe('§559 — Modernisierungsumlage (8 % der Kosten pro Jahr)', () => {
  it('caps the monthly increase at exactly 8 % of allocable costs per year', () => {
    const result = runRentCalculator(calculatorParams(), [renovationCase('m1', 30000)]);
    const [plan] = result.modernizationPlan;
    expect(plan).toBeDefined();
    expect(plan.monthlyDelta).toBeCloseTo((0.08 * 30000) / 12, 2);
  });
});

describe('§559 — Kappung (3 €/m², 2 €/m² unter 7 €/m² Miete, über 6 Jahre)', () => {
  it('caps at 3 €/m² when the rent is at or above 7 €/m²', () => {
    // 1000 € / 100 m² = 10 €/m² → above the 7 €/m² threshold.
    const result = runRentCalculator(calculatorParams({ monthlyRentStart: 1000 }), [renovationCase('m1', 900000)]);
    expect(result.capPerM2).toBe(3);
    expect(result.capAbs).toBeCloseTo(300, 2); // 3 €/m² × 100 m²
    const total = result.modernizationPlan.reduce((sum, item) => sum + item.monthlyDelta, 0);
    expect(total).toBeLessThanOrEqual(300.01);
  });

  it('caps at 2 €/m² when the rent is below 7 €/m²', () => {
    // 600 € / 100 m² = 6 €/m² → below the threshold.
    const result = runRentCalculator(calculatorParams({ monthlyRentStart: 600 }), [renovationCase('m1', 900000)]);
    expect(result.capPerM2).toBe(2);
    expect(result.capAbs).toBeCloseTo(200, 2);
  });
});

describe('§558 und §559 dürfen nicht im selben Monat wirksam werden', () => {
  it('never schedules a §558 increase on a month a §559 modernization already occupies', () => {
    // A small modernization (leaves headroom instead of crowding out every
    // §558 slot) and a low comparison rent (so §558 increases are frequent
    // enough to actually collide with the fixed §559 months) reproduce the
    // conditions the original bug needed 8 of 118 tested placements to surface.
    const params = calculatorParams({ rentIndexPerM2: 14 });
    let collisions = 0;

    for (let offset = 3; offset <= 120; offset += 1) {
      const target = addMonths('2026-01', offset);
      const result = runRentCalculator(
        { ...params, modernizationPlacements: { m1: target } },
        [renovationCase('m1', 1500)],
      );
      const occupied559Months = new Set(result.modernizationPlan.map((item) => item.effectiveYyyymm));
      collisions += result.increases558WithRentIndex.filter((item) => occupied559Months.has(item.effectiveYyyymm)).length;
    }

    expect(collisions).toBe(0);
  });
});

describe('Übergreifend: Konsistenz der Zeitreihe', () => {
  it('produces a timeline covering the full calculation horizon', () => {
    const result = runRentCalculator(calculatorParams(), [renovationCase('m1', 20000)]);
    expect(result.timeline).toHaveLength(600); // CALCULATION_HORIZON_MONTHS
  });

  it('is deterministic: identical params produce an identical result', () => {
    const params = calculatorParams();
    const cases = [renovationCase('m1', 20000)];
    const a = runRentCalculator(params, cases);
    const b = runRentCalculator(params, cases);
    expect(a).toEqual(b);
  });
});

describe('§558 Abs. 3 — increase before the purchase counts in the window', () => {
  // 1.000 € → 1.200 € in 2024-11, fourteen months before the 2026-01 start.
  // Non-dense market (Musterstadt), so the cap is 20 %.
  const params = calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11', last558RentBefore: 1000 });

  it('waits until the pre-purchase increase has left the three-year window', () => {
    const [first] = runRentCalculator(params, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2027-11', 240]);
  });

  it('applies the same window to a manually moved increase', () => {
    const moved = { ...params, rentIncreaseOverrides: { '558-1': { effectiveYyyymm: '2026-06', monthlyDelta: 240 } } };
    const [first] = runRentCalculator(moved, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2027-11', 240]);
  });

  it('keeps today\'s behaviour when the rent before the increase is unknown', () => {
    const unknown = calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11' });
    const [first] = runRentCalculator(unknown, []).increases558WithRentIndex;
    expect([first.effectiveYyyymm, first.monthlyDelta]).toEqual(['2026-02', 240]);
  });
});

describe('preProjection558', () => {
  it('is the difference between the current rent and the rent before the increase', () => {
    expect(preProjection558(calculatorParams({ monthlyRentStart: 1200, last558Date: '2024-11', last558RentBefore: 1000 })))
      .toEqual({ effectiveYyyymm: '2024-11', monthlyDelta: 200 });
  });

  it('excludes a §559 increase that took effect after it, since §559 is outside the Kappungsgrenze', () => {
    expect(preProjection558(calculatorParams({
      monthlyRentStart: 1300, last558Date: '2024-11', last558RentBefore: 1000,
      last559Date: '2025-06', last559MonthlyDelta: 100,
    }))).toEqual({ effectiveYyyymm: '2024-11', monthlyDelta: 200 });
  });

  it('is null without a date, without the previous rent, or without an actual increase', () => {
    expect(preProjection558(calculatorParams({ last558RentBefore: 900 }))).toBeNull();
    expect(preProjection558(calculatorParams({ last558Date: '2024-11' }))).toBeNull();
    expect(preProjection558(calculatorParams({ monthlyRentStart: 1000, last558Date: '2024-11', last558RentBefore: 1000 }))).toBeNull();
  });

  it('is null when the increase takes effect after the projection start, since monthlyRentStart does not include it yet', () => {
    // startYyyymm defaults to 2026-01; an increase effective 2026-06 lies after it.
    expect(preProjection558(calculatorParams({ monthlyRentStart: 1200, last558Date: '2026-06', last558RentBefore: 1000 })))
      .toBeNull();
  });
});
