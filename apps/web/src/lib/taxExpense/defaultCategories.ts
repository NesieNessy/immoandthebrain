import { createTaxExpenseCategory } from '@/lib/supabase/tax_expense_category.supabase';
import type { TaxExpenseCategory } from '@immoandthebrain/types';

/** Every property is guaranteed to have these — matching
 *  Fahrtkosten/Übernachtungskosten/etc. across the app's reference
 *  material — rather than making the user build the list from scratch.
 *  They're ordinary rows once created: rename, retotal, or delete freely,
 *  and "+ Kategorie hinzufügen" adds more the same way. */
export const DEFAULT_TAX_EXPENSE_CATEGORY_LABELS = ['Fahrtkosten', 'Übernachtungskosten', 'Mahlzeiten', 'Spesen', 'Reparaturen', 'Sonderumlagen'];

/** Which reference defaults `existingCategories` is still missing (matched
 *  by label, trimmed + case-insensitive) — the pure part of
 *  `ensureDefaultTaxExpenseCategories`, split out so it's testable without
 *  touching the network. */
export function missingDefaultTaxExpenseCategoryLabels(existingCategories: Pick<TaxExpenseCategory, 'label'>[]): string[] {
    const existingLabels = new Set(existingCategories.map((c) => c.label.trim().toLowerCase()));
    return DEFAULT_TAX_EXPENSE_CATEGORY_LABELS.filter((label) => !existingLabels.has(label.trim().toLowerCase()));
}

/** Tops up `existingCategories` with whichever of the reference defaults are
 *  still missing — for a brand-new property that's never had a category,
 *  and equally for one that already has some but is missing others (e.g.
 *  only picked up a smaller set synced from another property). Returns the
 *  full, now-complete category list; a no-op (no writes) when nothing is
 *  missing. */
export async function ensureDefaultTaxExpenseCategories(propertyId: number, existingCategories: TaxExpenseCategory[]): Promise<TaxExpenseCategory[]> {
    const missingLabels = missingDefaultTaxExpenseCategoryLabels(existingCategories);
    if (missingLabels.length === 0) return existingCategories;

    const created = await Promise.all(missingLabels.map((label, index) =>
        createTaxExpenseCategory({ propertyId, sortOrder: existingCategories.length + index, label, amount: 0, elsterReference: null }),
    ));
    return [...existingCategories, ...created.filter((c): c is TaxExpenseCategory => c !== null)];
}
