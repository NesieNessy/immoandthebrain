import type { CalculatorParams } from '../rentCalculator';
import type { RenovationCase } from '../renovation';
import { USE_CASES, isAvailable, type UseCaseId } from './catalog';
import {
  breakEvenFacts,
  equityPayback,
  measureEconomics,
  sliceMeasureEconomics,
  totalPayback,
  viewEndIndex,
  type MeasureDelta,
  type MeasureEconomics,
  type MonthPoint,
  type RentCalculatorResult,
} from './metrics';

export type CardVerdict = { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' };
export type CardRow = { label: string; value: string };
export type CardSeries = { values: number[]; markerIndex: number | null };
export type AnalysisCard = { id: string; title: string; verdict: CardVerdict; rows: CardRow[]; series: CardSeries | null; note?: string };

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Formats an amount as `de-DE` EUR without decimals. Shared with the optimization cards (AnalysisPanel). */
export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

/** `yyyy-mm` → `MM/YYYY`, or "nicht erreicht" for `null`. Shared with the optimization cards (AnalysisPanel). */
export function formatMonth(month: string | null): string {
  if (!month) return 'nicht erreicht';
  const [year, mm] = month.split('-');
  return `${mm}/${year}`;
}

function formatPoint(point: MonthPoint): string {
  if (!point.month) return 'nicht erreicht';
  const years = decimal.format(point.years ?? 0);
  return `${formatMonth(point.month)} (${years} ${years === '1' ? 'Jahr' : 'Jahre'})`;
}

function withinView(point: MonthPoint, viewPeriodYears: number): boolean {
  return point.years != null && point.years <= viewPeriodYears;
}

export function buildAnalysisCards(input: {
  selected: UseCaseId[];
  result: RentCalculatorResult;
  params: CalculatorParams;
  cases: RenovationCase[];
  viewPeriodYears: number;
  /**
   * Vorab berechnete, vom Betrachtungszeitraum unabhängige Δ-Serien je
   * Maßnahme (aus `measureDeltas`). Wenn übergeben, wird nur noch billig auf
   * B gekürzt statt `measureEconomics` erneut die "ohne"-Rechnungen laufen
   * zu lassen.
   */
  measures?: MeasureDelta[];
}): AnalysisCard[] {
  const { selected, result, params, cases, viewPeriodYears, measures } = input;
  const end = Math.min(viewEndIndex(viewPeriodYears), result.timeline.length - 1);
  const cumulative = result.timeline.slice(0, end + 1).map((row) => row.cumulativeCashflow);
  const cards: AnalysisCard[] = [];

  for (const useCase of USE_CASES) {
    if (!selected.includes(useCase.id) || !isAvailable(useCase) || useCase.group === 'optimierung') continue;

    if (useCase.id === 'break-even') {
      const facts = breakEvenFacts(result);
      const index = facts.month ? result.timeline.findIndex((row) => row.yyyymm === facts.month) : -1;
      const reached = withinView(facts, viewPeriodYears);
      cards.push({
        id: 'break-even',
        title: 'Break-even',
        verdict: reached ? { label: 'Im Betrachtungszeitraum', tone: 'success' } : { label: 'Nicht im Betrachtungszeitraum', tone: 'warning' },
        rows: [
          { label: 'Break-even', value: formatPoint(facts) },
          { label: 'Mit Mietspiegel', value: formatPoint(facts.withRentIndex) },
          { label: 'Tiefpunkt', value: `${currency.format(facts.troughAmount)} (${formatMonth(facts.troughMonth)})` },
        ],
        series: { values: cumulative, markerIndex: index >= 0 && index <= end ? index : null },
      });
    }

    if (useCase.id === 'amortisation') {
      const equity = equityPayback(result);
      const total = totalPayback(result);
      const equityReached = withinView(equity, viewPeriodYears);
      cards.push({
        id: 'amortisation',
        title: 'Amortisation',
        verdict: equityReached ? { label: 'Eigenkapital im Zeitraum zurück', tone: 'success' } : { label: 'Eigenkapital nicht im Zeitraum zurück', tone: 'warning' },
        rows: [
          { label: 'Eigenkapital zurück', value: formatPoint(equity) },
          { label: 'Gesamtinvestition zurück', value: formatPoint(total) },
          { label: 'Eigenkapital', value: currency.format(result.params.equityAmount ?? 0) },
          { label: 'Gesamtinvestition', value: currency.format(result.params.totalInvestment) },
        ],
        series: null,
        note: 'Gesamt: Miete abzüglich nicht umlagefähiger Kosten, Steuern und Modernisierung — ohne Zins und Tilgung.',
      });
    }

    if (useCase.id === 'wirtschaftlichkeit') {
      const measureRows: MeasureEconomics[] = measures
        ? sliceMeasureEconomics(measures, result, viewPeriodYears)
        : measureEconomics(result, params, cases, viewPeriodYears);
      if (measureRows.length === 0) {
        cards.push({ id: 'wirtschaftlichkeit', title: 'Wirtschaftlichkeit', verdict: { label: 'Keine Maßnahme geplant', tone: 'muted' }, rows: [], series: null });
      }
      for (const measure of measureRows) {
        cards.push({
          id: `wirtschaftlichkeit:${measure.id}`,
          title: `Wirtschaftlichkeit – ${measure.title}`,
          verdict: measure.worthIt ? { label: 'Lohnt sich', tone: 'success' } : { label: 'Lohnt sich nicht', tone: 'danger' },
          rows: [
            { label: 'Kosten', value: currency.format(measure.costs) },
            { label: '§559-Mehrmiete', value: `${currency.format(measure.monthlyDelta)} / Monat` },
            { label: 'Deckel ausgeschöpft', value: `${decimal.format(measure.capUsePercent)} %` },
            { label: `Vorteil nach ${viewPeriodYears} Jahren`, value: currency.format(measure.deltaAtViewEnd) },
            { label: 'Amortisiert', value: formatMonth(measure.paybackMonth) },
          ],
          series: { values: measure.delta, markerIndex: null },
          ...(measure.deltaAtViewEnd < 0
            ? { note: 'Ohne die Maßnahme holt die §558-Erhöhung die Miete später ebenfalls nach – der Vorteil ist nur zeitlich.' }
            : {}),
        });
      }
    }
  }
  return cards;
}
