import {
  DEFAULT_RENT_INDEX_GROWTH_PERCENT,
  DEFAULT_VIEW_PERIOD_YEARS,
  normalizeYyyymm,
  type CalculatorMode,
  type CalculatorParams,
  type PlacementMode,
  type RentIndexSource,
} from './rentCalculator';
import type { RenovationCase, RenovationTiming } from './renovation';
import type { InterestPeriodYears } from './financing';
import { parseDecimalInput, roundCurrency } from './acquisitionCosts';
import { estimateRentIndexPerM2 } from './rentIndex';

/**
 * Pure normalization rules for building `CalculatorParams`, shared between the
 * server (`/api/detail-check/calculator`) and, once the calculation moves into
 * the browser, the client. Every function here is a straight extraction from
 * that API route — behavior is unchanged, only the location.
 *
 * This module exists so both sides can call the exact same code instead of
 * two hand-written copies drifting apart. Keep it that way: never duplicate
 * one of these back into a call site "just this once."
 */

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toMode(value: unknown): CalculatorMode {
  return value === 'POTENTIAL' ? 'POTENTIAL' : 'KNOWN';
}

export function toPlacementMode(value: unknown): PlacementMode {
  return value === 'OPTIMIZED' ? 'OPTIMIZED' : 'DEFAULT';
}

export function toInterestYears(value: unknown): InterestPeriodYears {
  const parsed = Number(value);
  return parsed === 15 || parsed === 20 ? parsed : 10;
}

export function safeCases(value: unknown): RenovationCase[] {
  return Array.isArray(value) ? value as RenovationCase[] : [];
}

/**
 * Clamps to the 0–42 % continuous band, or the fixed 45 % "Reichensteuer"
 * bracket for anything requested above 42 %. Mirrors `snapTaxPercent` in the
 * calculator page's drag logic — that one applies hysteresis for pointer
 * dragging, this one is the one-shot version for a value coming from storage
 * or a request body.
 */
export function normalizeTaxRate(value: unknown, fallback = 0.42): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(0, parsed);
  if (clamped > 0.42) return 0.45;
  return Math.min(0.42, clamped);
}

/**
 * Accepts a yyyy-mm string only if it names a month within the last
 * `previousYears` years (inclusive) up to the current year — a date entered
 * for "last rent increase" that turned out to be from a decade ago, or in the
 * future, is treated as not set rather than fed into the legal-rule math.
 */
export function normalizeRecentMonth(value: unknown, previousYears: number): string | null {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const currentYear = new Date().getFullYear();
  return year >= currentYear - previousYears && year <= currentYear ? value : null;
}

/** §558 Abs. 1 Satz 1 BGB bounds this at 15 months minimum; 60 is a sane UI ceiling, not a legal one. */
export function normalizeRentIncreaseIntervalMonths(value: unknown): number {
  return Math.max(15, Math.min(60, Math.round(toNumber(value) || 15)));
}

/** How much of the legally permitted increase to actually take, as a percentage; defaults to using it in full. */
export function normalizeRentIncreaseUtilizationPercent(value: unknown): number {
  return Math.max(0, Math.min(100, value == null ? 100 : toNumber(value)));
}

/** UI-level sanity bound on an interest rate override — not a legal limit, just guards against fat-fingered input. */
export function clampInterestRate(value: number): number {
  return Math.max(0, Math.min(25, value));
}

/** Monthly annuity debt service implied by a given rate, recomputed whenever the rate itself was overridden. */
export function recomputeMonthlyDebtService(loanAmount: number, interestRate: number, repaymentRate: number): number {
  return roundCurrency(loanAmount * ((interestRate + repaymentRate) / 100) / 12);
}

/** Parses a stored number or German-locale input text; NaN when empty or unreadable. */
function parseLooseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  if (!/^-?[\d.]*,?\d*$/.test(value.trim())) return Number.NaN;
  return parseDecimalInput(value);
}

/** Mietspiegel-Entwicklung in % p. a.; leer oder unlesbar = Standard 2 %, begrenzt auf −5 … 10. */
export function normalizeRentIndexGrowthPercent(value: unknown): number {
  const parsed = parseLooseNumber(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RENT_INDEX_GROWTH_PERCENT;
  return Math.max(-5, Math.min(10, parsed));
}

/** Miete vor der letzten §558-Erhöhung — nur sinnvoll, wenn deren Datum gesetzt ist. */
export function normalizeLast558RentBefore(value: unknown, last558Date: string | null): number | null {
  if (!last558Date) return null;
  const parsed = parseLooseNumber(value);
  return Number.isFinite(parsed) && parsed > 0 ? roundCurrency(parsed) : null;
}

/** Betrachtungszeitraum in ganzen Jahren, 5 … 50, Standard 15. */
export function normalizeViewPeriodYears(value: unknown): number {
  const parsed = Number(value);
  if (value == null || value === '' || !Number.isFinite(parsed)) return DEFAULT_VIEW_PERIOD_YEARS;
  return Math.max(5, Math.min(50, Math.round(parsed)));
}

/** Every value the Mietkalkulator's Gantt/sliders can commit — the plan editor's payload shape. */
export type CalculatorOverrides = {
  modernizationPlacements: Record<string, string>;
  modernizationCostOverrides: Record<string, number>;
  renovationTimingOverrides: Record<string, RenovationTiming>;
  /** Optional so existing object literals in the calculator page stay valid. */
  excludedModernizationIds?: string[];
  rentIncreaseOverrides: Record<string, { effectiveYyyymm?: string; monthlyDelta?: number }>;
  financingInterestRateOverride: number | null;
  interestRateOverride: number | null;
  equityIncluded: boolean;
  taxRate?: number;
  taxableLossesOffsettable?: boolean;
};

/**
 * Reconstructs the override set from a server response's `params`, used both
 * to seed the page's `pendingOverrides` on load and to re-align it with
 * confirmed server state after every save (the server may itself clamp a
 * requested value — a §558 date past the legal window, for instance — so the
 * saved figure is not always byte-identical to what was requested).
 */
export function overridesFromParams(params: CalculatorParams): CalculatorOverrides {
  return {
    modernizationPlacements: params.modernizationPlacements ?? {},
    modernizationCostOverrides: params.modernizationCostOverrides ?? {},
    renovationTimingOverrides: params.renovationTimingOverrides ?? {},
    excludedModernizationIds: params.excludedModernizationIds ?? [],
    rentIncreaseOverrides: params.rentIncreaseOverrides ?? {},
    financingInterestRateOverride: params.financingInterestRateOverride ?? null,
    interestRateOverride: params.interestRateOverride ?? null,
    equityIncluded: params.equityIncluded === true,
    taxRate: params.taxRate,
    taxableLossesOffsettable: params.taxableLossesOffsettable === true,
  };
}

/**
 * Rebuilds the exact POST body the calculator page's `recalc` would send for
 * a request whose every field equals the given (already server-normalized)
 * `params` — used to restore the calculator row to a prior server-confirmed
 * state (the "Änderungen verwerfen und weiter" flow) by writing that
 * snapshot straight back, with `apply: false` so upstream renovation/
 * financing tables are never touched.
 *
 * Reads only from `params` — never from any client-side form/override state —
 * so the result is exactly what the server produced for that snapshot,
 * regardless of what the user has typed since. `rentIndexPerM2` mirrors
 * `recalc`'s own AUTOMATIC/MANUAL branch: null unless the snapshot was
 * itself in MANUAL mode.
 */
export function buildRestoreRequestBody(
  params: CalculatorParams,
  quickCheckId: string | null,
  workflowId: string | null,
): Record<string, unknown> {
  return {
    quickCheckId,
    workflowId,
    startYyyymm: params.startYyyymm,
    monthlyRentStart: params.monthlyRentStart,
    rentIndexPerM2: params.rentIndexSource === 'AUTOMATIC' ? null : params.rentIndexPerM2,
    rentIndexSource: params.rentIndexSource,
    last558Date: params.last558Date ?? null,
    last558RentBefore: params.last558Date ? params.last558RentBefore ?? null : null,
    rentIndexGrowthPercent: params.rentIndexGrowthPercent ?? null,
    viewPeriodYears: params.viewPeriodYears ?? DEFAULT_VIEW_PERIOD_YEARS,
    last559Date: params.last559Date ?? null,
    last559MonthlyDelta: params.last559MonthlyDelta,
    rentIncreaseIntervalMonths: params.rentIncreaseIntervalMonths,
    rentIncreaseUtilizationPercent: params.rentIncreaseUtilizationPercent,
    mode: params.mode,
    optimize: false,
    financingInterestRateOverride: params.financingInterestRateOverride ?? null,
    interestRateOverride: params.interestRateOverride ?? null,
    equityIncluded: params.equityIncluded === true,
    taxRate: params.taxRate ?? 0.42,
    taxableLossesOffsettable: params.taxableLossesOffsettable === true,
    modernizationPlacements: params.modernizationPlacements ?? {},
    modernizationCostOverrides: params.modernizationCostOverrides ?? {},
    renovationTimingOverrides: params.renovationTimingOverrides ?? {},
    excludedModernizationIds: params.excludedModernizationIds ?? [],
    resetRentIncreasePlan: false,
    rentIncreaseOverrides: params.rentIncreaseOverrides ?? {},
    apply: false,
  };
}

/** The Parameter panel's editable fields, in the same string/number shape the page's form state holds them in. */
export type CalculatorParameterFields = {
  startYyyymm: string;
  last558Date: string;
  last559Date: string;
  /** Raw decimal-input text (German "1.234,56" style), not yet parsed. */
  last559MonthlyDelta: string;
  /** Raw decimal-input text; ignored unless `rentIndexSource` is `'MANUAL'`. */
  rentIndexPerM2: string;
  rentIndexSource: RentIndexSource;
  rentIncreaseIntervalMonths: number;
  rentIncreaseUtilizationPercent: number;
  mode: CalculatorMode;
  /** Raw decimal-input text, % p. a.; empty = default 2 %. */
  rentIndexGrowthPercent: string;
  /** Raw decimal-input text, €/Monat; ignored unless `last558Date` is set. */
  last558RentBefore: string;
  viewPeriodYears: number;
};

/**
 * Builds a full `CalculatorParams` ready for `runRentCalculator`, from the
 * same three ingredients the API route's POST handler combines: the last
 * server-confirmed params (as the source of every upstream/context-derived
 * number — loan amount, AfA, purchase price, and so on, all already resolved
 * there), the Parameter panel's current field values, and the pending
 * Gantt/slider overrides.
 *
 * This is the ONE place that logic exists. The API route and the browser's
 * live preview both call it, so a preview can never compute something the
 * server wouldn't also compute — verified in
 * calculatorParamNormalization.test.ts against real captured server output,
 * and in rentCalculator.parity.test.ts end-to-end.
 *
 * `baseParams.interestRate`/`.loanAmount`/`.monthlyDebtService`/etc. stand in
 * for the API route's separately-loaded `context` object: whenever no
 * override is active they already equal exactly what a fresh `context` load
 * would produce, and whenever one is active they already reflect it — so
 * there is nothing left for a separate context fetch to contribute here.
 */
export function buildEffectiveCalculatorParams(
  baseParams: CalculatorParams,
  fields: CalculatorParameterFields,
  overrides: CalculatorOverrides,
  options: {
    /** Interval or utilization changed since the plan was last saved: previously placed/overridden §558 rows no longer apply. */
    resetRentIncreasePlan: boolean;
    /** The last server-confirmed plan, providing stable ids for unmoved rows. */
    storedRentIncreasePlan: CalculatorParams['rentIncreasePlan'];
  },
): CalculatorParams {
  const requestedFinancingInterestRate = overrides.financingInterestRateOverride;
  const requestedInterestRate = overrides.interestRateOverride;
  const interestRate = requestedFinancingInterestRate == null
    ? baseParams.interestRate
    : clampInterestRate(requestedFinancingInterestRate);
  const refinancingInterestRate = requestedInterestRate == null
    ? baseParams.interestRate
    : clampInterestRate(requestedInterestRate);
  const monthlyDebtService = requestedFinancingInterestRate == null
    ? baseParams.monthlyDebtService
    : recomputeMonthlyDebtService(baseParams.loanAmount, interestRate, baseParams.repaymentRate);
  const last559Date = normalizeRecentMonth(fields.last559Date, 5);
  const last558Date = normalizeRecentMonth(fields.last558Date, 1);
  const useManualRentIndex = fields.rentIndexSource === 'MANUAL' && fields.rentIndexPerM2 != null && fields.rentIndexPerM2 !== '';

  return {
    // Matches the API route's own fallback exactly (today's month), rather
    // than an empty/invalid string reaching `runRentCalculator` — the page
    // additionally blocks saving on `startMonthError` while this is invalid,
    // but the live preview still has to render *something* meanwhile.
    startYyyymm: normalizeYyyymm(fields.startYyyymm, new Date().toISOString().slice(0, 7)),
    rentStartYyyymm: baseParams.rentStartYyyymm,
    monthlyRentStart: baseParams.monthlyRentStart,
    livingAreaM2: baseParams.livingAreaM2,
    yearOfConstruction: baseParams.yearOfConstruction,
    city: baseParams.city,
    postalCode: baseParams.postalCode,
    last558Date,
    last559Date,
    // `last559MonthlyDelta`/`rentIndexPerM2` are raw German-locale decimal
    // text ("1.234,56") straight from the input elements — parseDecimalInput
    // is what the page itself uses to turn that into a number before ever
    // sending it to the server, so it has to happen here too. Using
    // `toNumber`/`Number()` on the raw string would misread the German
    // thousands/decimal separators (e.g. "1,5" as 1, not 1.5).
    last559MonthlyDelta: last559Date ? Math.max(0, parseDecimalInput(fields.last559MonthlyDelta)) : 0,
    rentIncreaseIntervalMonths: normalizeRentIncreaseIntervalMonths(fields.rentIncreaseIntervalMonths),
    rentIncreaseUtilizationPercent: normalizeRentIncreaseUtilizationPercent(fields.rentIncreaseUtilizationPercent),
    rentIndexPerM2: useManualRentIndex
      ? parseDecimalInput(fields.rentIndexPerM2)
      : estimateRentIndexPerM2(baseParams.yearOfConstruction, baseParams.livingAreaM2),
    rentIndexSource: useManualRentIndex ? 'MANUAL' : 'AUTOMATIC',
    last558RentBefore: normalizeLast558RentBefore(fields.last558RentBefore, last558Date),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(fields.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(fields.viewPeriodYears),
    monthlyDebtService,
    loanAmount: baseParams.loanAmount,
    interestRate,
    repaymentRate: baseParams.repaymentRate,
    interestPeriodYears: baseParams.interestPeriodYears,
    monthlyAfa: baseParams.monthlyAfa,
    serviceChargesAllocable: baseParams.serviceChargesAllocable,
    serviceChargesNonAllocable: baseParams.serviceChargesNonAllocable,
    purchasePrice: baseParams.purchasePrice,
    totalInvestment: baseParams.totalInvestment,
    renovationFinancedAmount: baseParams.renovationFinancedAmount,
    taxRate: normalizeTaxRate(overrides.taxRate),
    taxableLossesOffsettable: overrides.taxableLossesOffsettable === true,
    equityAmount: baseParams.equityAmount,
    equityIncluded: overrides.equityIncluded === true,
    financingInterestRateOverride: requestedFinancingInterestRate,
    interestRateOverride: requestedInterestRate,
    refinancingInterestRate,
    modernizationPlacements: overrides.modernizationPlacements,
    modernizationCostOverrides: overrides.modernizationCostOverrides,
    renovationTimingOverrides: overrides.renovationTimingOverrides,
    excludedModernizationIds: overrides.excludedModernizationIds ?? [],
    rentIncreasePlan: options.resetRentIncreasePlan ? undefined : options.storedRentIncreasePlan,
    rentIncreaseOverrides: options.resetRentIncreasePlan ? undefined : overrides.rentIncreaseOverrides,
    mode: fields.mode,
    // The API route sets this to 'OPTIMIZED' only for the one response to an
    // explicit "Optimieren" request — every ordinary save (a drag, a
    // Parameter edit) sends 'DEFAULT' again, even immediately after. That is
    // safe because once the optimizer has run, its chosen placements are
    // already baked into `overrides.modernizationPlacements`, and
    // `runRentCalculator` only re-invokes the optimizer when placements are
    // absent — so this never re-triggers it, it just mirrors what the next
    // ordinary save will actually send.
    placementMode: 'DEFAULT',
  };
}
