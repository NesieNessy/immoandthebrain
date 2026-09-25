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
 * A Nebenkostenabrechnung's Abrechnungszeitraum must never exceed 12 months
 * (§ 556 Abs. 3 BGB) — a period longer than that isn't a valid settlement
 * period at all, regardless of what the underlying proration math would
 * otherwise happily compute for an arbitrarily long span (e.g. mistakenly
 * covering a tenant's entire multi-year tenancy instead of one year of it).
 */
export function isPeriodTooLong(start: Date, end: Date): boolean {
    const maxEnd = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate() - 1);
    return end > maxEnd;
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


// ── Per-cost-item allocation ratio ("Wert vorschlagen", tiered) ────────────
//
// A single ratio for the whole unit (NK-Vorauszahlung ÷ WEG, tried earlier)
// is wrong whenever different cost items use different Verteilerschlüssel
// (by ownership share, by consumption, by unit count, ...) — Grundsteuer and
// Aufzugskosten on the same apartment can legitimately have different
// factors. The ratio has to be derived per cost item, with a clear priority
// and no invented fallback when neither source is available:
//   1. An explicit, landlord-entered allocation key for this cost item
//      label (service_charge_allocation_key) — the most reliable source,
//      since it doesn't depend on any past data existing at all.
//   2. The ratio implied by this SAME unit's own previous settlement for
//      the same-labeled cost item (its Anteil Wohnung ÷ its Gesamt Objekt,
//      from the Abrechnung side — the actually-incurred cost, not a budget
//      guess).
//   3. Neither exists: no suggestion. Never invent a number the landlord
//      never actually confirmed.
// "Allocable" never enters this decision — a non-allocable cost item can
// still have a real, explainable apartment share; allocable only decides
// whether that share is later charged to the tenant.

export interface AllocationKeyInput {
    label: string;
    numerator: number;
    denominator: number;
    allocationType: string | null;
}

export interface PreviousCostItemInput {
    label: string;
    /** The prior settlement's Abrechnung-side Gesamt Objekt amount for this
     *  label — the ratio's denominator. */
    actualAmount: number | null;
    /** The prior settlement's Abrechnung-side Anteil Wohnung for this label
     *  — the ratio's numerator. */
    actualShareOverride: number | null;
}

export interface SuggestedShare {
    /** The suggested Anteil Wohnung, already rounded to cents. */
    value: number;
    /** 0–1, e.g. 0.08 for an 8% share. */
    rate: number;
    source: 'explicit' | 'history';
    /** Human-readable explanation of where `rate` came from, for the
     *  suggestion tooltip (e.g. "Miteigentumsanteil 80/1000" or "Verteilerschlüssel
     *  aus letzter Abrechnung: 8,0%"). */
    explanation: string;
}

function formatPercent(rate: number): string {
    return `${(rate * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Suggests a cost item's Anteil Wohnung from `amount` (that row's Gesamt
 * Objekt, whichever column is being suggested) using the tiered ratio
 * above — matched by label (case-insensitively, since a landlord retyping
 * "Grundsteuer" vs "grundsteuer" across years shouldn't break the lookup).
 * Returns null when neither an explicit key nor a usable prior-period ratio
 * exists — the caller must leave the field empty rather than fabricate a
 * value, exactly like "no suggestion available" in the spec this implements.
 */
export function suggestShareForCostItem(
    amount: number,
    label: string,
    allocationKeys: readonly AllocationKeyInput[],
    previousCostItems: readonly PreviousCostItemInput[],
): SuggestedShare | null {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel) return null;
    // `amount` (that row's Gesamt Objekt) is sanitized against negative
    // input at every manual entry point, but a bypass path like AI document
    // extraction writes it directly — floored here so an otherwise-valid,
    // non-negative ratio can never still yield a negative suggested Anteil
    // Wohnung.
    const safeAmount = Math.max(0, amount);

    // A Verteilerschlüssel is an ownership/consumption ratio — it can never
    // legitimately be negative, so a corrupt key (bad data predating input
    // sanitization, or written directly via the API) must never produce a
    // suggestion rather than a nonsensical negative Anteil Wohnung.
    const explicitKey = allocationKeys.find((k) => k.label.trim().toLowerCase() === normalizedLabel);
    if (explicitKey && explicitKey.numerator >= 0 && explicitKey.denominator > 0) {
        const rate = explicitKey.numerator / explicitKey.denominator;
        return {
            value: Math.round(safeAmount * rate * 100) / 100,
            rate,
            source: 'explicit',
            explanation: `${explicitKey.allocationType?.trim() || 'Verteilerschlüssel'}: ${explicitKey.numerator}/${explicitKey.denominator} (${formatPercent(rate)})`,
        };
    }

    const previous = previousCostItems.find((p) => p.label.trim().toLowerCase() === normalizedLabel);
    if (previous && previous.actualAmount != null && previous.actualAmount > 0 && previous.actualShareOverride != null && previous.actualShareOverride >= 0) {
        const rate = previous.actualShareOverride / previous.actualAmount;
        return {
            value: Math.round(safeAmount * rate * 100) / 100,
            rate,
            source: 'history',
            explanation: `Verteilerschlüssel aus letzter Abrechnung: ${formatPercent(rate)}`,
        };
    }

    return null;
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

/**
 * Reconstructs the monthly NK-Vorauszahlung that was actually in effect as of
 * `asOfDate` (typically a settlement's periodEnd), by undoing any history
 * entries whose effective date is *after* it — the same backward-walk this
 * file already does for prorateAnnualPrepayment, exposed on its own so a
 * display value can show "the rate this settlement was billed at" without
 * being pulled along whenever the tenancy's current rate changes for a
 * future period. A rate change effective after `asOfDate` must never affect
 * this figure; that's the whole point of freezing it to the settlement.
 */
export function monthlyRateAsOf(
    currentMonthlyValue: number,
    history: MiscRentAdjustment[],
    asOfDate: Date,
): number {
    const sorted = history
        .filter((entry) => entry.effectiveDate)
        .map((entry) => ({ date: stripTime(new Date(entry.effectiveDate)), amount: entry.amount }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    let runningValue = currentMonthlyValue;
    const target = stripTime(asOfDate);
    for (const entry of sorted) {
        if (entry.date > target) {
            runningValue -= entry.amount;
        } else {
            break;
        }
    }
    return Math.round(runningValue * 100) / 100;
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
    // Floored at 0 — see useServiceChargeSettlementData.tsx's own copy of this calculation.
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.max(0, Math.round((unitBudgetShare / 12) * 100) / 100) : null;

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
