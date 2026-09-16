import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { TaxExpenseCategory, TaxExpenseCategoryInsert, TaxExpenseCategoryUpdate } from '@immoandthebrain/types';

function toCategory(row: Record<string, unknown>): TaxExpenseCategory {
    return {
        taxExpenseCategoryId: row.tax_expense_category_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        label: row.label as string,
        amount: Number(row.amount ?? 0),
        elsterReference: row.elster_reference as string | null,
        manuallyComplete: Boolean(row.manually_complete),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getTaxExpenseCategoriesByProperty(propertyId: number): Promise<TaxExpenseCategory[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tax-expense-categories', {}, { propertyId });
    return data?.map(toCategory) ?? [];
}

/** Every tax expense category the current user owns, across all their
 *  properties — no propertyId filter, relying on the dispatcher's own
 *  ownership check. Used by the Steuerübersicht dashboard overview. */
export async function getTaxExpenseCategoriesByUser(): Promise<TaxExpenseCategory[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tax-expense-categories');
    return data?.map(toCategory) ?? [];
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createTaxExpenseCategory(payload: TaxExpenseCategoryInsert): Promise<TaxExpenseCategory | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('tax-expense-categories', jsonRequest('POST', { values: {
        property_id: payload.propertyId,
        sort_order: payload.sortOrder,
        label: payload.label,
        amount: payload.amount,
        elster_reference: payload.elsterReference,
        manually_complete: payload.manuallyComplete ?? false,
    } }));
    if (!data) return null;
    return toCategory(data);
}

export async function updateTaxExpenseCategory(
    taxExpenseCategoryId: number,
    updates: TaxExpenseCategoryUpdate,
): Promise<TaxExpenseCategory | null> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.label !== undefined) dbUpdates.label = updates.label;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.elsterReference !== undefined) dbUpdates.elster_reference = updates.elsterReference;
    if (updates.manuallyComplete !== undefined) dbUpdates.manually_complete = updates.manuallyComplete;

    const data = await propertyResourceRequest<Record<string, unknown>>('tax-expense-categories', jsonRequest('PATCH', { id: taxExpenseCategoryId, values: dbUpdates }));
    if (!data) return null;
    return toCategory(data);
}

export async function deleteTaxExpenseCategory(taxExpenseCategoryId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('tax-expense-categories', { method: 'DELETE' }, { id: taxExpenseCategoryId }));
}
