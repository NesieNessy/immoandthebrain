import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { ServiceChargeCostItem, ServiceChargeCostItemInsert, ServiceChargeCostItemUpdate } from '@immoandthebrain/types';

function toCostItem(row: Record<string, unknown>): ServiceChargeCostItem {
    return {
        serviceChargeCostItemId: row.service_charge_cost_item_id as number,
        serviceChargeSettlementId: row.service_charge_settlement_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        label: row.label as string,
        allocable: row.allocable as boolean,
        actualAmount: row.actual_amount == null ? null : Number(row.actual_amount),
        budgetAmount: row.budget_amount == null ? null : Number(row.budget_amount),
        actualShareOverride: row.actual_share_override == null ? null : Number(row.actual_share_override),
        budgetShareOverride: row.budget_share_override == null ? null : Number(row.budget_share_override),
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getCostItemsBySettlement(settlementId: number): Promise<ServiceChargeCostItem[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('service-charge-cost-items', {}, { settlementId });
    return data?.map(toCostItem) ?? [];
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createCostItem(payload: ServiceChargeCostItemInsert): Promise<ServiceChargeCostItem | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-cost-items', jsonRequest('POST', { values: {
        service_charge_settlement_id: payload.serviceChargeSettlementId,
        property_id: payload.propertyId,
        sort_order: payload.sortOrder,
        label: payload.label,
        allocable: payload.allocable,
        actual_amount: payload.actualAmount,
        budget_amount: payload.budgetAmount,
        actual_share_override: payload.actualShareOverride,
        budget_share_override: payload.budgetShareOverride,
    } }));
    if (!data) return null;
    return toCostItem(data);
}

export async function updateCostItem(
    costItemId: number,
    updates: ServiceChargeCostItemUpdate,
): Promise<ServiceChargeCostItem | null> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.label !== undefined) dbUpdates.label = updates.label;
    if (updates.allocable !== undefined) dbUpdates.allocable = updates.allocable;
    if (updates.actualAmount !== undefined) dbUpdates.actual_amount = updates.actualAmount;
    if (updates.budgetAmount !== undefined) dbUpdates.budget_amount = updates.budgetAmount;
    if (updates.actualShareOverride !== undefined) dbUpdates.actual_share_override = updates.actualShareOverride;
    if (updates.budgetShareOverride !== undefined) dbUpdates.budget_share_override = updates.budgetShareOverride;

    const data = await propertyResourceRequest<Record<string, unknown>>('service-charge-cost-items', jsonRequest('PATCH', { id: costItemId, values: dbUpdates }));
    if (!data) return null;
    return toCostItem(data);
}

export async function deleteCostItem(costItemId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('service-charge-cost-items', { method: 'DELETE' }, { id: costItemId }));
}
