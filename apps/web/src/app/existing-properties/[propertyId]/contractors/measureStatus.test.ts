import { describe, expect, it } from 'vitest';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { canConfirmCustomerCompletion, isLocked, summarizeMeasures } from './measureStatus';

function measure(overrides: Partial<RenovationMeasure> = {}): RenovationMeasure {
    return {
        renovationMeasureId: 1,
        propertyId: 1,
        sortOrder: 0,
        title: 'Badsanierung',
        category: null,
        description: null,
        estimatedCost: null,
        quotedCost: null,
        budgetMin: null,
        budgetMax: null,
        preferredStartDate: null,
        quotedStartDate: null,
        actualCompletionDate: null,
        published: false,
        publishedAt: null,
        quoteAccepted: false,
        craftsmanConfirmedCompleted: false,
        customerConfirmedCompleted: false,
        craftsmanNotes: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('isLocked', () => {
    it('is locked once a quote is accepted', () => {
        expect(isLocked(measure({ quoteAccepted: true }))).toBe(true);
        expect(isLocked(measure({ quoteAccepted: false }))).toBe(false);
    });
});

describe('canConfirmCustomerCompletion', () => {
    it('requires both craftsman confirmation and an actual completion date', () => {
        expect(canConfirmCustomerCompletion(measure({ craftsmanConfirmedCompleted: false, actualCompletionDate: null }))).toBe(false);
        expect(canConfirmCustomerCompletion(measure({ craftsmanConfirmedCompleted: true, actualCompletionDate: null }))).toBe(false);
        expect(canConfirmCustomerCompletion(measure({ craftsmanConfirmedCompleted: false, actualCompletionDate: '2025-06-01' }))).toBe(false);
        expect(canConfirmCustomerCompletion(measure({ craftsmanConfirmedCompleted: true, actualCompletionDate: '2025-06-01' }))).toBe(true);
    });
});

describe('summarizeMeasures', () => {
    it('sums estimatedCost across every measure regardless of status', () => {
        const result = summarizeMeasures([
            measure({ estimatedCost: 1000 }),
            measure({ estimatedCost: 2500 }),
            measure({ estimatedCost: null }),
        ]);
        expect(result.totalEstimated).toBe(3500);
    });

    it('only counts measures that have a quotedCost toward quotedCount/totalQuoted', () => {
        const result = summarizeMeasures([
            measure({ quotedCost: 4000 }),
            measure({ quotedCost: null }),
            measure({ quotedCost: 1500 }),
        ]);
        expect(result.quotedCount).toBe(2);
        expect(result.totalQuoted).toBe(5500);
    });

    it('computes deviation as the sum of (quotedCost - estimatedCost) over quoted measures only', () => {
        const result = summarizeMeasures([
            measure({ estimatedCost: 3000, quotedCost: 3500 }), // +500 over
            measure({ estimatedCost: 5000, quotedCost: 4000 }), // -1000 under
            measure({ estimatedCost: 1000, quotedCost: null }), // not quoted, excluded entirely
        ]);
        expect(result.deviation).toBe(-500);
    });

    it('treats a quoted measure with no estimate as fully "over budget" by its whole quotedCost', () => {
        // Documents current, intentional-but-worth-knowing behavior: a
        // missing baseline is NOT excluded from the deviation sum, it's
        // treated as an estimatedCost of 0.
        const result = summarizeMeasures([measure({ estimatedCost: null, quotedCost: 5000 })]);
        expect(result.deviation).toBe(5000);
    });

    it('returns zeroed totals for an empty measure list', () => {
        const result = summarizeMeasures([]);
        expect(result).toEqual({ totalEstimated: 0, quotedCount: 0, totalQuoted: 0, deviation: 0 });
    });
});
