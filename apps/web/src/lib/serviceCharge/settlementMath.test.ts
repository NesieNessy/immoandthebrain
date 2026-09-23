import { describe, expect, it } from 'vitest';
import {
    compareBudgetCoverage,
    compareSettlementCoverage,
    computeUnitSettlementSummary,
    defaultSettlementPeriod,
    isFullCalendarYear,
    isPeriodTooLong,
    monthlyRateAsOf,
    occupancyFraction,
    prorateAnnualPrepayment,
    splitByAllocable,
    suggestApartmentShare,
} from './settlementMath';

describe('compareSettlementCoverage', () => {
    it('flags a shortfall when the apartment share exceeds the prepayment total', () => {
        expect(compareSettlementCoverage(1200, 1000)).toBe('shortfall');
    });

    it('flags a surplus when the prepayment total exceeds the apartment share', () => {
        expect(compareSettlementCoverage(800, 1000)).toBe('surplus');
    });

    it('is balanced when equal', () => {
        expect(compareSettlementCoverage(1000, 1000)).toBe('balanced');
    });
});

describe('compareBudgetCoverage', () => {
    it('flags a surplus when the prepayment total exceeds next year\'s budgeted share', () => {
        expect(compareBudgetCoverage(1200, 1000)).toBe('surplus');
    });

    it('flags a shortfall when next year\'s budgeted share exceeds the prepayment total', () => {
        expect(compareBudgetCoverage(800, 1000)).toBe('shortfall');
    });

    it('is balanced when equal', () => {
        expect(compareBudgetCoverage(1000, 1000)).toBe('balanced');
    });
});

describe('splitByAllocable', () => {
    it('splits total costs into allocable and non-allocable buckets', () => {
        const result = splitByAllocable([
            { amount: 300, allocable: true },
            { amount: 100, allocable: false },
            { amount: 200, allocable: true },
        ]);
        expect(result).toEqual({ allocable: 500, nonAllocable: 100, total: 600 });
    });

    it('handles an empty list', () => {
        expect(splitByAllocable([])).toEqual({ allocable: 0, nonAllocable: 0, total: 0 });
    });
});

describe('prorateAnnualPrepayment', () => {
    it('annualizes the flat current value when there is no history', () => {
        expect(prorateAnnualPrepayment(100, [], new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(1200);
    });

    it('ignores an adjustment that took effect before the period starts', () => {
        const history = [{ effectiveDate: '2025-06-01', amount: 20 }];
        expect(prorateAnnualPrepayment(120, history, new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(1440);
    });

    it('ignores an adjustment that takes effect after the period ends', () => {
        const history = [{ effectiveDate: '2027-06-01', amount: 20 }];
        expect(prorateAnnualPrepayment(120, history, new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(1200);
    });

    it('prorates a single mid-year increase by days', () => {
        // 2026 is not a leap year: Jan 1 – Jun 30 = 181 days at 100/mo, Jul 1 – Dec 31 = 184 days at 120/mo.
        const history = [{ effectiveDate: '2026-07-01', amount: 20 }];
        const result = prorateAnnualPrepayment(120, history, new Date(2026, 0, 1), new Date(2026, 11, 31));
        expect(result).toBeCloseTo((1200 * 181 + 1440 * 184) / 365, 2);
    });

    it('prorates multiple changes across the period', () => {
        // Jan 1 – Mar 31 (90 days) at 80, Apr 1 – Aug 31 (153 days) at 100, Sep 1 – Dec 31 (122 days) at 130.
        const history = [
            { effectiveDate: '2026-04-01', amount: 20 },
            { effectiveDate: '2026-09-01', amount: 30 },
        ];
        const result = prorateAnnualPrepayment(130, history, new Date(2026, 0, 1), new Date(2026, 11, 31));
        const expected = (80 * 12 * 90 + 100 * 12 * 153 + 130 * 12 * 122) / 365;
        expect(result).toBeCloseTo(expected, 2);
    });

    it('a move-out year (partial period, no rate change) yields less than a full year — not monthly * 12', () => {
        // Jan 1 – Jun 30 2026 = 181 days, well short of a full year.
        const result = prorateAnnualPrepayment(100, [], new Date(2026, 0, 1), new Date(2026, 5, 30));
        expect(result).toBeCloseTo((100 * 12 * 181) / 365, 2);
        expect(result).toBeLessThan(1200);
    });

    it('a move-in year (partial period, no rate change) yields less than a full year — not monthly * 12', () => {
        // May 1 – Dec 31 2026 = 245 days.
        const result = prorateAnnualPrepayment(150, [], new Date(2026, 4, 1), new Date(2026, 11, 31));
        expect(result).toBeCloseTo((150 * 12 * 245) / 365, 2);
        expect(result).toBeLessThan(1800);
    });

    it('prorates a rate change within a partial (move-out year) period', () => {
        // Jan 1 – Jun 30 2026 = 181 days: Jan 1 – Mar 31 (90 days) at 100, Apr 1 – Jun 30 (91 days) at 120.
        const history = [{ effectiveDate: '2026-04-01', amount: 20 }];
        const result = prorateAnnualPrepayment(120, history, new Date(2026, 0, 1), new Date(2026, 5, 30));
        const expected = (100 * 12 * 90 + 120 * 12 * 91) / 365;
        expect(result).toBeCloseTo(expected, 2);
    });

    it('clips the window to the tenancy start when it begins after the settlement period does', () => {
        // Settlement period Jan 1 – Sep 20 2026, but the tenant only moved in
        // Apr 1 -> only Apr 1 – Sep 20 (173 days) should be charged, not the
        // full Jan 1 – Sep 20 span (which would wrongly include 3 months
        // before the tenancy even started).
        const result = prorateAnnualPrepayment(100, [], new Date(2026, 0, 1), new Date(2026, 8, 20), new Date(2026, 3, 1), null);
        expect(result).toBeCloseTo((100 * 12 * 173) / 365, 2);
        expect(result).toBeLessThan(prorateAnnualPrepayment(100, [], new Date(2026, 0, 1), new Date(2026, 8, 20)));
    });

    it('clips the window to the tenancy end when it ends before the settlement period does', () => {
        // Full-year settlement period, tenant moved out Jun 30 -> only
        // Jan 1 – Jun 30 (181 days) should be charged.
        const result = prorateAnnualPrepayment(100, [], new Date(2026, 0, 1), new Date(2026, 11, 31), null, new Date(2026, 5, 30));
        expect(result).toBeCloseTo((100 * 12 * 181) / 365, 2);
    });

    it('is zero when the settlement period and the tenancy do not overlap at all', () => {
        // The settlement is for 2025, but the tenancy only starts in 2026 —
        // there is no day the tenant both occupied the unit and the
        // settlement period covers, so nothing should be charged, and the
        // history walk-back (which has no relation to this period) must not
        // be allowed to produce some other nonsensical value.
        const result = prorateAnnualPrepayment(100, [], new Date(2025, 0, 1), new Date(2025, 11, 31), new Date(2026, 3, 1), null);
        expect(result).toBe(0);
    });
});

describe('monthlyRateAsOf', () => {
    it('returns the current value when there is no history', () => {
        expect(monthlyRateAsOf(245, [], new Date(2026, 11, 31))).toBe(245);
    });

    it('undoes a rate change that took effect after the target date', () => {
        // Rate increased to 245 on 2027-01-01 — as of 2026-12-31 it was still 210.
        const history = [{ effectiveDate: '2027-01-01', amount: 35 }];
        expect(monthlyRateAsOf(245, history, new Date(2026, 11, 31))).toBe(210);
    });

    it('does not change once frozen, even after a further future rate change is added', () => {
        const asOf = new Date(2026, 11, 31);
        const before = monthlyRateAsOf(245, [{ effectiveDate: '2027-01-01', amount: 35 }], asOf);
        const after = monthlyRateAsOf(280, [{ effectiveDate: '2027-01-01', amount: 35 }, { effectiveDate: '2028-01-01', amount: 35 }], asOf);
        expect(after).toBe(before);
    });

    it('keeps a rate change that took effect on or before the target date', () => {
        // Rate increased to 245 on 2026-06-01 — as of 2026-12-31 it is already 245.
        const history = [{ effectiveDate: '2026-06-01', amount: 35 }];
        expect(monthlyRateAsOf(245, history, new Date(2026, 11, 31))).toBe(245);
    });

    it('walks back through multiple future changes', () => {
        const history = [
            { effectiveDate: '2027-01-01', amount: 20 },
            { effectiveDate: '2028-01-01', amount: 30 },
        ];
        // Current (2028+) value is 300 -> undo both future-of-2026 changes -> 250.
        expect(monthlyRateAsOf(300, history, new Date(2026, 11, 31))).toBe(250);
    });
});

describe('occupancyFraction', () => {
    it('is 1 for a tenancy with no start/end bounds', () => {
        expect(occupancyFraction(new Date(2026, 0, 1), new Date(2026, 11, 31), null, null)).toBe(1);
    });

    it('is the days-occupied ÷ days-in-period ratio when the tenancy starts after the period does', () => {
        // Same scenario as the "Wert vorschlagen" motivating example: billing
        // period Jan 1 – Sep 20 2026 (263 days), tenancy starts Apr 1 (173
        // days occupied within that period).
        const result = occupancyFraction(new Date(2026, 0, 1), new Date(2026, 8, 20), new Date(2026, 3, 1), null);
        expect(result).toBeCloseTo(173 / 263, 4);
    });

    it('is 0 when the tenancy and the period do not overlap at all', () => {
        const result = occupancyFraction(new Date(2025, 0, 1), new Date(2025, 11, 31), new Date(2026, 3, 1), null);
        expect(result).toBe(0);
    });
});

describe('suggestApartmentShare', () => {
    it('multiplies the property cost by the living-area share and the occupancy fraction', () => {
        expect(suggestApartmentShare(1200, 0.1, 0.5)).toBe(60);
    });

    it('rounds to cents', () => {
        expect(suggestApartmentShare(1000, 1 / 3, 1)).toBe(333.33);
    });
});

describe('computeUnitSettlementSummary', () => {
    const costItems = [
        { actualAmount: 4000, budgetAmount: 4400, allocable: true, actualShareOverride: 1000, budgetShareOverride: 1100 },
        { actualAmount: 1000, budgetAmount: 1000, allocable: false, actualShareOverride: 500, budgetShareOverride: 500 },
    ];

    it('sums each allocable row\'s manually entered Anteil Wohnung', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        // Only the allocable row's manual override counts toward the unit's share.
        expect(result.unitActualShare).toBe(1000);
        expect(result.unitBudgetShare).toBe(1100);
        expect(result.annualPrepayment).toBe(1200);
        expect(result.overUnderCoverage).toBeCloseTo(-200, 2);
        expect(result.settlementCoverage).toBe('surplus');
        expect(result.newMonthlyPrepayment).toBeCloseTo(1100 / 12, 2);
    });

    it('never falls back to a living-area-proportional split when no manual Anteil Wohnung is entered', () => {
        // Anteil Wohnung must never be auto-derived from actualAmount/
        // budgetAmount (the whole building's cost never automatically
        // corresponds to a specific apartment's share of it) — with no
        // override entered, the row simply contributes nothing yet.
        const result = computeUnitSettlementSummary({
            costItems: [{ actualAmount: 4000, budgetAmount: 4400, allocable: true, actualShareOverride: null, budgetShareOverride: null }],
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        expect(result.unitActualShare).toBe(0);
        expect(result.unitBudgetShare).toBe(0);
    });

    it('prorates the prepayment for a partial (move-out year) period instead of a flat monthly * 12', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 5, 30),
        });
        expect(result.annualPrepayment).toBeLessThan(1200);
        expect(result.annualPrepayment).toBeCloseTo((100 * 12 * 181) / 365, 2);
    });

    it('clips the prepayment to the tenancy window when it starts after the settlement period does', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 8, 20),
            tenancyStart: new Date(2026, 3, 1),
        });
        expect(result.annualPrepayment).toBeCloseTo((100 * 12 * 173) / 365, 2);
    });

    it('regression: Mietbeginn 01.04.26, Abrechnungszeitraum 01.01.26-20.09.26, 100 €/Monat NK-Vorauszahlung -> a positive, occupancy-clipped Vorauszahlung and a green "Erstattung", never a red "Nachzahlung"', () => {
        // The exact real-world case that exposed the original bug: the
        // tenant's Vorauszahlung must be prorated over the days they
        // actually lived there within the period (01.04.26-20.09.26, 173
        // days), not the full 01.01.26-20.09.26 span (263 days) — the old
        // behavior inflated it to ~904 € and, in a worse variant of the same
        // bug, could even go negative. Below, the tenant's allocable cost
        // share (500 €, deliberately less than the correctly-clipped ~568.77
        // € Vorauszahlung) must land as a *surplus* — a green "Erstattung"
        // to the tenant — never the red "Nachzahlung" the un-clipped
        // (inflated) Vorauszahlung would have wrongly produced by making it
        // look like the tenant owed money instead of being owed a refund.
        const result = computeUnitSettlementSummary({
            costItems: [
                { actualAmount: 1000, budgetAmount: null, allocable: true, actualShareOverride: 500, budgetShareOverride: null },
            ],
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 50,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 8, 20),
            tenancyStart: new Date(2026, 3, 1),
        });

        const expectedVorauszahlung = (100 * 12 * 173) / 365; // ~568.77 €
        expect(result.annualPrepayment).toBeCloseTo(expectedVorauszahlung, 2);
        expect(result.annualPrepayment).toBeGreaterThan(0);
        // Comfortably below the old, wrongly-inflated full-period figure
        // (~904 €) — pins the fix, not just "some positive number".
        expect(result.annualPrepayment).toBeLessThan(600);

        expect(result.unitActualShare).toBe(500);
        expect(result.overUnderCoverage).toBeLessThan(0);
        expect(result.settlementCoverage).toBe('surplus');
    });

    it('computes unitShare from living area (still reported, even though Anteil Wohnung no longer derives from it)', () => {
        const result = computeUnitSettlementSummary({
            costItems: [],
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        expect(result.unitShare).toBe(0.25);
    });

    it('unitShare is zero when the unit has no living area on record', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: null,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        expect(result.unitShare).toBe(0);
    });
});

describe('isFullCalendarYear', () => {
    it('is true for Jan 1 – Dec 31 of the same year', () => {
        expect(isFullCalendarYear(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(true);
    });

    it('is false when the start date is not Jan 1', () => {
        expect(isFullCalendarYear(new Date(2026, 0, 2), new Date(2026, 11, 31))).toBe(false);
    });

    it('is false when the end date is not Dec 31', () => {
        expect(isFullCalendarYear(new Date(2026, 0, 1), new Date(2026, 11, 30))).toBe(false);
    });

    it('is false when start and end fall in different years', () => {
        expect(isFullCalendarYear(new Date(2025, 0, 1), new Date(2026, 11, 31))).toBe(false);
    });
});

describe('isPeriodTooLong', () => {
    it('is false for a plain calendar year', () => {
        expect(isPeriodTooLong(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(false);
    });

    it('is false for exactly 12 months from an arbitrary start date', () => {
        expect(isPeriodTooLong(new Date(2018, 5, 1), new Date(2019, 4, 31))).toBe(false);
    });

    it('is true for one day more than 12 months', () => {
        expect(isPeriodTooLong(new Date(2018, 5, 1), new Date(2019, 5, 1))).toBe(true);
    });

    it('is true for a period spanning several years (a tenant\'s entire multi-year tenancy, not one settlement year of it)', () => {
        expect(isPeriodTooLong(new Date(2018, 5, 1), new Date(2026, 8, 22))).toBe(true);
    });

    it('is false for a short partial-year period', () => {
        expect(isPeriodTooLong(new Date(2026, 3, 1), new Date(2026, 8, 22))).toBe(false);
    });
});

describe('defaultSettlementPeriod', () => {
    it('defaults to Jan 1 – Dec 31 of the current year when there is no move-out date', () => {
        const { start, end } = defaultSettlementPeriod(null, 2026);
        expect(start).toEqual(new Date(2026, 0, 1));
        expect(end).toEqual(new Date(2026, 11, 31));
    });

    it('ends at the move-out date instead of Dec 31 when one is given', () => {
        const moveOut = new Date(2026, 5, 15);
        const { start, end } = defaultSettlementPeriod(moveOut, 2026);
        expect(start).toEqual(new Date(2026, 0, 1));
        expect(end).toBe(moveOut);
    });

    it('uses the move-out date\'s own year for the period start, not the passed-in current year', () => {
        const moveOut = new Date(2025, 3, 10);
        const { start, end } = defaultSettlementPeriod(moveOut, 2026);
        expect(start).toEqual(new Date(2025, 0, 1));
        expect(end).toBe(moveOut);
    });
});
