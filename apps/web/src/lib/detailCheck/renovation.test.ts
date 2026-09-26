import { describe, expect, it } from 'vitest';
import { indicatePriceRange } from '@/lib/renovation/catalog';
import {
  aggregateRenovationPricing,
  costForCase,
  distributeTotalAcrossCases,
  evaluateRenovationCases,
  sumSelectedCosts,
  withDefaultSelectedCosts,
  type RenovationCase,
} from './renovation';
import { renovationCase } from './testFixtures';

/**
 * Pins down the Sanierungskosten pricing model this session rebuilt — it used
 * to have exactly one user-controllable number (the total), recomputed
 * proportionally on every save via `allocateSelectedRenovationCosts`. That
 * silently discarded any individually entered amount on the next toggle of a
 * checkbox (Finding 1/2 from the bug report). The fix made per-measure
 * `cost_selected` authoritative and the total derived from it — verified only
 * manually in the browser at the time; these tests make that permanent.
 */

describe('evaluateRenovationCases', () => {
  const unpriced: RenovationCase = {
    id: 'a',
    kategorie: 'SANITAER',
    massnahme: 'Badsanierung komplett',
    selected: true,
    zeitpunkt: 'SOFORT',
    publish_order: false,
  };

  it('prices each case with the shared catalog indication (region factor + living area)', () => {
    const context = { regionFactor: 1.2, livingAreaM2: 75 };
    const [evaluated] = evaluateRenovationCases({ cases: [unpriced], ...context });
    const expected = indicatePriceRange('SANITAER', 'Badsanierung komplett', context);
    expect(evaluated.ai).toMatchObject({ price_min: expected.min, price_max: expected.max, source: 'FALLBACK' });
    expect(evaluated.ai?.summary).toContain('Badsanierung komplett');
  });

  it('re-prices from scratch, ignoring an indication the client sent along', () => {
    const tampered = { ...unpriced, ai: { summary: 'x', price_min: 1, price_max: 2, confidence: 1, source: 'AI' as const } };
    const [evaluated] = evaluateRenovationCases({ cases: [tampered] });
    expect(evaluated.ai?.price_min).toBe(12000);
    expect(evaluated.ai?.price_max).toBe(28000);
  });

  it('keeps the user’s choices (selection, timing, publish, amount) untouched', () => {
    const chosen = { ...unpriced, selected: false, zeitpunkt: 'FLEXIBEL' as const, publish_order: true, cost_selected: 15000 };
    const [evaluated] = evaluateRenovationCases({ cases: [chosen] });
    expect(evaluated).toMatchObject({ selected: false, zeitpunkt: 'FLEXIBEL', publish_order: true, cost_selected: 15000 });
  });
});

describe('withDefaultSelectedCosts', () => {
  it('defaults an unpriced case to the midpoint of its indicated range', () => {
    const cases: RenovationCase[] = [{
      id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false,
      ai: { summary: '', price_min: 1000, price_max: 3000, confidence: 1, source: 'FALLBACK' },
    }];
    const [result] = withDefaultSelectedCosts(cases);
    expect(result.cost_selected).toBe(2000);
  });

  it('never overwrites an already-set cost_selected', () => {
    const cases = [renovationCase('a', 1000, { cost_selected: 4200 })];
    const [result] = withDefaultSelectedCosts(cases);
    expect(result.cost_selected).toBe(4200);
  });
});

describe('sumSelectedCosts', () => {
  it('sums only ticked cases', () => {
    const cases = [
      renovationCase('a', 1000),
      renovationCase('b', 2000, { selected: false }),
      renovationCase('c', 500),
    ];
    expect(sumSelectedCosts(cases)).toBe(1500);
  });

  it('is unaffected by toggling selection off and back on — the amount survives', () => {
    // This is the exact regression from the bug report: untick, the total
    // drops, but the individual amount must not be reset to 0; re-ticking
    // must bring the original total back exactly.
    const cases = [renovationCase('a', 1000), renovationCase('b', 2000)];
    const before = sumSelectedCosts(cases);

    const unticked = cases.map((item) => (item.id === 'b' ? { ...item, selected: false } : item));
    expect(sumSelectedCosts(unticked)).toBe(1000);
    expect(unticked.find((item) => item.id === 'b')?.cost_selected).toBe(2000); // amount preserved

    const reticked = unticked.map((item) => (item.id === 'b' ? { ...item, selected: true } : item));
    expect(sumSelectedCosts(reticked)).toBe(before);
  });
});

describe('distributeTotalAcrossCases', () => {
  it('lands exactly on each case price_min at the low end of the range', () => {
    const cases: RenovationCase[] = [{
      id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false,
      ai: { summary: '', price_min: 1000, price_max: 3000, confidence: 1, source: 'FALLBACK' },
    }];
    const [result] = distributeTotalAcrossCases(cases, 1000);
    expect(result.cost_selected).toBe(1000);
  });

  it('lands exactly on each case price_max at the high end of the range', () => {
    const cases: RenovationCase[] = [{
      id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false,
      ai: { summary: '', price_min: 1000, price_max: 3000, confidence: 1, source: 'FALLBACK' },
    }];
    const [result] = distributeTotalAcrossCases(cases, 3000);
    expect(result.cost_selected).toBe(3000);
  });

  it('produces a total that matches what was asked for, across multiple cases', () => {
    const cases: RenovationCase[] = [
      { id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false, ai: { summary: '', price_min: 1800, price_max: 7000, confidence: 1, source: 'FALLBACK' } },
      { id: 'b', kategorie: 'ENERGETISCH', massnahme: 'B', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false, ai: { summary: '', price_min: 18000, price_max: 42000, confidence: 1, source: 'FALLBACK' } },
    ];
    const result = distributeTotalAcrossCases(cases, 40000);
    expect(sumSelectedCosts(result)).toBeCloseTo(40000, 2);
  });

  it('leaves unselected cases untouched', () => {
    const cases = [renovationCase('a', 1000), renovationCase('b', 2000, { selected: false })];
    const result = distributeTotalAcrossCases(cases, 500);
    expect(result.find((item) => item.id === 'b')?.cost_selected).toBe(2000);
  });
});

describe('costForCase', () => {
  it('prefers cost_selected over the indicated midpoint', () => {
    expect(costForCase(renovationCase('a', 1000, { cost_selected: 1500 }))).toBe(1500);
  });

  it('falls back to the midpoint when cost_selected is absent', () => {
    const item: RenovationCase = {
      id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false,
      ai: { summary: '', price_min: 1000, price_max: 3000, confidence: 1, source: 'FALLBACK' },
    };
    expect(costForCase(item)).toBe(2000);
  });
});

describe('aggregateRenovationPricing', () => {
  it('sums price_min and price_max across selected cases only', () => {
    const cases: RenovationCase[] = [
      { id: 'a', kategorie: 'ENERGETISCH', massnahme: 'A', selected: true, zeitpunkt: 'FLEXIBEL', publish_order: false, ai: { summary: '', price_min: 1000, price_max: 2000, confidence: 1, source: 'FALLBACK' } },
      { id: 'b', kategorie: 'ENERGETISCH', massnahme: 'B', selected: false, zeitpunkt: 'FLEXIBEL', publish_order: false, ai: { summary: '', price_min: 5000, price_max: 9000, confidence: 1, source: 'FALLBACK' } },
    ];
    const totals = aggregateRenovationPricing(cases);
    expect(totals.sum_min).toBe(1000);
    expect(totals.sum_max).toBe(2000);
    expect(totals.sum_mid).toBe(1500);
  });
});
