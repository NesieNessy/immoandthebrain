import { describe, expect, it } from 'vitest';
import { runRentCalculator } from '../rentCalculator';
import { calculatorParams, renovationCase } from '../testFixtures';
import { buildAnalysisCards, dedupeTitles } from './cards';
import { viewEndIndex } from './metrics';

describe('dedupeTitles', () => {
  it('collapses repeated titles into one entry with a (N×) suffix, order-preserving', () => {
    expect(dedupeTitles(['Neue Fenster', 'Neue Bodenbeläge (Parkett/Vinyl)', 'Neue Bodenbeläge (Parkett/Vinyl)'])).toEqual([
      'Neue Fenster',
      'Neue Bodenbeläge (Parkett/Vinyl) (2×)',
    ]);
  });

  it('leaves unique titles untouched', () => {
    expect(dedupeTitles(['Neue Fenster', 'Dämmung'])).toEqual(['Neue Fenster', 'Dämmung']);
  });

  it('is a no-op on an empty list', () => {
    expect(dedupeTitles([])).toEqual([]);
  });
});

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

  it('produces no cards for optimierung use cases — those come from the optimization panel', () => {
    expect(build(['optimaler-zeitpunkt', 'mieterhoehungsstrategie', 'cashflow-optimierung'])).toEqual([]);
  });

  it('break-even card: in-range break-even yields a success verdict with a literal marker', () => {
    const [card] = build(['break-even'], 10);
    expect(card.series?.values).toHaveLength(viewEndIndex(10) + 1);
    expect(card.series?.markerIndex).toBe(0);
    expect(card.verdict).toEqual({ label: 'Im Betrachtungszeitraum', tone: 'success' });
  });

  it('break-even card: break-even after B yields a warning verdict with no marker', () => {
    const warnParams = calculatorParams({ equityIncluded: true, equityAmount: 5000000, monthlyDebtService: 900 });
    const warnResult = runRentCalculator(warnParams, []);
    const [card] = buildAnalysisCards({ selected: ['break-even'], result: warnResult, params: warnParams, cases: [], viewPeriodYears: 5 });
    expect(card.series?.markerIndex).toBeNull();
    expect(card.verdict).toEqual({ label: 'Nicht im Betrachtungszeitraum', tone: 'warning' });
  });

  it('amortisation card has an equity row and a total row', () => {
    const [card] = build(['amortisation']);
    expect(card.rows.map((row) => row.label)).toEqual(expect.arrayContaining(['Eigenkapital zurück', 'Gesamtinvestition zurück']));
  });

  it('wirtschaftlichkeit card: not-worth-it measure gets literal danger verdict and rows', () => {
    const cards = build(['wirtschaftlichkeit']);
    expect(cards).toHaveLength(result.modernizationPlan.length);
    const [card] = cards;
    expect(card.verdict).toEqual({ label: 'Lohnt sich nicht', tone: 'danger' });
    expect(card.rows).toEqual([
      { label: 'Kosten', value: '10.000 €' },
      { label: '§559-Mehrmiete', value: '67 € / Monat' },
      { label: 'Deckel ausgeschöpft', value: '22,2 %' },
      { label: 'Vorteil nach 15 Jahren', value: '-9.156 €' },
      { label: 'Amortisiert', value: 'nicht erreicht' },
    ]);
    expect(card.note).toBe('Ohne die Maßnahme holt die §558-Erhöhung die Miete später ebenfalls nach – der Vorteil ist nur zeitlich.');
  });

  it('wirtschaftlichkeit card: worth-it measure gets literal success verdict and rows', () => {
    const worthItParams = calculatorParams({ monthlyRentStart: 500, livingAreaM2: 100, rentIncreaseUtilizationPercent: 0 });
    const worthItCases = [renovationCase('a', 3000)];
    const worthItResult = runRentCalculator(worthItParams, worthItCases);
    const [card] = buildAnalysisCards({
      selected: ['wirtschaftlichkeit'],
      result: worthItResult,
      params: worthItParams,
      cases: worthItCases,
      viewPeriodYears: 30,
    });
    expect(card.verdict).toEqual({ label: 'Lohnt sich', tone: 'success' });
    expect(card.rows).toEqual([
      { label: 'Kosten', value: '3.000 €' },
      { label: '§559-Mehrmiete', value: '20 € / Monat' },
      { label: 'Deckel ausgeschöpft', value: '10 %' },
      { label: 'Vorteil nach 30 Jahren', value: '1.106 €' },
      { label: 'Amortisiert', value: '01/2048' },
    ]);
    expect(card.note).toBeUndefined();
  });

  it('wirtschaftlichkeit without planned measures yields one muted hint card', () => {
    const cards = buildAnalysisCards({ selected: ['wirtschaftlichkeit'], result: runRentCalculator(params, []), params, cases: [], viewPeriodYears: 15 });
    expect(cards).toHaveLength(1);
    expect(cards[0].verdict.tone).toBe('muted');
  });
});
