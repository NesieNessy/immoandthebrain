import { authFetch } from '@/lib/api/authFetch';
import { propertyResourceRequest } from '@/lib/api/propertyResources';
import type { TaxExpenseCategory, TaxExpenseDocument } from '@immoandthebrain/types';

function toDocument(row: Record<string, unknown>): TaxExpenseDocument {
    return {
        taxExpenseDocumentId: row.tax_expense_document_id as number,
        taxExpenseCategoryId: row.tax_expense_category_id as number,
        propertyId: row.property_id as number,
        storagePath: row.storage_path as string,
        fileName: row.file_name as string,
        amount: Number(row.amount ?? 0),
        createdAt: row.created_at as string,
    };
}

function toCategory(row: Record<string, unknown>): TaxExpenseCategory {
    return {
        taxExpenseCategoryId: row.tax_expense_category_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        label: row.label as string,
        amount: Number(row.amount ?? 0),
        elsterReference: row.elster_reference as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getTaxExpenseDocumentsByCategory(categoryId: number): Promise<TaxExpenseDocument[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tax-expense-documents', {}, { categoryId });
    return data?.map(toDocument) ?? [];
}

/** Every tax expense document the current user owns, across all their
 *  properties — no propertyId/categoryId filter, relying on the dispatcher's
 *  own ownership check. Used by the global Dokumente overview so uploads
 *  made here also surface there. */
export async function getTaxExpenseDocumentsByUser(): Promise<TaxExpenseDocument[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tax-expense-documents');
    return data?.map(toDocument) ?? [];
}

/** Signed URL for viewing/downloading. Goes through the server (service
 *  role) rather than the browser's Supabase client — the bucket is private
 *  and RLS-gated on a real auth.uid(), which AUTH_BYPASS mode never
 *  establishes, so an anon-key request would be rejected regardless of
 *  ownership. The route re-checks ownership from the path itself. */
export async function getTaxExpenseDocumentUrl(storagePath: string): Promise<string | null> {
    const response = await authFetch(`/api/tax-expense-documents/storage?path=${encodeURIComponent(storagePath)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.url ?? null;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

/** Uploads one receipt with the amount it contributes — the server stores
 *  the file, records the document, and bumps the parent category's running
 *  total by `amount` in the same request. Returns both the new document and
 *  the category's updated total so the caller doesn't need a second fetch. */
export async function uploadTaxExpenseDocument(
    categoryId: number,
    file: File,
    amount: number,
): Promise<{ document: TaxExpenseDocument; category: TaxExpenseCategory } | null> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('categoryId', String(categoryId));
    formData.append('amount', String(amount));
    const response = await authFetch('/api/tax-expense-documents/storage', { method: 'POST', body: formData });
    if (!response.ok) return null;
    const data = await response.json();
    return { document: toDocument(data.document), category: toCategory(data.category) };
}

export async function deleteTaxExpenseDocument(taxExpenseDocumentId: number): Promise<{ category: TaxExpenseCategory } | null> {
    const response = await authFetch(`/api/tax-expense-documents/storage?id=${taxExpenseDocumentId}`, { method: 'DELETE' });
    if (!response.ok) return null;
    const data = await response.json();
    return { category: toCategory(data.category) };
}
