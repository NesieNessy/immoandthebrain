import type { TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';

export interface TaxYearCategoryBreakdown {
    categoryId: number;
    label: string;
    /** Sum of this category's receipts uploaded in the given year — not the
     *  category's own all-time running `amount` (which spans every year). */
    amount: number;
    documents: TaxExpenseDocument[];
    /** Manual override — this category is treated as done even though it has
     *  no receipts for this year (or any year), e.g. because it genuinely
     *  doesn't apply to this property. */
    manuallyComplete: boolean;
    /** Has at least one receipt this year, or is manually marked complete —
     *  the single flag everything else (missingCount/status) is derived from. */
    covered: boolean;
}

export type TaxCompletionStatus = 'complete' | 'partial' | 'incomplete';

export interface TaxYearBreakdown {
    year: number;
    categories: TaxYearCategoryBreakdown[];
    totalAmount: number;
    categoryCount: number;
    uploadedCategoryCount: number;
    missingCount: number;
    status: TaxCompletionStatus;
}

/** Every calendar year with at least one receipt among `documents`, plus the
 *  current year (so the result is never empty for a first-time property),
 *  descending. */
export function availableTaxYears(documents: TaxExpenseDocument[]): number[] {
    const years = new Set(documents.map((d) => new Date(d.createdAt).getFullYear()));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
}

/** Buckets `documents` by category for exactly one calendar year and derives
 *  the per-category and overall totals/completion status. Shared by the
 *  per-property Steuerunterlagen page (one property) and the cross-property
 *  Steuerübersicht (called once per property there). */
export function summarizeTaxYear(categories: TaxExpenseCategory[], documents: TaxExpenseDocument[], year: number): TaxYearBreakdown {
    const docsByCategory = new Map<number, TaxExpenseDocument[]>();
    for (const document of documents) {
        if (new Date(document.createdAt).getFullYear() !== year) continue;
        if (!docsByCategory.has(document.taxExpenseCategoryId)) docsByCategory.set(document.taxExpenseCategoryId, []);
        docsByCategory.get(document.taxExpenseCategoryId)!.push(document);
    }

    const categoryBreakdowns: TaxYearCategoryBreakdown[] = categories
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => {
            const documentsForYear = docsByCategory.get(category.taxExpenseCategoryId) ?? [];
            return {
                categoryId: category.taxExpenseCategoryId,
                label: category.label,
                amount: documentsForYear.reduce((sum, document) => sum + document.amount, 0),
                documents: documentsForYear,
                manuallyComplete: category.manuallyComplete,
                covered: documentsForYear.length > 0 || category.manuallyComplete,
            };
        });

    const uploadedCategoryCount = categoryBreakdowns.filter((category) => category.covered).length;
    const missingCount = categoryBreakdowns.length - uploadedCategoryCount;
    const status: TaxCompletionStatus = categoryBreakdowns.length === 0 || missingCount === 0
        ? 'complete'
        : uploadedCategoryCount === 0
            ? 'incomplete'
            : 'partial';

    return {
        year,
        categories: categoryBreakdowns,
        totalAmount: categoryBreakdowns.reduce((sum, category) => sum + category.amount, 0),
        categoryCount: categoryBreakdowns.length,
        uploadedCategoryCount,
        missingCount,
        status,
    };
}
