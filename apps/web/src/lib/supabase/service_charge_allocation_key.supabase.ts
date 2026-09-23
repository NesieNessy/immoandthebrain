import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { ServiceChargeAllocationKey, ServiceChargeAllocationKeyInsert, ServiceChargeAllocationKeyUpdate } from '@immoandthebrain/types';

function toAllocationKey(row: Record<string, unknown>): ServiceChargeAllocationKey {
    return {
        serviceChargeAllocationKeyId: row.service_charge_allocation_key_id as number,
        propertyUnitId: row.property_unit_id as number,
        propertyId: row.property_id as number,
        label: row.label as string,
        numerator: Number(row.numerator),
        denominator: Number(row.denominator),
        allocationType: row.allocation_type as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

/** Every explicitly stored allocation key for one unit — small (at most one
 *  per cost item label), so fetched in full and matched against a label at
 *  the call site rather than adding a per-label query param. */
export async function getAllocationKeysByUnit(propertyId: number, propertyUnitId: number): Promise<ServiceChargeAllocationKey[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('service-charge-allocation-keys', {}, { propertyId, propertyUnitId });
    return data?.map(toAllocationKey) ?? [];
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createAllocationKey(payload: ServiceChargeAllocationKeyInsert): Promise<ServiceChargeAllocationKey | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-allocation-keys', jsonRequest('POST', { values: {
        property_unit_id: payload.propertyUnitId,
        property_id: payload.propertyId,
        label: payload.label,
        numerator: payload.numerator,
        denominator: payload.denominator,
        allocation_type: payload.allocationType,
    } }));
    if (!data) return null;
    return toAllocationKey(data);
}

export async function updateAllocationKey(
    allocationKeyId: number,
    updates: ServiceChargeAllocationKeyUpdate,
): Promise<ServiceChargeAllocationKey | null> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.label !== undefined) dbUpdates.label = updates.label;
    if (updates.numerator !== undefined) dbUpdates.numerator = updates.numerator;
    if (updates.denominator !== undefined) dbUpdates.denominator = updates.denominator;
    if (updates.allocationType !== undefined) dbUpdates.allocation_type = updates.allocationType;

    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-allocation-keys', jsonRequest('PATCH', { id: allocationKeyId, values: dbUpdates }));
    if (!data) return null;
    return toAllocationKey(data);
}

export async function deleteAllocationKey(allocationKeyId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('service-charge-allocation-keys', { method: 'DELETE' }, { id: allocationKeyId }));
}
