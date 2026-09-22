export type CoverageDirection = 'shortfall' | 'surplus' | 'balanced';

/** A settlement period counts as "whole year" when it spans exactly Jan 1 –
 *  Dec 31 of a single year — the common case, vs. a shorter custom range
 *  (e.g. a tenant moved in/out mid-year). */
export function isFullCalendarYear(start: Date, end: Date): boolean {
    return start.getMonth() === 0 && start.getDate() === 1
        && end.getMonth() === 11 && end.getDate() === 31
        && start.getFullYear() === end.getFullYear();
}

/**
 * Default Abrechnungszeitraum for a brand-new settlement: Jan 1 – Dec 31 of
 * `currentYear`, unless the tenant has a move-out date, in which case the
 * period instead runs Jan 1 – the move-out date of *that* date's year (a
 * final settlement almost always needs to end at Mietauszug, not Dec 31).
 */
export function defaultSettlementPeriod(moveOutDate: Date | null, currentYear: number): { start: Date; end: Date } {
    const periodYear = moveOutDate ? moveOutDate.getFullYear() : currentYear;
    const start = new Date(periodYear, 0, 1);
    const end = moveOutDate ?? new Date(periodYear, 11, 31);
    return { start, end };
}

/** Compares (1) the unit's apartment share of actual allocable costs against (2) the annual prepayment total. */
export function compareSettlementCoverage(apartmentShare: number, annualPrepayment: number): CoverageDirection {
    if (apartmentShare > annualPrepayment) return 'shortfall';
    if (apartmentShare < annualPrepayment) return 'surplus';
    return 'balanced';
}

/** Compares (2) the annual prepayment total against (3) next year's budgeted apartment share. */
export function compareBudgetCoverage(annualPrepayment: number, budgetApartmentShare: number): CoverageDirection {
    if (annualPrepayment > budgetApartmentShare) return 'surplus';
    if (annualPrepayment < budgetApartmentShare) return 'shortfall';
    return 'balanced';
}

export interface CostSplit {
    allocable: number;
    nonAllocable: number;
    total: number;
}

export function splitByAllocable(items: { amount: number; allocable: boolean }[]): CostSplit {
    const allocable = items.filter((item) => item.allocable).reduce((sum, item) => sum + item.amount, 0);
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return { allocable, nonAllocable: total - allocable, total };
}

export interface MiscRentAdjustment {
    /** ISO date string the new monthly value took effect. */
    effectiveDate: string;
    /** Delta applied to the monthly value at effectiveDate (new - old), matching the app's rent/renovation history convention. */
    amount: number;
}

function stripTime(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(from: Date, to: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((stripTime(to).getTime() - stripTime(from).getTime()) / msPerDay);
}

/** Fixed annualization basis for prorating a monthly rate over a settlement
 *  period. Must NOT be the period's own day count — a period shorter than a
 *  full year (a move-in or move-out year) still needs "days ÷ 365" to land
 *  on a fraction of a year, not "days ÷ itself" which always evaluates to 1
 *  and silently reproduces the full annual amount regardless of how short
 *  the period actually is. */
const DAYS_PER_YEAR = 365;

/**
 * Fraction of `periodStart..periodEnd` during which a tenancy actually
 * occupied the unit — the same period ∩ tenancy overlap
 * `prorateAnnualPrepayment` applies to the advance-payment side, exposed
 * separately so a cost-side suggestion (Anteil Wohnung) can apply the
 * identical clipping instead of assuming the apartment share applies to the
 * whole billing period regardless of how much of it the tenant occupied.
 * 0 when there's no overlap at all (or `periodEnd` is not after
 * `periodStart`); 1 for an unbounded (or fully covering) tenancy.
 */
export function occupancyFraction(
    periodStart: Date,
    periodEnd: Date,
    tenancyStart?: Date | null,
    tenancyEnd?: Date | null,
): number {
    const totalDays = dayDiff(periodStart, periodEnd) + 1;
    if (totalDays <= 0) return 0;
    const effectiveStart = tenancyStart && tenancyStart > periodStart ? tenancyStart : periodStart;
    const effectiveEnd = tenancyEnd && tenancyEnd < periodEnd ? tenancyEnd : periodEnd;
    const occupiedDays = dayDiff(effectiveStart, effectiveEnd) + 1;
    if (occupiedDays <= 0) return 0;
    return occupiedDays / totalDays;
}

/**
 * A one-shot *suggestion* for a cost item's Anteil Wohnung — property cost ×
 * living-area allocation key × occupancy fraction — for the opt-in
 * "Wert vorschlagen" action. This is intentionally never called
 * automatically: Anteil Wohnung is a manual, independent field (see
 * CostItemForm), and this only fills it when the landlord explicitly asks
 * for a starting point, which they can then edit or ignore.
 */
export function suggestApartmentShare(amount: number, unitShare: number, fraction: number): number {
    return Math.round(amount * unitShare * fraction * 100) / 100;
}

/**
 * Prorates the annual NK-Vorauszahlung total for a settlement period, taking
 * into account any miscRent changes that took effect during the period, AND
 * the period's own length relative to a full year — a settlement period
 * shorter than a full year (the tenant moved in or out mid-year) must yield
 * less than a full year's worth of prepayment, not `monthly * 12` outright.
 * History entries store a delta (not an absolute value), so past monthly
 * values are reconstructed by walking backwards from the current value.
 *
 * The prepayment can only cover the days the tenant actually occupied the
 * unit — `tenancyStart`/`tenancyEnd` (null = unbounded) clip the settlement
 * period down to its overlap with the tenancy before any proration happens.
 * Without this, a tenant who moved in mid-period (or a settlement period
 * that predates the tenancy entirely) would be charged/credited prepayment
 * for months they never rented the unit — with no overlap at all, the
 * history walk-back below would run against a period the tenancy has no
 * relation to and can produce a nonsensical (even negative) result.
 */
export function prorateAnnualPrepayment(
    currentMonthlyValue: number,
    history: MiscRentAdjustment[],
    periodStart: Date,
    periodEnd: Date,
    tenancyStart?: Date | null,
    tenancyEnd?: Date | null,
): number {
    const effectivePeriodStart = tenancyStart && tenancyStart > periodStart ? tenancyStart : periodStart;
    const effectivePeriodEnd = tenancyEnd && tenancyEnd < periodEnd ? tenancyEnd : periodEnd;

    const totalDays = dayDiff(effectivePeriodStart, effectivePeriodEnd) + 1;
    if (totalDays <= 0) return 0;

    const sorted = history
        .filter((entry) => entry.effectiveDate)
        .map((entry) => ({ date: stripTime(new Date(entry.effectiveDate)), amount: entry.amount }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (sorted.length === 0) return Math.round(currentMonthlyValue * 12 * (totalDays / DAYS_PER_YEAR) * 100) / 100;

    const segments: { from: Date; to: Date; value: number }[] = [];
    let runningValue = currentMonthlyValue;
    let segmentEnd = stripTime(effectivePeriodEnd);

    for (const entry of sorted) {
        if (entry.date > segmentEnd) {
            // The adjustment took effect after the window we still need to
            // cover; it doesn't create a segment here, but must still be
            // undone so earlier segments reconstruct the right value.
            runningValue -= entry.amount;
            continue;
        }
        segments.push({ from: entry.date, to: segmentEnd, value: runningValue });
        runningValue -= entry.amount;
        segmentEnd = new Date(entry.date);
        segmentEnd.setDate(segmentEnd.getDate() - 1);
    }
    segments.push({ from: new Date(-8640000000000000), to: segmentEnd, value: runningValue });

    const start = stripTime(effectivePeriodStart);
    const end = stripTime(effectivePeriodEnd);
    let total = 0;
    for (const segment of segments) {
        const overlapStart = segment.from > start ? segment.from : start;
        const overlapEnd = segment.to < end ? segment.to : end;
        const overlapDays = dayDiff(overlapStart, overlapEnd) + 1;
        if (overlapDays <= 0) continue;
        total += segment.value * 12 * (overlapDays / DAYS_PER_YEAR);
    }
    return Math.round(total * 100) / 100;
}

export interface UnitSettlementCostItem {
    actualAmount: number | null;
    budgetAmount: number | null;
    allocable: boolean;
    actualShareOverride: number | null;
    budgetShareOverride: number | null;
}

export interface UnitSettlementSummary {
    unitShare: number;
    /** (1) This unit's share of the actual/settled allocable costs. */
    unitActualShare: number;
    /** (3) This unit's share of next year's budgeted allocable costs. */
    unitBudgetShare: number;
    /** (2) Already-paid NK-Vorauszahlung total for the settlement period,
     *  correctly prorated for a move-in/move-out (partial) year. */
    annualPrepayment: number;
    currentMonthlyPrepayment: number;
    /** (1) vs (2). */
    overUnderCoverage: number;
    settlementCoverage: CoverageDirection;
    /** (2) vs (3). */
    budgetOverUnderCoverage: number;
    budgetCoverage: CoverageDirection;
    /** Wirtschaftsplan-derived monthly prepayment (3 ÷ 12) that would bring
     *  next year's balance to zero, assuming next year's actual costs match
     *  this year's budget. Null when there's no allocable budget yet. */
    newMonthlyPrepayment: number | null;
}

/**
 * The same per-unit settlement math the Nebenkostenabrechnung detail page
 * uses (unit share of actual/budgeted costs, prorated prepayment, coverage),
 * factored out as a pure function so a multi-unit overview can compute the
 * same figures for every unit from the one property-wide settlement without
 * duplicating (and risking drifting from) the detail page's logic.
 */
export function computeUnitSettlementSummary(params: {
    costItems: UnitSettlementCostItem[];
    unitLivingAreaM2: number | null;
    totalLivingAreaM2: number;
    currentMonthlyPrepayment: number;
    miscRentHistory: MiscRentAdjustment[];
    periodStart: Date;
    periodEnd: Date;
    tenancyStart?: Date | null;
    tenancyEnd?: Date | null;
}): UnitSettlementSummary {
    const { costItems, unitLivingAreaM2, totalLivingAreaM2, currentMonthlyPrepayment, miscRentHistory, periodStart, periodEnd, tenancyStart, tenancyEnd } = params;
    const unitShare = unitLivingAreaM2 && totalLivingAreaM2 > 0 ? unitLivingAreaM2 / totalLivingAreaM2 : 0;

    // Anteil Wohnung is always a manual, independent entry per cost item —
    // never derived from amount * unitShare (the whole building's cost never
    // automatically corresponds to a specific apartment's share of it). Kept
    // in lockstep with the Nebenkostenabrechnung detail page's own
    // actualShareForItem/budgetShareForItem (see useServiceChargeSettlementData.tsx).
    const shareForAmount = (amount: number | null, override: number | null, allocable: boolean): number => {
        if (!allocable || amount == null || override == null) return 0;
        return override;
    };

    const unitActualShare = costItems.reduce((sum, item) => sum + shareForAmount(item.actualAmount, item.actualShareOverride, item.allocable), 0);
    const unitBudgetShare = costItems.reduce((sum, item) => sum + shareForAmount(item.budgetAmount, item.budgetShareOverride, item.allocable), 0);
    const totalBudgetAllocable = splitByAllocable(costItems.map((item) => ({ amount: item.budgetAmount ?? 0, allocable: item.allocable }))).allocable;

    const annualPrepayment = prorateAnnualPrepayment(currentMonthlyPrepayment, miscRentHistory, periodStart, periodEnd, tenancyStart, tenancyEnd);
    const overUnderCoverage = unitActualShare - annualPrepayment;
    const budgetOverUnderCoverage = unitBudgetShare - annualPrepayment;
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.round((unitBudgetShare / 12) * 100) / 100 : null;

    return {
        unitShare,
        unitActualShare,
        unitBudgetShare,
        annualPrepayment,
        currentMonthlyPrepayment,
        overUnderCoverage,
        settlementCoverage: compareSettlementCoverage(unitActualShare, annualPrepayment),
        budgetOverUnderCoverage,
        budgetCoverage: compareBudgetCoverage(annualPrepayment, unitBudgetShare),
        newMonthlyPrepayment,
    };
}
