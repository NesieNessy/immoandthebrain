import { describe, expect, it } from 'vitest';
import {
    compareBudgetCoverage,
    compareSettlementCoverage,
    computeUnitSettlementSummary,
    defaultSettlementPeriod,
    isFullCalendarYear,
    prorateAnnualPrepayment,
    splitByAllocable,
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
});

describe('computeUnitSettlementSummary', () => {
    const costItems = [
        { actualAmount: 4000, budgetAmount: 4400, allocable: true, actualShareOverride: null, budgetShareOverride: null },
        { actualAmount: 1000, budgetAmount: 1000, allocable: false, actualShareOverride: null, budgetShareOverride: null },
    ];

    it('splits the property-wide cost items by this unit\'s living-area share', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        // Only the allocable row counts toward the unit's share: 4000 * (50/200) = 1000.
        expect(result.unitActualShare).toBe(1000);
        expect(result.unitBudgetShare).toBe(1100);
        expect(result.annualPrepayment).toBe(1200);
        expect(result.overUnderCoverage).toBeCloseTo(-200, 2);
        expect(result.settlementCoverage).toBe('surplus');
        expect(result.newMonthlyPrepayment).toBeCloseTo(1100 / 12, 2);
    });

    it('respects a manual share override instead of the automatic living-area split', () => {
        const result = computeUnitSettlementSummary({
            costItems: [{ actualAmount: 4000, budgetAmount: 4400, allocable: true, actualShareOverride: 1500, budgetShareOverride: null }],
            unitLivingAreaM2: 50,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        expect(result.unitActualShare).toBe(1500);
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

    it('returns zero shares when the unit has no living area on record', () => {
        const result = computeUnitSettlementSummary({
            costItems,
            unitLivingAreaM2: null,
            totalLivingAreaM2: 200,
            currentMonthlyPrepayment: 100,
            miscRentHistory: [],
            periodStart: new Date(2026, 0, 1),
            periodEnd: new Date(2026, 11, 31),
        });
        expect(result.unitActualShare).toBe(0);
        expect(result.unitBudgetShare).toBe(0);
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
