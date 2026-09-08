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

/**
 * Prorates the annual NK-Vorauszahlung total for a settlement period, taking
 * into account any miscRent changes that took effect during the period.
 * History entries store a delta (not an absolute value), so past monthly
 * values are reconstructed by walking backwards from the current value.
 */
export function prorateAnnualPrepayment(
    currentMonthlyValue: number,
    history: MiscRentAdjustment[],
    periodStart: Date,
    periodEnd: Date,
): number {
    const totalDays = dayDiff(periodStart, periodEnd) + 1;
    if (totalDays <= 0) return Math.round(currentMonthlyValue * 12 * 100) / 100;

    const sorted = history
        .filter((entry) => entry.effectiveDate)
        .map((entry) => ({ date: stripTime(new Date(entry.effectiveDate)), amount: entry.amount }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (sorted.length === 0) return Math.round(currentMonthlyValue * 12 * 100) / 100;

    const segments: { from: Date; to: Date; value: number }[] = [];
    let runningValue = currentMonthlyValue;
    let segmentEnd = stripTime(periodEnd);

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

    const start = stripTime(periodStart);
    const end = stripTime(periodEnd);
    let total = 0;
    for (const segment of segments) {
        const overlapStart = segment.from > start ? segment.from : start;
        const overlapEnd = segment.to < end ? segment.to : end;
        const overlapDays = dayDiff(overlapStart, overlapEnd) + 1;
        if (overlapDays <= 0) continue;
        total += segment.value * 12 * (overlapDays / totalDays);
    }
    return Math.round(total * 100) / 100;
}
