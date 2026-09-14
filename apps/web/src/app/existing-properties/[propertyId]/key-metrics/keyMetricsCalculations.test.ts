import { describe, expect, it } from 'vitest';
import {
    computeCashFlow,
    computeDevelopment,
    computeGrossYield,
    computeMonthlyDebtService,
    computeNetYield,
    computePricePerSqm,
    computeReturnOnEquity,
    computeTaxFreeSaleDate,
    formatYearsMonthsUntil,
    projectRent,
} from './keyMetricsCalculations';

describe('computeDevelopment', () => {
    it('computes absolute and percentage change from a baseline', () => {
        const result = computeDevelopment(1000, 1052);
        expect(result.absoluteChange).toBe(52);
        expect(result.percentChange).toBeCloseTo(5.2, 5);
    });

    it('returns 0% change when there is no baseline', () => {
        const result = computeDevelopment(0, 500);
        expect(result.percentChange).toBe(0);
    });
});

describe('computeMonthlyDebtService', () => {
    it('applies the annuity formula (interest + repayment) / 12', () => {
        expect(computeMonthlyDebtService(200000, 3, 2)).toBeCloseTo((200000 * 0.05) / 12, 1);
    });

    it('is 0 when there is no loan', () => {
        expect(computeMonthlyDebtService(0, 3, 2)).toBe(0);
    });
});

describe('computeCashFlow', () => {
    it('subtracts debt service and non-allocable costs from cold rent', () => {
        expect(computeCashFlow(1250, 890, 0)).toBe(360);
    });
});

describe('projectRent', () => {
    it('compounds annually over the given number of years', () => {
        expect(projectRent(1000, 5, 2)).toBeCloseTo(1000 * 1.05 * 1.05, 5);
    });

    it('returns the current rent unchanged for 0 years', () => {
        expect(projectRent(1000, 5, 0)).toBe(1000);
    });
});

describe('computeGrossYield / computeNetYield', () => {
    it('computes gross yield as annual rent over purchase price', () => {
        expect(computeGrossYield(15000, 485000)).toBeCloseTo((15000 / 485000) * 100, 1);
    });

    it('computes net yield after deducting non-allocable costs', () => {
        expect(computeNetYield(15000, 2000, 485000)).toBeCloseTo(((15000 - 2000) / 485000) * 100, 1);
    });

    it('returns 0 without a purchase price', () => {
        expect(computeGrossYield(15000, 0)).toBe(0);
        expect(computeNetYield(15000, 2000, 0)).toBe(0);
    });
});

describe('computeReturnOnEquity', () => {
    it('divides annual cash flow by equity', () => {
        expect(computeReturnOnEquity(4320, 67500)).toBeCloseTo((4320 / 67500) * 100, 5);
    });

    it('returns 0 without equity', () => {
        expect(computeReturnOnEquity(4320, 0)).toBe(0);
    });
});

describe('computePricePerSqm', () => {
    it('divides purchase price by living area', () => {
        expect(computePricePerSqm(485000, 72)).toBeCloseTo(485000 / 72, 1);
    });
});

describe('computeTaxFreeSaleDate / formatYearsMonthsUntil', () => {
    it('is exactly ten years after the purchase date', () => {
        const result = computeTaxFreeSaleDate('2019-01-15');
        expect(result.getFullYear()).toBe(2029);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(15);
    });

    it('formats the remaining time as "X J. Y M."', () => {
        const target = computeTaxFreeSaleDate('2019-05-13');
        const from = new Date('2026-01-13');
        expect(formatYearsMonthsUntil(target, from)).toBe('3 J. 4 M.');
    });

    it('returns null once the target date has passed', () => {
        const target = computeTaxFreeSaleDate('2010-01-01');
        expect(formatYearsMonthsUntil(target, new Date('2026-01-01'))).toBeNull();
    });
});
