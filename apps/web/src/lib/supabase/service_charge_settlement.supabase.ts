import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import { supabase } from '@/lib/supabase/client.supabase';
import type { ServiceChargeSettlement, ServiceChargeSettlementInsert, ServiceChargeSettlementUpdate } from '@immoandthebrain/types';

/** Reuses the tenancy-documents bucket for the settlement's optional source
 *  document (the property-management/utility invoice this settlement was
 *  built from) — same "{userId}/..." ownership prefix, just a different
 *  subpath, so no dedicated bucket/policies are needed for this one attachment. */
const BUCKET = 'tenancy-documents';

function toSettlement(row: Record<string, unknown>): ServiceChargeSettlement {
    return {
        serviceChargeSettlementId: row.service_charge_settlement_id as number,
        propertyId: row.property_id as number,
        periodStart: row.period_start as string,
        periodEnd: row.period_end as string,
        sourceDocumentName: row.source_document_name as string | null,
        sourceDocumentPath: row.source_document_path as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getSettlementsByProperty(propertyId: number): Promise<ServiceChargeSettlement[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('service-charge-settlements', {}, { propertyId });
    return data?.map(toSettlement) ?? [];
}

/** The most recent settlement (by settlement-period end date) for a
 *  property — null means no service charge settlement has been started yet. */
export async function getCurrentSettlementByProperty(propertyId: number): Promise<ServiceChargeSettlement | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-settlements', {}, { propertyId, current: true, single: true });
    if (!data) return null;
    return toSettlement(data);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createSettlement(payload: ServiceChargeSettlementInsert): Promise<ServiceChargeSettlement | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-settlements', jsonRequest('POST', { values: {
        property_id: payload.propertyId,
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
        source_document_name: payload.sourceDocumentName,
        source_document_path: payload.sourceDocumentPath,
    } }));
    if (!data) return null;
    return toSettlement(data);
}

export async function updateSettlement(
    settlementId: number,
    updates: ServiceChargeSettlementUpdate,
): Promise<ServiceChargeSettlement | null> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.periodStart !== undefined) dbUpdates.period_start = updates.periodStart;
    if (updates.periodEnd !== undefined) dbUpdates.period_end = updates.periodEnd;
    if (updates.sourceDocumentName !== undefined) dbUpdates.source_document_name = updates.sourceDocumentName;
    if (updates.sourceDocumentPath !== undefined) dbUpdates.source_document_path = updates.sourceDocumentPath;

    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-settlements', jsonRequest('PATCH', { id: settlementId, values: dbUpdates }));
    if (!data) return null;
    return toSettlement(data);
}

export async function deleteSettlement(settlementId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('service-charge-settlements', { method: 'DELETE' }, { id: settlementId }));
}

// ----------------------------------------------------------------------------
// Source document (Upload)
// ----------------------------------------------------------------------------

export async function uploadSettlementSourceDocument(userId: string, propertyId: number, file: File): Promise<{ path: string; name: string } | null> {
    const storagePath = `${userId}/service-charge/${propertyId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || undefined });
    if (error) return null;
    return { path: storagePath, name: file.name };
}

export async function getSettlementSourceDocumentUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error || !data) return null;
    return data.signedUrl;
}

export async function removeSettlementSourceDocument(storagePath: string): Promise<void> {
    await supabase.storage.from(BUCKET).remove([storagePath]);
}
