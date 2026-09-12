import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import { supabase } from '@/lib/supabase/client.supabase';
import type { TaxExpenseDocument } from '@immoandthebrain/types';

const BUCKET = 'tax-expense-documents';

function toDocument(row: Record<string, unknown>): TaxExpenseDocument {
    return {
        taxExpenseDocumentId: row.tax_expense_document_id as number,
        taxExpenseCategoryId: row.tax_expense_category_id as number,
        propertyId: row.property_id as number,
        storagePath: row.storage_path as string,
        fileName: row.file_name as string,
        createdAt: row.created_at as string,
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

/** Signed URL for viewing/downloading — the bucket is private. */
export async function getTaxExpenseDocumentUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error || !data) return null;
    return data.signedUrl;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function uploadTaxExpenseDocument(userId: string, propertyId: number, categoryId: number, file: File): Promise<TaxExpenseDocument | null> {
    const storagePath = `${userId}/${propertyId}/${categoryId}/beleg-${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) return null;

    const data = await propertyResourceRequest<Record<string, unknown>>('tax-expense-documents', jsonRequest('POST', { values: {
        tax_expense_category_id: categoryId,
        property_id: propertyId,
        storage_path: storagePath,
        file_name: file.name,
    } }));
    if (!data) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return null;
    }
    return toDocument(data);
}

export async function deleteTaxExpenseDocument(taxExpenseDocumentId: number, storagePath: string): Promise<boolean> {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return Boolean(await propertyResourceRequest<{ deleted: number }>('tax-expense-documents', { method: 'DELETE' }, { id: taxExpenseDocumentId }));
}
