/* eslint-disable @typescript-eslint/no-explicit-any */
import { authFetch } from '@/lib/api/authFetch';
import type {
  PropertyUnit,
  ServiceChargeSettlement,
  ServiceChargeCostItem,
  Tenancy,
} from '@immoandthebrain/types';

function toPropertyUnit(row: Record<string, unknown>): PropertyUnit {
  return {
    propertyUnitId: row.property_unit_id as number,
    propertyId: row.property_id as number,
    unitLabel: row.unit_label as string,
    sortOrder: row.sort_order as number,
    usageType: row.usage_type as any,
    floor: row.floor as string | null,
    locationNote: row.location_note as string | null,
    livingAreaM2: row.living_area_m2 as number | null,
    numberOfRooms: row.number_of_rooms as number | null,
    yearOfConstruction: row.year_of_construction as number | null,
    energyEfficient: row.energy_efficient as any | null,
    numberOfParkingSpaces: row.number_of_parking_spaces as number,
    targetColdRent: row.target_cold_rent as number | null,
    targetParkingRent: row.target_parking_rent as number | null,
    targetAncillaryCosts: row.target_ancillary_costs as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

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

function toTenancy(row: Record<string, unknown>): Tenancy {
  return {
    tenancyId: row.tenancy_id as number,
    maintenanceCostsId: row.maintenance_costs_id as number | null,
    parkingSpaceId: row.parking_space_id as number | null,
    propertyId: row.property_id as number,
    propertyUnitId: row.property_unit_id as number | null,
    isRented: row.is_rented as boolean | null,
    tenancyStartDate: row.tenancy_start_date as string | null,
    tenancyEndDate: row.tenancy_end_date as string | null,
    tenancyType: row.tenancy_type as any | null,
    tenancyUnits: row.tenancy_units as number | null,
    tenancyUnitsPrice: row.tenancy_units_price as number | null,
    parkingSpaceRent: row.parking_space_rent as number | null,
    miscRent: row.misc_rent as number | null,
    warmRent: row.warm_rent as number | null,
    coldRent: row.cold_rent as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    tenantFirstName: row.tenant_first_name as string,
    tenantLastName: row.tenant_last_name as string,
    deposit: row.deposit as number,
    nextRentAdjustmentDate: row.next_rent_adjustment_date as string | null,
    nextRentAdjustmentAmount: row.next_rent_adjustment_amount as number | null,
    renovationAdjustmentPlanned: row.renovation_adjustment_planned as boolean | null,
    renovationAdjustmentStartDate: row.renovation_adjustment_start_date as string | null,
    renovationAdjustmentEndDate: row.renovation_adjustment_end_date as string | null,
    renovationAdjustmentAmount: row.renovation_adjustment_amount as number | null,
    rentAdjustmentReminderDate: row.rent_adjustment_reminder_date as string | null,
    renovationAdjustmentReminderDate: row.renovation_adjustment_reminder_date as string | null,
    petsAllowed: row.pets_allowed as any | null,
    redecorationClause: row.redecoration_clause as any | null,
    subletAllowed: row.sublet_allowed as any | null,
    additionalTerms: row.additional_terms as string | null,
    acceptanceProtocol: row.acceptance_protocol as boolean,
    depositPaidOut: row.deposit_paid_out as boolean,
  };
}

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

export async function getAggregatedSettlementData(propertyId: number, propertyUnitId?: number) {
  const q = new URLSearchParams();
  q.set('propertyId', String(propertyId));
  if (propertyUnitId !== undefined) q.set('propertyUnitId', String(propertyUnitId));
  const response = await authFetch(`/api/settlement-aggregate?${q.toString()}`, { cache: 'no-store' });
  if (!response.ok) return { units: [], settlement: null, tenancy: null, costItems: [] };
  const data = await response.json() as { units: Record<string, unknown>[]; settlement: Record<string, unknown> | null; tenancy: Record<string, unknown> | null; costItems: Record<string, unknown>[] };
  return {
    units: (data.units ?? []).map(toPropertyUnit),
    settlement: data.settlement ? toSettlement(data.settlement) : null,
    tenancy: data.tenancy ? toTenancy(data.tenancy) : null,
    costItems: (data.costItems ?? []).map(toCostItem),
  };
}
