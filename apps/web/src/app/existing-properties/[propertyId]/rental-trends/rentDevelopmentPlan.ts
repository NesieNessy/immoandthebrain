import { isDenseMarket } from '@/lib/detailCheck/rentCalculator';
import { addMonths, differenceInCalendarMonths, format, parseISO } from 'date-fns';

// Tenancy-scoped versions of the same §558/§559 formulas rentCalculator.ts
// uses for its 50-year investment simulation — evaluated for a single
// "what's the next possible increase from today" proposal instead of a
// 600-month loop, against live Tenancy/history data instead of a one-shot
// valuation workflow's CalculatorParams. Dates here are full "yyyy-MM-dd"
// strings (as stored on Tenancy/tenancy_adjustment_history), not the
// "yyyy-MM" strings rentCalculator.ts's own date helpers use internally.

function toDate(value: string): Date {
    return parseISO(value);
}

function fmt(date: Date): string {
    return format(date, 'yyyy-MM-dd');
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

const EPSILON = 0.01;

export interface Proposal558Input {
    coldRent: number;
    livingAreaM2: number;
    city: string;
    /** Örtlicher Vergleichsmietenindex, €/m² — null when not yet entered on
     *  the Kalkulationsbasis tab. */
    rentIndexPerM2: number | null;
    /** §558 Sperrfrist override, months; null = legal default. */
    rentIncreaseIntervalMonths: number | null;
    /** Effective date of the most recent §558 increase (from
     *  tenancy_adjustment_history, adjustmentType 'rent'), or null if none
     *  yet — the Sperrfrist then runs from the tenancy start. */
    lastIncreaseDate: string | null;
    /** Every §558 increase whose effective date could fall in the rolling
     *  3-year Kappungsgrenze window around the next proposal. */
    priorIncreases: { effectiveDate: string; amount: number }[];
    /** The value the owner typed in themselves (nextRentAdjustmentAmount),
     *  if any — becomes the proposal once it doesn't fully use the legal
     *  max, per the "value entered manually is used for all subsequent
     *  calculations" rule. */
    manualOverrideAmount: number | null;
}

export interface Proposal558Result {
    denseMarket: boolean;
    /** 0.15 in a dense market, else 0.20 — the § 558 Abs. 3 Kappungsgrenze. */
    capPercent: number;
    /** Earliest date the next §558 increase may take effect, respecting the
     *  Sperrfrist since the last one. */
    earliestEffectiveDate: string;
    /** Legal ceiling for the next increase: the rolling-3-year Kappungsgrenze
     *  room, further capped by the comparison-rent target when one is set. */
    legalMaxAmount: number;
    /** manualOverrideAmount ?? legalMaxAmount — what the proposal card shows
     *  as the amount to act on. */
    proposedAmount: number;
    exceedsLegalMax: boolean;
}

/** § 558 BGB — Vergleichsmietenerhöhung. Formulas mirror rentCalculator.ts's
 *  `plan558` (Sperrfrist clamp, rolling-3-year window measured against the
 *  rent as it stood when the window opened, dense-market 15%/20% split). */
export function computeProposal558(input: Proposal558Input): Proposal558Result {
    const denseMarket = isDenseMarket(input.city);
    const capPercent = denseMarket ? 0.15 : 0.2;
    const intervalMonths = Math.min(60, Math.max(15, input.rentIncreaseIntervalMonths ?? 12));

    const earliestEffectiveDate = input.lastIncreaseDate
        ? fmt(addMonths(toDate(input.lastIncreaseDate), intervalMonths))
        : fmt(new Date());
    const proposalDate = toDate(earliestEffectiveDate);

    const windowStart = addMonths(proposalDate, -35);
    const usedInWindow = input.priorIncreases
        .filter((entry) => {
            const d = toDate(entry.effectiveDate);
            return d >= windowStart && d <= proposalDate;
        })
        .reduce((sum, entry) => sum + entry.amount, 0);

    const rentAtWindowStart = Math.max(0, input.coldRent - usedInWindow);
    const room = round2(Math.max(0, rentAtWindowStart * capPercent - usedInWindow));
    // rentIndexPerM2 growth isn't projected decades out here (unlike the
    // 50-year simulation) — this is always "the target as of today".
    const target = input.rentIndexPerM2 != null ? round2(input.rentIndexPerM2 * input.livingAreaM2) : null;
    const legalMaxAmount = round2(Math.max(0, Math.min(room, target != null ? target - input.coldRent : room)));

    const proposedAmount = input.manualOverrideAmount ?? legalMaxAmount;
    const exceedsLegalMax = proposedAmount > legalMaxAmount + EPSILON;

    return { denseMarket, capPercent, earliestEffectiveDate, legalMaxAmount, proposedAmount, exceedsLegalMax };
}

export interface Proposal559Input {
    coldRent: number;
    livingAreaM2: number;
    /** Geplante Sanierungskosten, € total — null when not yet entered. */
    plannedRenovationCost: number | null;
    /** The most recent §559 increase (from tenancy_adjustment_history,
     *  adjustmentType 'renovation'), or null if none yet. */
    lastIncrease: { effectiveDate: string; monthlyAmount: number } | null;
    manualOverrideAmount: number | null;
}

export interface Proposal559Result {
    /** 2 €/m² when the current rent is below 7 €/m², else 3 €/m². */
    capPerM2: number;
    capAbsOver6Years: number;
    /** Room left under the 6-year €/m² cap after what's already been used
     *  within the trailing 72 months. */
    remainingRoom: number;
    /** min(8 % of cost per year, remainingRoom) — the true legal ceiling. */
    recommendedAmount: number;
    /** manualOverrideAmount ?? recommendedAmount. */
    proposedAmount: number;
    exceedsLegalMax: boolean;
}

/** § 559 BGB — Modernisierungsmieterhöhung. Formulas mirror
 *  rentCalculator.ts's `capRoomAt`/`buildPlanFromPlacements` (8 %-of-cost/
 *  year cap, 2€/3€-per-m² ceiling over a rolling 6 years). */
export function computeProposal559(input: Proposal559Input): Proposal559Result {
    const rentPerM2 = input.livingAreaM2 > 0 ? input.coldRent / input.livingAreaM2 : 0;
    const capPerM2 = rentPerM2 < 7 ? 2 : 3;
    const capAbsOver6Years = round2(capPerM2 * input.livingAreaM2);

    const usedFromLastIncrease = input.lastIncrease
        ? (() => {
            const monthsAgo = differenceInCalendarMonths(new Date(), toDate(input.lastIncrease!.effectiveDate));
            return monthsAgo >= 0 && monthsAgo < 72 ? Math.max(0, input.lastIncrease!.monthlyAmount) : 0;
        })()
        : 0;
    const remainingRoom = round2(Math.max(0, capAbsOver6Years - usedFromLastIncrease));

    const recommendedAmount = input.plannedRenovationCost != null
        ? round2(Math.min((0.08 * input.plannedRenovationCost) / 12, remainingRoom))
        : 0;

    const proposedAmount = input.manualOverrideAmount ?? recommendedAmount;
    const exceedsLegalMax = proposedAmount > recommendedAmount + EPSILON;

    return { capPerM2, capAbsOver6Years, remainingRoom, recommendedAmount, proposedAmount, exceedsLegalMax };
}

/**
 * Lazy monthly rollover: if `targetDate` has already fully passed with no
 * decision made, carries it forward one month (same day-of-month) so the
 * proposal reflects "today" again — called once when tenancy data loads.
 * Returns null when no rollover is due.
 */
export function rolloverTargetDateIfDue(targetDate: string, today: Date = new Date()): string | null {
    const target = toDate(targetDate);
    if (target >= today) return null;
    return fmt(addMonths(target, 1));
}
