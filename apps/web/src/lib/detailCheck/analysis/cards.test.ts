import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { buildAnalysisCards } from './cards';
import { viewEndIndex } from './metrics';

const params = calculatorParams({ equityAmount: 12000, totalInvestment: 120000 });
const cases = [renovationCase('a', 10000)];
const result = runRentCalculator(params, cases);
const build = (selected: Parameters<typeof buildAnalysisCards>[0]['selected'], viewPeriodYears = 15) =>
  buildAnalysisCards({ selected, result, params, cases, viewPeriodYears });

describe('analysis cards', () => {
  it('returns cards in catalog order, only for selected and available use cases', () => {
    expect(build(['wirtschaftlichkeit', 'break-even', 'kapitalrendite']).map((card) => card.id))
      .toEqual(['break-even', 'wirtschaftlichkeit:a']);
  });

  it('break-even card: series is the cumulative cashflow up to B, marker at break-even', () => {
    const [card] = build(['break-even'], 10);
    expect(card.series?.values).toHaveLength(viewEndIndex(10) + 1);
    const index = result.timeline.findIndex((row) => row.yyyymm === result.breakEven);
    expect(card.series?.markerIndex).toBe(index >= 0 && index <= viewEndIndex(10) ? index : null);
    expect(card.verdict.tone).toBe(index >= 0 && index <= viewEndIndex(10) ? 'success' : 'warning');
  });

  it('amortisation card has an equity row and a total row', () => {
    const [card] = build(['amortisation']);
    expect(card.rows.map((row) => row.label)).toEqual(expect.arrayContaining(['Eigenkapital zurück', 'Gesamtinvestition zurück']));
  });

  it('one wirtschaftlichkeit card per planned measure with verdict lohnt sich / lohnt sich nicht', () => {
    const cards = build(['wirtschaftlichkeit']);
    expect(cards).toHaveLength(result.modernizationPlan.length);
    for (const card of cards) expect(['Lohnt sich', 'Lohnt sich nicht']).toContain(card.verdict.label);
  });

  it('wirtschaftlichkeit without planned measures yields one muted hint card', () => {
    const cards = buildAnalysisCards({ selected: ['wirtschaftlichkeit'], result: runRentCalculator(params, []), params, cases: [], viewPeriodYears: 15 });
    expect(cards).toHaveLength(1);
    expect(cards[0].verdict.tone).toBe('muted');
  });
});
