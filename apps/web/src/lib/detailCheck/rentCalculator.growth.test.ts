import { describe, expect, it } from 'vitest';
import { DEFAULT_RENT_INDEX_GROWTH_PERCENT, runRentCalculator } from './rentCalculator';
import { calculatorParams } from './testFixtures';

/**
 * The ortsübliche Vergleichsmiete used to grow by a hard-wired 2 % per year.
 * SCRUM-96 makes it a customer input; these tests pin that the default is
 * exactly the old behaviour and that the input actually drives the plan.
 *
 * rentIndexPerM2: 12 on 100 m² with a 10 €/m² start rent makes the rent index
 * (not the Kappungsgrenze) the binding ceiling after the first increase, so
 * growth is what decides whether and how much the rent can rise later.
 */
describe('rent-index growth (SCRUM-96)', () => {
  const base = calculatorParams({ rentIndexPerM2: 12 });

  it('defaults to 2 %', () => {
    expect(DEFAULT_RENT_INDEX_GROWTH_PERCENT).toBe(2);
  });

  it('omitting the input is bit-identical to an explicit 2 %', () => {
    const implicit = runRentCalculator(base, []);
    const explicit = runRentCalculator({ ...base, rentIndexGrowthPercent: 2 }, []);
    expect(explicit.increases558WithRentIndex).toEqual(implicit.increases558WithRentIndex);
    expect(explicit.increases558).toEqual(implicit.increases558);
    expect(explicit.metrics).toEqual(implicit.metrics);
  });

  it('at 0 % the rent reaches the frozen index once and never rises again', () => {
    const result = runRentCalculator({ ...base, rentIndexGrowthPercent: 0 }, []);
    // 12 €/m² × 100 m² = 1.200 € target; 1.000 € start; 20 % cap = 200 € — both bind at once.
    expect(result.increases558WithRentIndex.map((item) => [item.effectiveYyyymm, item.monthlyDelta]))
      .toEqual([['2027-04', 200]]);
  });

  it('a higher growth rate yields more total rent increases over the horizon', () => {
    const total = (growth: number) => runRentCalculator({ ...base, rentIndexGrowthPercent: growth }, [])
      .increases558WithRentIndex.reduce((sum, item) => sum + item.monthlyDelta, 0);
    expect(total(4)).toBeGreaterThan(total(2));
    expect(total(2)).toBeGreaterThan(total(0));
  });
});
