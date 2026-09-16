import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX_EXPENSE_CATEGORY_LABELS, missingDefaultTaxExpenseCategoryLabels } from './defaultCategories';

describe('missingDefaultTaxExpenseCategoryLabels', () => {
    it('returns every default label for a brand-new property with no categories', () => {
        expect(missingDefaultTaxExpenseCategoryLabels([])).toEqual(DEFAULT_TAX_EXPENSE_CATEGORY_LABELS);
    });

    it('returns nothing once every default is already present', () => {
        const existing = DEFAULT_TAX_EXPENSE_CATEGORY_LABELS.map((label) => ({ label }));
        expect(missingDefaultTaxExpenseCategoryLabels(existing)).toEqual([]);
    });

    it('matches existing labels case-insensitively and ignoring surrounding whitespace', () => {
        const existing = DEFAULT_TAX_EXPENSE_CATEGORY_LABELS.map((label) => ({ label: `  ${label.toUpperCase()}  ` }));
        expect(missingDefaultTaxExpenseCategoryLabels(existing)).toEqual([]);
    });

    it('returns only the defaults that are actually missing, in reference order', () => {
        const existing = [{ label: 'Mahlzeiten' }, { label: 'Sonderumlagen' }];
        const missing = missingDefaultTaxExpenseCategoryLabels(existing);
        expect(missing).toEqual(['Fahrtkosten', 'Übernachtungskosten', 'Spesen', 'Reparaturen']);
    });

    it('ignores custom (non-default) categories — they neither satisfy nor affect the defaults', () => {
        const existing = [{ label: 'Sonstiges' }, { label: 'Bürobedarf' }];
        expect(missingDefaultTaxExpenseCategoryLabels(existing)).toEqual(DEFAULT_TAX_EXPENSE_CATEGORY_LABELS);
    });
});
