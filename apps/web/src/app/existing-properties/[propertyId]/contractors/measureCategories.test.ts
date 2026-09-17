import { describe, expect, it } from 'vitest';
import { estimateRange, MEASURE_CATEGORY_ESTIMATES } from './measureCategories';

describe('estimateRange', () => {
    it('sums min/max across every line item for a known category', () => {
        const items = MEASURE_CATEGORY_ESTIMATES.Fenster;
        const expectedMin = items.reduce((sum, i) => sum + i.min, 0);
        const expectedMax = items.reduce((sum, i) => sum + i.max, 0);

        expect(estimateRange('Fenster')).toEqual({ min: expectedMin, max: expectedMax });
    });

    it('returns null for a category with no reference data (e.g. "Sonstige")', () => {
        expect(estimateRange('Sonstige')).toBeNull();
    });

    it('returns null for null/unknown categories', () => {
        expect(estimateRange(null)).toBeNull();
        expect(estimateRange('Nicht existent')).toBeNull();
    });

    it('min is always less than or equal to max for every category with reference data', () => {
        for (const category of Object.keys(MEASURE_CATEGORY_ESTIMATES)) {
            const range = estimateRange(category);
            expect(range).not.toBeNull();
            expect(range!.min).toBeLessThanOrEqual(range!.max);
        }
    });
});
