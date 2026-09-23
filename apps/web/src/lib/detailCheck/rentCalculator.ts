import { roundCurrency } from './acquisitionCosts';
import { costForCase, type RenovationCase, type RenovationTiming } from './renovation';

export type CalculatorMode = 'KNOWN' | 'POTENTIAL';
export type PlacementMode = 'DEFAULT' | 'OPTIMIZED';
export type RentIndexSource = 'MANUAL' | 'AUTOMATIC';
export type RentIncreaseLegalBasis = '558' | '559';
export type RentIncreaseSourceType = 'RENT_INDEX' | 'RENOVATION' | 'MANUAL';

export type RentIncreasePlanRow = {
  id: string;
  legalBasis: RentIncreaseLegalBasis;
  sourceType: RentIncreaseSourceType;
  sourceId: string | null;
  sequenceNumber: number;
  effectiveYyyymm: string;
  monthlyAmount: number;
};

export const CALCULATION_HORIZON_YEARS = 50;
export const CALCULATION_HORIZON_MONTHS = CALCULATION_HORIZON_YEARS * 12;

/** The rent-index growth that used to be hard-wired; kept as the default so results do not move. */
export const DEFAULT_RENT_INDEX_GROWTH_PERCENT = 2;

/**
 * Growth factor of the rent index `offset` months into the projection. Stepped
 * yearly (Math.floor), exactly like the former hard-wired Math.pow(1.02, …):
 * with the default 2 %, `1 + 2 / 100` is bit-identical to 1.02.
 */
function rentIndexGrowthFactor(params: CalculatorParams, offset: number): number {
  const growth = params.rentIndexGrowthPercent;
  const percent = growth != null && Number.isFinite(growth) ? growth : DEFAULT_RENT_INDEX_GROWTH_PERCENT;
  return Math.pow(1 + percent / 100, Math.floor(offset / 12));
}

export type CalculatorParams = {
  startYyyymm: string;
  rentStartYyyymm: string;
  monthlyRentStart: number;
  livingAreaM2: number;
  yearOfConstruction: number;
  city: string;
  postalCode: string;
  last558Date: string | null;
  last559Date: string | null;
  last559MonthlyDelta: number;
  /**
   * Monthly rent before the last §558 increase (the one at last558Date).
   * Needed because §558 Abs. 3 measures the cap against the rent at the start
   * of the rolling three-year window — an increase shortly before purchase
   * uses up part of that window. Omitted = unknown, window counts only
   * increases inside the projection (the former behaviour).
   */
  last558RentBefore?: number | null;
  rentIncreaseIntervalMonths: number;
  rentIncreaseUtilizationPercent: number;
  rentIndexPerM2: number | null;
  rentIndexSource: RentIndexSource;
  /**
   * Annual growth of the ortsübliche Vergleichsmiete in percent, stepped once
   * per year. Omitted = DEFAULT_RENT_INDEX_GROWTH_PERCENT, the value that used
   * to be hard-wired.
   */
  rentIndexGrowthPercent?: number;
  monthlyDebtService: number;
  loanAmount: number;
  interestRate: number;
  repaymentRate: number;
  monthlyAfa: number;
  serviceChargesAllocable: number;
  serviceChargesNonAllocable: number;
  purchasePrice: number;
  totalInvestment: number;
  taxRate: number;
  taxableLossesOffsettable?: boolean;
  financingInterestRateOverride?: number | null;
  interestRateOverride?: number | null;
  interestPeriodYears?: number;
  refinancingInterestRate?: number | null;
  equityIncluded?: boolean;
  equityAmount?: number;
  modernizationPlacements?: Record<string, string>;
  modernizationCostOverrides?: Record<string, number>;
  renovationTimingOverrides?: Record<string, RenovationTiming>;
  rentIncreasePlan?: RentIncreasePlanRow[];
  rentIncreaseOverrides?: Record<string, { effectiveYyyymm?: string; monthlyDelta?: number }>;
  mode: CalculatorMode;
  placementMode: PlacementMode;
};

export type RentTimelineRow = {
  yyyymm: string;
  rentTotal: number;
  rentTotalWithRentIndex: number;
  delta558: number;
  delta559: number;
  renovationPayment: number;
  debtService: number;
  interest: number;
  afa: number;
  allocableCosts: number;
  nonAllocableCosts: number;
  taxes: number;
  taxableIncome: number;
  taxLossCarryforward: number;
  income: number;
  expenses: number;
  monthlyDelta: number;
  afterTaxCashflow: number;
  cumulativeIncome: number;
  cumulativeExpenses: number;
  cumulativeTaxes: number;
  cumulativeCashflowBeforeTax: number;
  cumulativeCashflow: number;
};

export type ModernizationPlanRow = {
  id: string;
  title: string;
  source: 'KNOWN' | 'POTENTIAL';
  paymentYyyymm: string;
  effectiveYyyymm: string;
  monthlyDelta: number;
  allocableCosts: number;
};

export type RentIncrease558Row = {
  id?: string;
  effectiveYyyymm: string;
  monthlyDelta: number;
  legalMaximum: number;
  sourceType: Extract<RentIncreaseSourceType, 'RENT_INDEX' | 'MANUAL'>;
  /**
   * Earliest month this increase could take effect, given everything that
   * constrains it: the waiting period after the previous increase, the
   * remaining Kappungsgrenze head-room, the distance still left to the
   * ortsübliche Vergleichsmiete, and §559 months that are already taken.
   *
   * Only the first of those is derivable in the UI; the rest depend on the
   * month-by-month simulation. Reporting it from here lets the planner grey
   * out exactly the range a bar cannot be dragged into, instead of guessing.
   */
  earliestYyyymm?: string;
};

export const DENSE_MARKET_CITIES = [
  'stuttgart', 'freiburg im breisgau', 'heidelberg', 'münchen', 'muenchen',
  'nürnberg', 'nuernberg', 'augsburg', 'berlin', 'potsdam', 'wildau', 'bremen',
  'hamburg', 'frankfurt am main', 'wiesbaden', 'rostock', 'hannover', 'göttingen',
  'goettingen', 'köln', 'koeln', 'düsseldorf', 'duesseldorf', 'mainz',
  'ludwigshafen', 'dresden', 'leipzig', 'erfurt', 'jena',
];

export function isDenseMarket(city?: string | null): boolean {
  return DENSE_MARKET_CITIES.includes((city ?? '').trim().toLowerCase());
}

export function normalizeYyyymm(value?: string | null, fallback?: string): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return fallback ?? new Date().toISOString().slice(0, 7);
}

export function addMonths(yyyymm: string, months: number): string {
  const [year, month] = yyyymm.split('-').map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const resultYear = Math.floor(monthIndex / 12);
  const resultMonth = monthIndex - resultYear * 12 + 1;
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}`;
}

function monthSerial(yyyymm: string): number {
  const [year, month] = yyyymm.split('-').map(Number);
  return year * 12 + month - 1;
}

function monthDiff(from: string, to: string): number {
  return monthSerial(to) - monthSerial(from);
}

function compareMonth(a: string, b: string): number {
  return monthDiff(b, a);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function capRoomAt(params: CalculatorParams, planned: ModernizationPlanRow[], effectiveYyyymm: string, capAbs: number): number {
  const previousDiff = params.last559Date ? monthDiff(params.last559Date, effectiveYyyymm) : -1;
  const previousUsed = previousDiff >= 0 && previousDiff < 72 ? Math.max(0, params.last559MonthlyDelta) : 0;
  const used = previousUsed + planned.reduce((sum, item) => {
    const diff = monthDiff(item.effectiveYyyymm, effectiveYyyymm);
    return diff >= 0 && diff < 72 ? sum + item.monthlyDelta : sum;
  }, 0);
  return roundCurrency(Math.max(0, capAbs - used));
}

function buildPlanFromPlacements(
  params: CalculatorParams,
  renovationCases: RenovationCase[],
  placements: number[],
  capAbs: number,
  source: 'KNOWN' | 'POTENTIAL' = 'KNOWN',
): ModernizationPlanRow[] {
  const relevant = renovationCases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.selected && item.ai)
    .sort((a, b) => (placements[a.index] ?? 0) - (placements[b.index] ?? 0) || a.index - b.index);
  const plan: ModernizationPlanRow[] = [];

  for (const { item, index } of relevant) {
    const allocableCosts = params.modernizationCostOverrides?.[item.id] != null
      ? roundCurrency(Math.max(0, params.modernizationCostOverrides[item.id]))
      : costForCase(item);
    const requestedOffset = placements[index] ?? 3;
    const effective = addMonths(params.startYyyymm, Math.max(3, requestedOffset));
    const wantedDelta = roundCurrency((0.08 * allocableCosts) / 12);
    const monthlyDelta = roundCurrency(Math.min(wantedDelta, capRoomAt(params, plan, effective, capAbs)));
    if (monthlyDelta <= 0) continue;
    plan.push({
      id: item.id,
      title: item.massnahme,
      source,
      paymentYyyymm: addMonths(effective, -2),
      effectiveYyyymm: effective,
      monthlyDelta,
      allocableCosts,
    });
  }

  return plan.sort((a, b) => a.effectiveYyyymm.localeCompare(b.effectiveYyyymm));
}

function defaultPlacements(params: CalculatorParams, renovationCases: RenovationCase[]): number[] {
  let nextFlexible = 6;

  return renovationCases.map((item) => {
    const timing = params.renovationTimingOverrides?.[item.id] ?? item.zeitpunkt;
    const savedOffset = item.calculator_effective_yyyymm
      ? monthDiff(params.startYyyymm, normalizeYyyymm(item.calculator_effective_yyyymm, params.startYyyymm))
      : null;
    const offset = savedOffset == null ? (timing === 'SOFORT' ? 3 : nextFlexible) : savedOffset;
    nextFlexible += 3;
    return Math.max(3, offset);
  });
}

function placeKnownModernizations(params: CalculatorParams, renovationCases: RenovationCase[], capAbs: number) {
  const defaults = defaultPlacements(params, renovationCases);
  const placements = renovationCases.map((item, index) => {
    const requested = params.modernizationPlacements?.[item.id];
    if (!requested) return defaults[index];
    return Math.max(3, monthDiff(params.startYyyymm, normalizeYyyymm(requested, params.startYyyymm)));
  });
  return buildPlanFromPlacements(params, renovationCases, placements, capAbs);
}

function placePotentialModernizations(params: CalculatorParams, capAbs: number) {
  const potentialCases: RenovationCase[] = [
    {
      id: 'potential-1',
      kategorie: 'WOHNWERT',
      massnahme: 'Potenzial 1',
      ai: { summary: '', price_min: 0, price_max: 0, confidence: 1, source: 'FALLBACK' },
      selected: true,
      zeitpunkt: 'SOFORT',
      publish_order: false,
    },
    {
      id: 'potential-2',
      kategorie: 'WOHNWERT',
      massnahme: 'Potenzial 2',
      ai: { summary: '', price_min: 0, price_max: 0, confidence: 1, source: 'FALLBACK' },
      selected: true,
      zeitpunkt: 'FLEXIBEL',
      publish_order: false,
    },
  ];
  const firstEffective = 3;
  const secondEffective = 75;
  const plan: ModernizationPlanRow[] = [];
  for (const [index, offset] of [firstEffective, secondEffective].entries()) {
    if (offset >= CALCULATION_HORIZON_MONTHS) continue;
    const room = capRoomAt(params, plan, addMonths(params.startYyyymm, offset), capAbs);
    if (room <= 0) continue;
    const effectiveYyyymm = addMonths(params.startYyyymm, offset);
    plan.push({
      id: potentialCases[index].id,
      title: potentialCases[index].massnahme,
      source: 'POTENTIAL',
      paymentYyyymm: addMonths(effectiveYyyymm, -2),
      effectiveYyyymm,
      monthlyDelta: room,
      allocableCosts: roundCurrency((room * 12) / 0.08),
    });
  }
  return plan;
}

/**
 * The §558 increase that took effect before the projection starts, when the
 * rent before it is known. A §559 increase after it is subtracted, because
 * monthlyRentStart contains it but §558 Abs. 3 excludes §559 from the cap.
 */
export function preProjection558(params: CalculatorParams): { effectiveYyyymm: string; monthlyDelta: number } | null {
  if (!params.last558Date || params.last558RentBefore == null) return null;
  const effectiveYyyymm = normalizeYyyymm(params.last558Date, params.startYyyymm);
  const later559 = params.last559Date
    && compareMonth(params.last559Date, effectiveYyyymm) > 0
    && compareMonth(params.last559Date, params.startYyyymm) <= 0
    ? Math.max(0, params.last559MonthlyDelta)
    : 0;
  const monthlyDelta = roundCurrency(Math.max(0, params.monthlyRentStart - params.last558RentBefore - later559));
  return monthlyDelta > 0 ? { effectiveYyyymm, monthlyDelta } : null;
}

/** The pre-projection increase's share of the window [windowStart, month], or 0. */
function preProjectionUsedInWindow(
  prior: { effectiveYyyymm: string; monthlyDelta: number } | null,
  windowStart: string,
  month: string,
): number {
  return prior
    && compareMonth(prior.effectiveYyyymm, windowStart) >= 0
    && compareMonth(prior.effectiveYyyymm, month) <= 0
    ? prior.monthlyDelta
    : 0;
}

function plan558(
  params: CalculatorParams,
  capPercent: number,
  targetPerM2: number,
  modernizations: ModernizationPlanRow[] = [],
) {
  const steps: RentIncrease558Row[] = [];
  if (params.monthlyRentStart <= 0 || params.livingAreaM2 <= 0) return steps;

  let lastEffective = params.last558Date
    ? normalizeYyyymm(params.last558Date, params.rentStartYyyymm)
    : params.rentStartYyyymm;
  let current558Base = params.monthlyRentStart;
  const sortedModernizations = [...modernizations].sort((a, b) => a.effectiveYyyymm.localeCompare(b.effectiveYyyymm));
  let modernizationIndex = 0;
  let active559 = 0;
  const intervalMonths = Math.round(clamp(params.rentIncreaseIntervalMonths, 15, 60));
  const utilization = clamp(params.rentIncreaseUtilizationPercent, 0, 100) / 100;
  const prior = preProjection558(params);

  for (let offset = 0; offset < CALCULATION_HORIZON_MONTHS; offset += 1) {
    const month = addMonths(params.startYyyymm, offset);
    if (compareMonth(month, params.rentStartYyyymm) < 0) continue;
    while (
      modernizationIndex < sortedModernizations.length
      && compareMonth(sortedModernizations[modernizationIndex].effectiveYyyymm, month) <= 0
    ) {
      active559 = roundCurrency(active559 + sortedModernizations[modernizationIndex].monthlyDelta);
      modernizationIndex += 1;
    }
    if (monthDiff(lastEffective, month) < intervalMonths) continue;
    // §558 and §559 may not both take effect in the same month. The
    // modernization keeps the month; the rent-index increase waits.
    if (sortedModernizations.some((item) => item.effectiveYyyymm === month)) continue;

    const target = roundCurrency(targetPerM2 * rentIndexGrowthFactor(params, offset) * params.livingAreaM2);
    const windowStart = addMonths(month, -35);
    const usedInWindow = steps.reduce((sum, step) => {
      if (compareMonth(step.effectiveYyyymm, windowStart) >= 0 && compareMonth(step.effectiveYyyymm, month) <= 0) {
        return sum + step.monthlyDelta;
      }
      return sum;
    }, 0) + preProjectionUsedInWindow(prior, windowStart, month);
    // §558 Abs. 3: the 20 % / 15 % ceiling is measured against the rent at the
    // start of the rolling three-year window, not against the rent at the very
    // beginning of the projection. `current558Base` is the rent before this
    // step, so subtracting what was already raised inside the window
    // reconstructs the rent as it stood when the window opened. Using the
    // initial rent instead kept the ceiling frozen at its year-one value and
    // understated every later window (20 % → 11 % after twelve years).
    // §559 increases stay out of it by construction: they accumulate in
    // `active559`, never in `current558Base` — matching "von Erhöhungen nach
    // den §§ 559 bis 560 abgesehen".
    const rentAtWindowStart = Math.max(0, current558Base - usedInWindow);
    const room = roundCurrency(Math.max(0, rentAtWindowStart * capPercent - usedInWindow));
    const legalMaximum = clamp(target - current558Base - active559, 0, room);
    const delta = roundCurrency(legalMaximum * utilization);

    if (delta > 0) {
      steps.push({
        id: `558-${steps.length + 1}`,
        effectiveYyyymm: month,
        monthlyDelta: delta,
        legalMaximum,
        sourceType: 'RENT_INDEX',
      });
      current558Base = roundCurrency(current558Base + delta);
      lastEffective = month;
    }
  }

  return steps;
}

function applyRentIncreaseOverrides(
  params: CalculatorParams,
  steps: RentIncrease558Row[],
  capPercent: number,
  targetPerM2: number,
  modernizations: ModernizationPlanRow[],
): RentIncrease558Row[] {
  const overrides = params.rentIncreaseOverrides;
  const storedPlan = (params.rentIncreasePlan ?? [])
    .filter((item) => item.legalBasis === '558')
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (!overrides && storedPlan.length === 0) return steps;
  const requested: RentIncrease558Row[] = steps.map((step, index) => {
    const stored = storedPlan[index];
    const id = stored?.id ?? step.id ?? `558-${index + 1}`;
    const override = overrides?.[id] ?? overrides?.[step.id ?? `558-${index + 1}`];
    const effectiveYyyymm = override?.effectiveYyyymm
      ? normalizeYyyymm(override.effectiveYyyymm, step.effectiveYyyymm)
      : stored?.effectiveYyyymm ?? step.effectiveYyyymm;
    const monthlyDelta = override?.monthlyDelta == null
      ? stored?.monthlyAmount ?? step.monthlyDelta
      : roundCurrency(Math.max(0, override.monthlyDelta));
    const sourceType: RentIncrease558Row['sourceType'] = override || stored?.sourceType === 'MANUAL'
      ? 'MANUAL'
      : 'RENT_INDEX';
    return {
      ...step,
      id,
      effectiveYyyymm,
      monthlyDelta,
      sourceType,
    };
  });

  let previous = params.last558Date ? normalizeYyyymm(params.last558Date) : params.rentStartYyyymm;
  let current558Base = params.monthlyRentStart;
  const accepted: RentIncrease558Row[] = [];
  const prior = preProjection558(params);

  /** §558 and §559 must not take effect in the same month. */
  const collidesWith559 = (effectiveYyyymm: string) =>
    modernizations.some((item) => item.effectiveYyyymm === effectiveYyyymm);

  const legalMaximumAt = (effectiveYyyymm: string) => {
    const offset = Math.max(0, monthDiff(params.startYyyymm, effectiveYyyymm));
    const target = roundCurrency(targetPerM2 * rentIndexGrowthFactor(params, offset) * params.livingAreaM2);
    const active559 = modernizations
      .filter((item) => compareMonth(item.effectiveYyyymm, effectiveYyyymm) <= 0)
      .reduce((sum, item) => sum + item.monthlyDelta, 0);
    const windowStart = addMonths(effectiveYyyymm, -35);
    const usedInWindow = accepted
      .filter((item) => compareMonth(item.effectiveYyyymm, windowStart) >= 0)
      .reduce((sum, item) => sum + item.monthlyDelta, 0)
      + preProjectionUsedInWindow(prior, windowStart, effectiveYyyymm);
    // Same rolling-window base as plan558 — see the comment there.
    const rentAtWindowStart = Math.max(0, current558Base - usedInWindow);
    const capRoom = Math.max(0, rentAtWindowStart * capPercent - usedInWindow);
    const targetRoom = Math.max(0, target - current558Base - active559);
    return roundCurrency(Math.min(capRoom, targetRoom));
  };

  return requested.map((step) => {
    // Hard floor from the waiting period and the start of the projection.
    const lowerBound = [
      params.startYyyymm,
      params.rentStartYyyymm,
      addMonths(previous, Math.round(clamp(params.rentIncreaseIntervalMonths, 15, 60))),
    ].sort().at(-1) ?? params.startYyyymm;

    // From that floor, walk forward to the first month that actually permits an
    // increase. This is what the planner greys out — the floor alone is often
    // years too optimistic, because the rent still has to fall far enough below
    // the ortsübliche Vergleichsmiete before any increase is lawful.
    let earliestYyyymm = lowerBound;
    for (
      let attempt = 0;
      (legalMaximumAt(earliestYyyymm) <= 0.009 || collidesWith559(earliestYyyymm))
        && attempt < CALCULATION_HORIZON_MONTHS;
      attempt += 1
    ) {
      earliestYyyymm = addMonths(earliestYyyymm, 1);
    }

    let effectiveYyyymm = [step.effectiveYyyymm, lowerBound].sort().at(-1) ?? step.effectiveYyyymm;

    let legalMaximum = legalMaximumAt(effectiveYyyymm);
    // A moved increase keeps its sequence. If the legal room is exhausted — or
    // the month is already taken by a §559 modernization — dependent increases
    // move to the first month that works.
    for (
      let attempt = 0;
      step.monthlyDelta > 0
        && (legalMaximum <= 0.009 || collidesWith559(effectiveYyyymm))
        && attempt <= CALCULATION_HORIZON_MONTHS;
      attempt += 1
    ) {
      effectiveYyyymm = addMonths(effectiveYyyymm, 1);
      legalMaximum = legalMaximumAt(effectiveYyyymm);
    }

    const monthlyDelta = roundCurrency(clamp(step.monthlyDelta, 0, legalMaximum));
    const scheduled = { ...step, effectiveYyyymm, monthlyDelta, legalMaximum, earliestYyyymm };
    accepted.push(scheduled);
    current558Base = roundCurrency(current558Base + monthlyDelta);
    previous = effectiveYyyymm;
    return scheduled;
  });
}

function totalsByMonth<T>(
  rows: T[],
  monthFor: (row: T) => string,
  valueFor: (row: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const month = monthFor(row);
    totals.set(month, roundCurrency((totals.get(month) ?? 0) + valueFor(row)));
  }
  return totals;
}

function calculateTaxes(
  taxableIncome: number,
  taxRate: number,
  taxableLossesOffsettable: boolean,
  lossCarryforward: number,
) {
  if (taxableLossesOffsettable) {
    return {
      taxes: roundCurrency(taxableIncome * taxRate),
      lossCarryforward: 0,
    };
  }
  if (taxableIncome <= 0) {
    return {
      taxes: 0,
      lossCarryforward: roundCurrency(lossCarryforward + Math.abs(taxableIncome)),
    };
  }
  const taxableAfterLosses = Math.max(0, roundCurrency(taxableIncome - lossCarryforward));
  return {
    taxes: roundCurrency(taxableAfterLosses * taxRate),
    lossCarryforward: roundCurrency(Math.max(0, lossCarryforward - taxableIncome)),
  };
}

function buildTimeline(
  params: CalculatorParams,
  increases558: RentIncrease558Row[],
  increases558WithRentIndex: RentIncrease558Row[],
  modernizationPlan: ModernizationPlanRow[],
  includeTimeline = true,
) {
  let balance = Math.max(0, params.loanAmount);
  let cumulativeIncome = 0;
  let cumulativeExpenses = params.equityIncluded ? roundCurrency(params.equityAmount ?? 0) : 0;
  let cumulativeTaxes = 0;
  let cumulativeCashflowBeforeTax = params.equityIncluded ? roundCurrency(-(params.equityAmount ?? 0)) : 0;
  let cumulativeCashflow = params.equityIncluded ? roundCurrency(-(params.equityAmount ?? 0)) : 0;
  let taxLossCarryforward = 0;
  let indexedLossCarryforward = 0;
  let runningWithRentIndex = params.equityIncluded ? roundCurrency(-(params.equityAmount ?? 0)) : 0;
  let breakEven: string | null = null;
  let breakEvenWithRentIndex: string | null = null;
  let rentTotal = roundCurrency(params.monthlyRentStart);
  let rentTotalWithRentIndex = roundCurrency(params.monthlyRentStart);
  const timeline: RentTimelineRow[] = [];
  const delta558ByMonth = totalsByMonth(increases558, (item) => item.effectiveYyyymm, (item) => item.monthlyDelta);
  const indexedDelta558ByMonth = totalsByMonth(increases558WithRentIndex, (item) => item.effectiveYyyymm, (item) => item.monthlyDelta);
  const delta559ByMonth = totalsByMonth(modernizationPlan, (item) => item.effectiveYyyymm, (item) => item.monthlyDelta);
  const renovationPaymentsByMonth = totalsByMonth(modernizationPlan, (item) => item.paymentYyyymm, (item) => item.allocableCosts);
  const fixedPeriodMonths = Math.max(0, (params.interestPeriodYears ?? 10) * 12);

  for (let offset = 0; offset < CALCULATION_HORIZON_MONTHS; offset += 1) {
    const yyyymm = addMonths(params.startYyyymm, offset);
    const rentalHasStarted = compareMonth(yyyymm, params.rentStartYyyymm) >= 0;
    const delta558 = delta558ByMonth.get(yyyymm) ?? 0;
    const indexedDelta558 = indexedDelta558ByMonth.get(yyyymm) ?? 0;
    const delta559 = delta559ByMonth.get(yyyymm) ?? 0;
    const renovationPayment = renovationPaymentsByMonth.get(yyyymm) ?? 0;
    rentTotal = roundCurrency(rentTotal + delta558 + delta559);
    rentTotalWithRentIndex = roundCurrency(rentTotalWithRentIndex + indexedDelta558 + delta559);
    const annualCostFactor = Math.pow(1.02, Math.floor(offset / 12));
    const allocableCosts = roundCurrency(params.serviceChargesAllocable * annualCostFactor);
    const nonAllocableCosts = roundCurrency(params.serviceChargesNonAllocable * annualCostFactor);
    const activeInterestRate = offset >= fixedPeriodMonths && params.refinancingInterestRate != null
      ? params.refinancingInterestRate
      : params.interestRate;
    const scheduledDebtService = offset >= fixedPeriodMonths
      ? roundCurrency(balance * ((activeInterestRate + params.repaymentRate) / 100) / 12)
      : params.monthlyDebtService;
    const debtService = roundCurrency(Math.min(scheduledDebtService, balance > 0 ? scheduledDebtService : 0));
    const interest = roundCurrency(balance * (activeInterestRate / 100) / 12);
    const principal = roundCurrency(Math.min(balance, Math.max(0, debtService - interest)));
    balance = roundCurrency(Math.max(0, balance - principal));
    const afa = roundCurrency(params.monthlyAfa);
    const income = rentalHasStarted ? rentTotal : 0;
    const indexedIncome = rentalHasStarted ? rentTotalWithRentIndex : 0;
    const taxableIncome = roundCurrency(income - nonAllocableCosts - afa - interest);
    const taxResult = calculateTaxes(
      taxableIncome,
      params.taxRate,
      params.taxableLossesOffsettable === true,
      taxLossCarryforward,
    );
    const taxes = taxResult.taxes;
    taxLossCarryforward = taxResult.lossCarryforward;
    const expenses = roundCurrency(debtService + nonAllocableCosts + renovationPayment);
    const monthlyDelta = roundCurrency(income - expenses);
    const afterTaxCashflow = roundCurrency(monthlyDelta - taxes);
    cumulativeIncome = roundCurrency(cumulativeIncome + income);
    cumulativeExpenses = roundCurrency(cumulativeExpenses + expenses + taxes);
    cumulativeTaxes = roundCurrency(cumulativeTaxes + taxes);
    cumulativeCashflowBeforeTax = roundCurrency(cumulativeCashflowBeforeTax + monthlyDelta);
    cumulativeCashflow = roundCurrency(cumulativeCashflow + afterTaxCashflow);
    if (!breakEven && cumulativeCashflow >= 0) breakEven = yyyymm;

    const indexedTaxResult = calculateTaxes(
      roundCurrency(indexedIncome - nonAllocableCosts - afa - interest),
      params.taxRate,
      params.taxableLossesOffsettable === true,
      indexedLossCarryforward,
    );
    indexedLossCarryforward = indexedTaxResult.lossCarryforward;
    runningWithRentIndex = roundCurrency(runningWithRentIndex + indexedIncome - expenses - indexedTaxResult.taxes);
    if (!breakEvenWithRentIndex && runningWithRentIndex >= 0) breakEvenWithRentIndex = yyyymm;

    if (includeTimeline) {
      timeline.push({
        yyyymm,
        rentTotal: income,
        rentTotalWithRentIndex: indexedIncome,
        delta558,
        delta559,
        renovationPayment,
        debtService,
        interest,
        afa,
        allocableCosts,
        nonAllocableCosts,
        taxes,
        taxableIncome,
        taxLossCarryforward,
        income,
        expenses,
        monthlyDelta,
        afterTaxCashflow,
        cumulativeIncome,
        cumulativeExpenses,
        cumulativeTaxes,
        cumulativeCashflowBeforeTax,
        cumulativeCashflow,
      });
    }
  }

  return {
    timeline,
    breakEven,
    breakEvenWithRentIndex,
    endingCashflow: cumulativeCashflow,
    endingCashflowWithRentIndex: runningWithRentIndex,
  };
}

function placementScore(
  params: CalculatorParams,
  plan: ModernizationPlanRow[],
  capPercent: number,
  conservativeRentIndexPerM2: number,
  marketRentIndexPerM2: number,
) {
  const increases558 = applyRentIncreaseOverrides(
    { ...params, rentIncreaseOverrides: undefined },
    plan558(params, capPercent, conservativeRentIndexPerM2, plan),
    capPercent,
    conservativeRentIndexPerM2,
    plan,
  );
  const increases558WithRentIndex = applyRentIncreaseOverrides(
    { ...params, rentIncreaseOverrides: undefined },
    plan558(params, capPercent, marketRentIndexPerM2, plan),
    capPercent,
    marketRentIndexPerM2,
    plan,
  );
  const result = buildTimeline(params, increases558, increases558WithRentIndex, plan, false);
  const breakEvenOffset = result.breakEven ? monthDiff(params.startYyyymm, result.breakEven) : 9999;
  return { ...result, breakEvenOffset };
}

function optimizeKnownModernizations(
  params: CalculatorParams,
  renovationCases: RenovationCase[],
  capAbs: number,
  capPercent: number,
  conservativeRentIndexPerM2: number,
  marketRentIndexPerM2: number,
) {
  const relevant = renovationCases.filter((item) => item.selected && item.ai);
  if (relevant.length === 0) return [];

  type Candidate = { placements: number[]; plan: ModernizationPlanRow[]; breakEvenOffset: number; endingCashflow: number };
  let candidates: Candidate[] = [{ placements: [], plan: [], breakEvenOffset: 9999, endingCashflow: -Infinity }];
  const possibleOffsets = Array.from(
    { length: Math.floor((CALCULATION_HORIZON_MONTHS - 4) / 12) + 1 },
    (_, index) => 3 + index * 12,
  ).filter((value) => value < CALCULATION_HORIZON_MONTHS);

  for (let index = 0; index < relevant.length; index += 1) {
    const next: Candidate[] = [];
    for (const candidate of candidates) {
      for (const offset of possibleOffsets) {
        const placements = [...candidate.placements, offset];
        const plan = buildPlanFromPlacements(params, relevant.slice(0, index + 1), placements, capAbs);
        const score = placementScore(params, plan, capPercent, conservativeRentIndexPerM2, marketRentIndexPerM2);
        next.push({ placements, plan, breakEvenOffset: score.breakEvenOffset, endingCashflow: score.endingCashflow });
      }
    }
    next.sort((a, b) => a.breakEvenOffset - b.breakEvenOffset || b.endingCashflow - a.endingCashflow);
    candidates = next.slice(0, 8);
  }

  let best = candidates[0];
  if (!best) return [];

  for (let index = 0; index < relevant.length; index += 1) {
    const nearbyOffsets = [-9, -6, -3, 0, 3, 6, 9]
      .map((delta) => best.placements[index] + delta)
      .filter((offset) => offset >= 3 && offset < CALCULATION_HORIZON_MONTHS);
    for (const offset of nearbyOffsets) {
      const placements = best.placements.map((value, placementIndex) => placementIndex === index ? offset : value);
      const plan = buildPlanFromPlacements(params, relevant, placements, capAbs);
      const score = placementScore(params, plan, capPercent, conservativeRentIndexPerM2, marketRentIndexPerM2);
      if (
        score.breakEvenOffset < best.breakEvenOffset
        || (score.breakEvenOffset === best.breakEvenOffset && score.endingCashflow > best.endingCashflow)
      ) {
        best = { placements, plan, breakEvenOffset: score.breakEvenOffset, endingCashflow: score.endingCashflow };
      }
    }
  }

  return best.plan;
}

export function runRentCalculator(params: CalculatorParams, renovationCases: RenovationCase[]) {
  const denseMarket = isDenseMarket(params.city);
  const capPercent = denseMarket ? 0.15 : 0.2;
  const rentPerM2 = params.livingAreaM2 > 0 ? params.monthlyRentStart / params.livingAreaM2 : 0;
  const capPerM2 = rentPerM2 < 7 ? 2 : 3;
  const capAbs = roundCurrency(capPerM2 * Math.max(0, params.livingAreaM2));
  const previous559Diff = params.last559Date ? monthDiff(params.last559Date, params.startYyyymm) : -1;
  const previous559Used = previous559Diff >= 0 && previous559Diff < 72
    ? roundCurrency(Math.max(0, params.last559MonthlyDelta))
    : 0;
  const remaining559Room = roundCurrency(Math.max(0, capAbs - previous559Used));
  const conservativeRentIndexPerM2 = rentPerM2 > 0 ? roundCurrency(rentPerM2 * 1.02) : 0;
  const marketRentIndexPerM2 = params.rentIndexPerM2 && params.rentIndexPerM2 > 0
    ? params.rentIndexPerM2
    : conservativeRentIndexPerM2;
  const defaultPlan = params.mode === 'POTENTIAL'
    ? placePotentialModernizations(params, capAbs)
    : placeKnownModernizations(params, renovationCases, capAbs);
  const modernizationPlan = params.placementMode === 'OPTIMIZED'
    && params.mode === 'KNOWN'
    && !params.modernizationPlacements
    ? optimizeKnownModernizations(params, renovationCases, capAbs, capPercent, conservativeRentIndexPerM2, marketRentIndexPerM2)
    : defaultPlan;
  const increases558 = applyRentIncreaseOverrides(
    params,
    plan558(params, capPercent, conservativeRentIndexPerM2, modernizationPlan),
    capPercent,
    conservativeRentIndexPerM2,
    modernizationPlan,
  );
  const increases558WithRentIndex = applyRentIncreaseOverrides(
    params,
    plan558(params, capPercent, marketRentIndexPerM2, modernizationPlan),
    capPercent,
    marketRentIndexPerM2,
    modernizationPlan,
  );
  const scenario = buildTimeline(params, increases558, increases558WithRentIndex, modernizationPlan);

  const lastRow = scenario.timeline[scenario.timeline.length - 1];
  const firstRow = scenario.timeline[0];
  const totalRenovationCosts = modernizationPlan.reduce((sum, item) => sum + item.allocableCosts, 0);
  const metrics = {
    totalInvestment: roundCurrency(params.totalInvestment),
    totalRenovationCosts: roundCurrency(totalRenovationCosts),
    grossYieldToday: params.purchasePrice > 0 ? roundCurrency((params.monthlyRentStart * 12 / params.purchasePrice) * 100) : 0,
    netYieldToday: params.totalInvestment > 0
      ? roundCurrency(((params.monthlyRentStart - (firstRow?.nonAllocableCosts ?? 0)) * 12 / params.totalInvestment) * 100)
      : 0,
    cashflowToday: firstRow?.monthlyDelta ?? 0,
    afterTaxCashflowToday: firstRow?.afterTaxCashflow ?? 0,
    rentAtHorizon: lastRow?.rentTotal ?? 0,
    rentAtHorizonWithRentIndex: lastRow?.rentTotalWithRentIndex ?? 0,
    endingCashflow: lastRow?.cumulativeCashflow ?? 0,
    endingCashflowWithRentIndex: scenario.endingCashflowWithRentIndex,
  };

  return {
    params: { ...params, rentIndexPerM2: marketRentIndexPerM2 },
    denseMarket,
    capPercent,
    capPerM2,
    capAbs,
    previous559Used,
    remaining559Room,
    rentIndexPerM2: marketRentIndexPerM2,
    rentIndexSource: params.rentIndexSource,
    timeline: scenario.timeline,
    modernizationPlan,
    increases558,
    increases558WithRentIndex,
    breakEven: scenario.breakEven,
    breakEvenWithRentIndex: scenario.breakEvenWithRentIndex,
    placementMode: params.placementMode,
    metrics,
  };
}
