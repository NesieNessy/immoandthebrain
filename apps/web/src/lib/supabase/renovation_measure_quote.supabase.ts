import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import { supabase } from '@/lib/supabase/client.supabase';
import type { RenovationMeasureQuote, RenovationMeasureQuoteInsert } from '@immoandthebrain/types';

const BUCKET = 'renovation-measure-files';

function toQuote(row: Record<string, unknown>): RenovationMeasureQuote {
    return {
        renovationMeasureQuoteId: row.renovation_measure_quote_id as number,
        renovationMeasureId: row.renovation_measure_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        companyName: row.company_name as string,
        cost: row.cost == null ? null : Number(row.cost),
        documentPath: row.document_path as string | null,
        documentFileName: row.document_file_name as string | null,
        accepted: row.accepted as boolean,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getQuotesByMeasure(measureId: number): Promise<RenovationMeasureQuote[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('renovation-measure-quotes', {}, { measureId });
    return data?.map(toQuote) ?? [];
}

/** Signed URL for viewing/downloading a quote's document — the bucket is private. */
export async function getQuoteDocumentUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error || !data) return null;
    return data.signedUrl;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createQuote(
    payload: Omit<RenovationMeasureQuoteInsert, 'documentPath' | 'documentFileName' | 'accepted'>,
    userId: string,
    file?: File | null,
): Promise<RenovationMeasureQuote | null> {
    let documentPath: string | null = null;
    let documentFileName: string | null = null;
    if (file) {
        documentPath = `${userId}/${payload.propertyId}/${payload.renovationMeasureId}/quote-${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from(BUCKET).upload(documentPath, file, { contentType: file.type || undefined });
        if (error) return null;
        documentFileName = file.name;
    }

    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measure-quotes', jsonRequest('POST', { values: {
        renovation_measure_id: payload.renovationMeasureId,
        property_id: payload.propertyId,
        sort_order: payload.sortOrder,
        company_name: payload.companyName,
        cost: payload.cost,
        document_path: documentPath,
        document_file_name: documentFileName,
        accepted: false,
    } }));
    if (!data) {
        if (documentPath) await supabase.storage.from(BUCKET).remove([documentPath]);
        return null;
    }
    return toQuote(data);
}

export async function setQuoteAccepted(renovationMeasureQuoteId: number, accepted: boolean): Promise<RenovationMeasureQuote | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measure-quotes', jsonRequest('PATCH', { id: renovationMeasureQuoteId, values: { accepted } }));
    if (!data) return null;
    return toQuote(data);
}

export async function deleteQuote(renovationMeasureQuoteId: number, documentPath: string | null): Promise<boolean> {
    if (documentPath) await supabase.storage.from(BUCKET).remove([documentPath]);
    return Boolean(await propertyResourceRequest<{ deleted: number }>('renovation-measure-quotes', { method: 'DELETE' }, { id: renovationMeasureQuoteId }));
}
