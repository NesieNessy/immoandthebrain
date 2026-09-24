import { DEFAULT_RENT_INDEX_GROWTH_PERCENT, runRentCalculator, type CalculatorParams, type RentTimelineRow } from '../rentCalculator';
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

/**
 * Vom Betrachtungszeitraum unabhängiger, teurer Teil je Maßnahme: die
 * "ohne"-Rechnung über den vollen Zeitstrahl plus die daraus abgeleitete
 * Δ-Serie. Wird von `measureEconomics` mit der billigen Kürzung auf B
 * kombiniert und in der UI auf [result, params, cases] memoisiert.
 */
export type MeasureDelta = {
  id: string;
  title: string;
  costs: number;
  monthlyDelta: number;
  capUsePercent: number;
  paymentMonth: string;
  /** Δ(t) = CF_mit(t) − CF_ohne(t) über den vollen Zeitstrahl. */
  deltaSeries: number[];
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

/**
 * Teurer Teil: Δ(t) = CF_mit(t) − CF_ohne(t) je geplanter Maßnahme über den
 * vollen Zeitstrahl, unabhängig vom Betrachtungszeitraum B. `result` ist die
 * bereits vorliegende "mit"-Rechnung — sie wird hier nicht erneut berechnet,
 * nur je Maßnahme einmal ohne sie neu gerechnet.
 */
export function measureDeltas(result: RentCalculatorResult, params: CalculatorParams, cases: RenovationCase[]): MeasureDelta[] {
  const excluded = params.excludedModernizationIds ?? [];
  return result.modernizationPlan.map((item) => {
    const without = runRentCalculator({ ...params, excludedModernizationIds: [...excluded, item.id] }, cases).timeline;
    const deltaSeries = result.timeline.map((row, index) => round2(row.cumulativeCashflow - without[index].cumulativeCashflow));
    return {
      id: item.id,
      title: item.title,
      costs: item.allocableCosts,
      monthlyDelta: item.monthlyDelta,
      capUsePercent: result.capAbs > 0 ? round2((item.monthlyDelta / result.capAbs) * 100) : 0,
      paymentMonth: item.paymentYyyymm,
      deltaSeries,
    };
  });
}

/** Billige Kürzung der vollen Δ-Serien auf den Betrachtungszeitraum B; lohnt sich ⟺ Δ(B) ≥ 0. */
export function sliceMeasureEconomics(deltas: MeasureDelta[], result: RentCalculatorResult, viewPeriodYears: number): MeasureEconomics[] {
  const end = Math.min(viewEndIndex(viewPeriodYears), result.timeline.length - 1);
  return deltas.map((item) => {
    const delta = item.deltaSeries.slice(0, end + 1);
    const paybackIndex = delta.findIndex((value, index) => result.timeline[index].yyyymm > item.paymentMonth && value >= 0);
    const deltaAtViewEnd = delta[end] ?? 0;
    return {
      id: item.id,
      title: item.title,
      costs: item.costs,
      monthlyDelta: item.monthlyDelta,
      capUsePercent: item.capUsePercent,
      paymentMonth: item.paymentMonth,
      deltaAtViewEnd,
      worthIt: deltaAtViewEnd >= 0,
      paybackMonth: paybackIndex < 0 ? null : result.timeline[paybackIndex].yyyymm,
      delta,
    };
  });
}

/** Δ(t) = CF_mit(t) − CF_ohne(t) je geplanter Maßnahme; lohnt sich ⟺ Δ(B) ≥ 0. */
export function measureEconomics(
  result: RentCalculatorResult,
  params: CalculatorParams,
  cases: RenovationCase[],
  viewPeriodYears: number,
): MeasureEconomics[] {
  return sliceMeasureEconomics(measureDeltas(result, params, cases), result, viewPeriodYears);
}

/** Restschuld = Darlehen − Σ(Annuität − Zins) über die ersten `months` Monate; nie negativ. */
export function remainingDebt(result: RentCalculatorResult, months: number): number {
  const loanAmount = result.params.loanAmount ?? 0;
  const principal = result.timeline
    .slice(0, months)
    .reduce((sum, row) => sum + (row.debtService - row.interest), 0);
  return Math.max(0, round2(loanAmount - principal));
}

/** Endwert am Ende von B: Kaufpreis mit g fortgeschrieben, abzüglich Restschuld. */
export function terminalValue(result: RentCalculatorResult, viewPeriodYears: number): number {
  const g = result.params.rentIndexGrowthPercent ?? DEFAULT_RENT_INDEX_GROWTH_PERCENT;
  const purchasePrice = result.params.purchasePrice ?? 0;
  const grownPrice = purchasePrice * Math.pow(1 + g / 100, viewPeriodYears);
  const months = viewEndIndex(viewPeriodYears) + 1;
  return round2(grownPrice - remainingDebt(result, months));
}

/**
 * NPV der monatlichen Cashflows (inkl. Endwert im letzten Monat von B) bei
 * gegebenem Monatszins `monthlyRate`, mit Einsatz von −equityAmount zu t=0.
 */
function npvAt(result: RentCalculatorResult, viewPeriodYears: number, equity: number, monthlyRate: number): number {
  const end = viewEndIndex(viewPeriodYears);
  const timeline = result.timeline.slice(0, end + 1);
  const terminal = terminalValue(result, viewPeriodYears);
  let npv = -equity;
  timeline.forEach((row, index) => {
    npv += row.afterTaxCashflow / Math.pow(1 + monthlyRate, index + 1);
  });
  npv += terminal / Math.pow(1 + monthlyRate, timeline.length);
  return npv;
}

/**
 * EK-Rendite (IRR p.a.) über B, unabhängig vom Schalter „Eigenkapital
 * berücksichtigen": −equityAmount zu Beginn, monatliche afterTaxCashflow-
 * Zahlungen, plus Endwert im letzten Monat von B. Bisektion auf den
 * Monatszins in [-0.99, 1]; null wenn EK ≤ 0 oder kein Vorzeichenwechsel.
 */
export function equityIrr(result: RentCalculatorResult, viewPeriodYears: number): number | null {
  const equity = result.params.equityAmount ?? 0;
  if (equity <= 0) return null;

  let low = -0.99;
  let high = 1;
  const npvLow = npvAt(result, viewPeriodYears, equity, low);
  const npvHigh = npvAt(result, viewPeriodYears, equity, high);
  if ((npvLow > 0 && npvHigh > 0) || (npvLow < 0 && npvHigh < 0)) return null;

  let mid = 0;
  let npvMid = npvAt(result, viewPeriodYears, equity, mid);
  for (let i = 0; i < 200 && Math.abs(npvMid) >= 0.01; i += 1) {
    mid = (low + high) / 2;
    npvMid = npvAt(result, viewPeriodYears, equity, mid);
    if ((npvMid > 0) === (npvLow > 0)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.pow(1 + mid, 12) - 1;
}

/**
 * ROI = (CF_mit(B) − CF_ohne(B)) / Σ allocableCosts des Plans; null wenn die
 * Investition 0 ist.
 */
export function planRoi(withPlan: RentCalculatorResult, withoutAny: RentCalculatorResult, viewPeriodYears: number): number | null {
  const invest = withPlan.modernizationPlan.reduce((sum, item) => sum + item.allocableCosts, 0);
  if (invest === 0) return null;
  const end = viewEndIndex(viewPeriodYears);
  const delta = withPlan.timeline[end].cumulativeCashflow - withoutAny.timeline[end].cumulativeCashflow;
  return delta / invest;
}
