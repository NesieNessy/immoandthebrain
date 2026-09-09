import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { TenancyAdjustmentHistoryEntry, TenancyAdjustmentHistoryInsert } from '@immoandthebrain/types';

function toHistoryEntry(row: Record<string, unknown>): TenancyAdjustmentHistoryEntry {
    return {
        historyId: row.history_id as number,
        tenancyId: row.tenancy_id as number,
        propertyId: row.property_id as number,
        adjustmentType: row.adjustment_type as TenancyAdjustmentHistoryEntry['adjustmentType'],
        effectiveDate: row.effective_date as string | null,
        amount: row.amount as number | null,
        note: row.note as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

export async function getAdjustmentHistoryByTenancy(tenancyId: number): Promise<TenancyAdjustmentHistoryEntry[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tenancy-adjustment-history', {}, { tenancyId });
    return data?.map(toHistoryEntry) ?? [];
}

export async function addAdjustmentHistoryEntry(payload: TenancyAdjustmentHistoryInsert): Promise<TenancyAdjustmentHistoryEntry | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('tenancy-adjustment-history', jsonRequest('POST', { values: {
        tenancy_id: payload.tenancyId,
        property_id: payload.propertyId,
        adjustment_type: payload.adjustmentType,
        effective_date: payload.effectiveDate,
        amount: payload.amount,
        note: payload.note,
    } }));
    if (!data) return null;
    return toHistoryEntry(data);
}
