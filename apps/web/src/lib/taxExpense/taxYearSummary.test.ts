import { describe, expect, it } from 'vitest';
import { availableTaxYears, summarizeTaxYear } from './taxYearSummary';
import type { TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';

function category(overrides: Partial<TaxExpenseCategory> = {}): TaxExpenseCategory {
    return {
        taxExpenseCategoryId: 1,
        propertyId: 1,
        sortOrder: 0,
        label: 'Fahrtkosten',
        amount: 0,
        elsterReference: null,
        manuallyComplete: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function document(overrides: Partial<TaxExpenseDocument> = {}): TaxExpenseDocument {
    return {
        taxExpenseDocumentId: 1,
        taxExpenseCategoryId: 1,
        propertyId: 1,
        storagePath: 'path',
        fileName: 'beleg.pdf',
        amount: 100,
        createdAt: '2025-06-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('availableTaxYears', () => {
    it('includes every year a document was created in, deduplicated and descending', () => {
        const docs = [
            document({ createdAt: '2023-03-01T00:00:00.000Z' }),
            document({ createdAt: '2025-01-01T00:00:00.000Z' }),
            document({ createdAt: '2023-11-01T00:00:00.000Z' }),
        ];
        const years = availableTaxYears(docs);
        expect(years).toContain(2025);
        expect(years).toContain(2023);
        expect(new Set(years).size).toBe(years.length);
        expect(years).toEqual([...years].sort((a, b) => b - a));
    });

    it('always includes the current year even with no documents', () => {
        expect(availableTaxYears([])).toEqual([new Date().getFullYear()]);
    });
});

describe('summarizeTaxYear', () => {
    it('is "complete" when every category has at least one document that year', () => {
        const categories = [category({ taxExpenseCategoryId: 1, label: 'A' }), category({ taxExpenseCategoryId: 2, label: 'B' })];
        const docs = [
            document({ taxExpenseCategoryId: 1, amount: 100 }),
            document({ taxExpenseCategoryId: 2, amount: 50 }),
        ];
        const result = summarizeTaxYear(categories, docs, 2025);
        expect(result.status).toBe('complete');
        expect(result.missingCount).toBe(0);
        expect(result.uploadedCategoryCount).toBe(2);
        expect(result.totalAmount).toBe(150);
    });

    it('is "partial" when some but not all categories are missing documents', () => {
        const categories = [category({ taxExpenseCategoryId: 1 }), category({ taxExpenseCategoryId: 2 })];
        const docs = [document({ taxExpenseCategoryId: 1, amount: 100 })];
        const result = summarizeTaxYear(categories, docs, 2025);
        expect(result.status).toBe('partial');
        expect(result.missingCount).toBe(1);
    });

    it('is "incomplete" when no category has any document that year', () => {
        const categories = [category({ taxExpenseCategoryId: 1 }), category({ taxExpenseCategoryId: 2 })];
        const result = summarizeTaxYear(categories, [], 2025);
        expect(result.status).toBe('incomplete');
        expect(result.missingCount).toBe(2);
        expect(result.totalAmount).toBe(0);
    });

    it('is "complete" (trivially) when there are no categories at all', () => {
        const result = summarizeTaxYear([], [], 2025);
        expect(result.status).toBe('complete');
        expect(result.categoryCount).toBe(0);
    });

    it('only counts documents uploaded in the requested calendar year', () => {
        const categories = [category({ taxExpenseCategoryId: 1 })];
        const docs = [
            document({ taxExpenseCategoryId: 1, amount: 100, createdAt: '2024-06-01T00:00:00.000Z' }),
            document({ taxExpenseCategoryId: 1, amount: 50, createdAt: '2025-06-01T00:00:00.000Z' }),
        ];
        const result2024 = summarizeTaxYear(categories, docs, 2024);
        expect(result2024.totalAmount).toBe(100);
        expect(result2024.categories[0].documents).toHaveLength(1);

        const result2025 = summarizeTaxYear(categories, docs, 2025);
        expect(result2025.totalAmount).toBe(50);
    });

    it('orders categories by sortOrder', () => {
        const categories = [
            category({ taxExpenseCategoryId: 1, label: 'Second', sortOrder: 1 }),
            category({ taxExpenseCategoryId: 2, label: 'First', sortOrder: 0 }),
        ];
        const result = summarizeTaxYear(categories, [], 2025);
        expect(result.categories.map((c) => c.label)).toEqual(['First', 'Second']);
    });

    it('treats a manually-complete category as covered even with zero documents', () => {
        const categories = [
            category({ taxExpenseCategoryId: 1, manuallyComplete: true }),
            category({ taxExpenseCategoryId: 2, manuallyComplete: false }),
        ];
        const docs = [document({ taxExpenseCategoryId: 2, amount: 20 })];
        const result = summarizeTaxYear(categories, docs, 2025);
        expect(result.status).toBe('complete');
        expect(result.missingCount).toBe(0);
        expect(result.categories[0].covered).toBe(true);
        expect(result.categories[0].amount).toBe(0);
        expect(result.categories[0].documents).toHaveLength(0);
    });

    it('documentCount is the actual number of receipts, not the number of covered categories — a category can have more than one', () => {
        const categories = [category({ taxExpenseCategoryId: 1 }), category({ taxExpenseCategoryId: 2 })];
        const docs = [
            document({ taxExpenseCategoryId: 1, amount: 10 }),
            document({ taxExpenseCategoryId: 1, amount: 15 }),
            document({ taxExpenseCategoryId: 1, amount: 5 }),
        ];
        const result = summarizeTaxYear(categories, docs, 2025);
        expect(result.uploadedCategoryCount).toBe(1);
        expect(result.documentCount).toBe(3);
    });
});
