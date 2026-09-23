import { runRentCalculator, type CalculatorParams, type RentTimelineRow } from '../rentCalculator';
import type { RenovationCase } from '../renovation';

/**
 * Kennzahlen der Auswertungen (SCRUM-96, Schnitt 1). Reine Funktionen über
 * dem Ergebnis von runRentCalculator — keine eigene Rechenlogik für Miete,
 * Steuern oder Finanzierung.
 */

export type RentCalculatorResult = ReturnType<typeof runRentCalculator>;
export type MonthPoint = { month: string | null; years: number | null };
export type BreakEvenFacts = MonthPoint & { troughAmount: number; troughMonth: string | null; withRentIndex: MonthPoint };
export type MeasureEconomics = {
  id: string;
  title: string;
  costs: number;
  monthlyDelta: number;
  /** Anteil der §559-Mehrmiete am absoluten Deckel, in %. */
  capUsePercent: number;
  paymentMonth: string;
  deltaAtViewEnd: number;
  worthIt: boolean;
  paybackMonth: string | null;
  delta: number[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Index des letzten Monats im Betrachtungszeitraum. */
export function viewEndIndex(viewPeriodYears: number): number {
  return viewPeriodYears * 12 - 1;
}

function pointAt(timeline: RentTimelineRow[], index: number): MonthPoint {
  return index < 0 ? { month: null, years: null } : { month: timeline[index].yyyymm, years: (index + 1) / 12 };
}

function monthPoint(timeline: RentTimelineRow[], month: string | null): MonthPoint {
  return pointAt(timeline, month == null ? -1 : timeline.findIndex((row) => row.yyyymm === month));
}

/** Erster Index, an dem die laufende Summe von `step` die Zielgröße erreicht. */
function firstCumulativeReach(timeline: RentTimelineRow[], target: number, step: (row: RentTimelineRow) => number): number {
  let sum = 0;
  return timeline.findIndex((row) => (sum += step(row)) >= target);
}

export function breakEvenFacts(result: RentCalculatorResult): BreakEvenFacts {
  const { timeline } = result;
  let troughIndex = -1;
  timeline.forEach((row, index) => {
    if (troughIndex < 0 || row.cumulativeCashflow < timeline[troughIndex].cumulativeCashflow) troughIndex = index;
  });
  return {
    ...monthPoint(timeline, result.breakEven),
    troughAmount: troughIndex < 0 ? 0 : timeline[troughIndex].cumulativeCashflow,
    troughMonth: troughIndex < 0 ? null : timeline[troughIndex].yyyymm,
    withRentIndex: monthPoint(timeline, result.breakEvenWithRentIndex),
  };
}

/** Σ Cashflow nach Steuern ≥ eingesetztes Eigenkapital (unabhängig vom Schalter „Eigenkapital berücksichtigen"). */
export function equityPayback(result: RentCalculatorResult): MonthPoint {
  const equity = Math.max(0, result.params.equityAmount ?? 0);
  return pointAt(result.timeline, firstCumulativeReach(result.timeline, equity, (row) => row.afterTaxCashflow));
}

/** Σ (Miete − nicht umlagefähige Kosten − Steuern − Modernisierungszahlung) ≥ Gesamtinvestition; ohne Zins und Tilgung. */
export function totalPayback(result: RentCalculatorResult): MonthPoint {
  const target = Math.max(0, result.params.totalInvestment);
  return pointAt(
    result.timeline,
    firstCumulativeReach(result.timeline, target, (row) => row.rentTotal - row.nonAllocableCosts - row.taxes - row.renovationPayment),
  );
}

/** Δ(t) = CF_mit(t) − CF_ohne(t) je geplanter Maßnahme; lohnt sich ⟺ Δ(B) ≥ 0. */
export function measureEconomics(params: CalculatorParams, cases: RenovationCase[], viewPeriodYears: number): MeasureEconomics[] {
  const withResult = runRentCalculator(params, cases);
  const end = Math.min(viewEndIndex(viewPeriodYears), withResult.timeline.length - 1);
  const excluded = params.excludedModernizationIds ?? [];
  return withResult.modernizationPlan.map((item) => {
    const without = runRentCalculator({ ...params, excludedModernizationIds: [...excluded, item.id] }, cases).timeline;
    const delta = withResult.timeline
      .slice(0, end + 1)
      .map((row, index) => round2(row.cumulativeCashflow - without[index].cumulativeCashflow));
    const paybackIndex = delta.findIndex((value, index) => withResult.timeline[index].yyyymm > item.paymentYyyymm && value >= 0);
    const deltaAtViewEnd = delta[end] ?? 0;
    return {
      id: item.id,
      title: item.title,
      costs: item.allocableCosts,
      monthlyDelta: item.monthlyDelta,
      capUsePercent: withResult.capAbs > 0 ? round2((item.monthlyDelta / withResult.capAbs) * 100) : 0,
      paymentMonth: item.paymentYyyymm,
      deltaAtViewEnd,
      worthIt: deltaAtViewEnd >= 0,
      paybackMonth: paybackIndex < 0 ? null : withResult.timeline[paybackIndex].yyyymm,
      delta,
    };
  });
}
