// ==============================================================================
// ImmoAndTheBrain – Supabase Client: acquisition_costs
// ==============================================================================
import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { AcquisitionCosts, AcquisitionCostsInsert, AcquisitionCostsUpdate } from '@immoandthebrain/types';

function toAcquisitionCosts(row: Record<string, unknown>): AcquisitionCosts {
  return {
    acquisitionCostsId:         row.acquisition_costs_id as number,
    propertyId:                 row.property_id as number,
    parkingSpaceId:             row.parking_space_id as number | null,
    propertyPurchasePrice:      row.property_purchase_price as number,
    pricePerSqm:                row.price_per_sqm as number | null,
    broker:                     row.broker as number | null,
    brokerValue:                row.broker_value as number | null,
    notary:                     row.notary as number | null,
    notaryValue:                row.notary_value as number | null,
    landRegistry:               row.land_registry as number | null,
    landRegistryValue:          row.land_registry_value as number | null,
    realEstateTax:              row.real_estate_tax as number | null,
    realEstateTaxValue:         row.real_estate_tax_value as number | null,
    adjustmentVariable:         row.adjustment_variable as number | null,
    adjustmentVariableValue:    row.adjustment_variable_value as number | null,
    totalAncillaryCostsValue:   row.total_ancillary_costs_value as number | null,
    totalAncillaryCosts:        row.total_ancillary_costs as number | null,
    parkingSpacePurchasePrice:  row.parking_space_purchase_price as number | null,
    createdAt:                  row.created_at as string,
    updatedAt:                  row.updated_at as string,
  };
}

export async function getAcquisitionCosts(propertyId: number): Promise<AcquisitionCosts[]> {
  const data = await propertyResourceRequest<Record<string, unknown>[]>('acquisition-costs', {}, { propertyId });
  return data?.map(toAcquisitionCosts) ?? [];
}

export async function getAcquisitionCostsById(acquisitionCostsId: number): Promise<AcquisitionCosts | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('acquisition-costs', {}, { id: acquisitionCostsId });
  if (!data) return null;
  return toAcquisitionCosts(data);
}

export async function createAcquisitionCosts(payload: AcquisitionCostsInsert): Promise<AcquisitionCosts | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('acquisition-costs', jsonRequest('POST', { values: {
      property_id:                  payload.propertyId,
      parking_space_id:             payload.parkingSpaceId ?? null,
      property_purchase_price:      payload.propertyPurchasePrice,
      price_per_sqm:                payload.pricePerSqm ?? null,
      broker:                       payload.broker ?? null,
      broker_value:                 payload.brokerValue ?? null,
      notary:                       payload.notary ?? null,
      notary_value:                 payload.notaryValue ?? null,
      land_registry:                payload.landRegistry ?? null,
      land_registry_value:          payload.landRegistryValue ?? null,
      real_estate_tax:              payload.realEstateTax ?? null,
      real_estate_tax_value:        payload.realEstateTaxValue ?? null,
      adjustment_variable:          payload.adjustmentVariable ?? null,
      adjustment_variable_value:    payload.adjustmentVariableValue ?? null,
      total_ancillary_costs_value:  payload.totalAncillaryCostsValue ?? null,
      total_ancillary_costs:        payload.totalAncillaryCosts ?? null,
      parking_space_purchase_price: payload.parkingSpacePurchasePrice ?? null,
    } }));
  if (!data) return null;
  return toAcquisitionCosts(data);
}

export async function updateAcquisitionCosts(acquisitionCostsId: number, updates: AcquisitionCostsUpdate): Promise<AcquisitionCosts | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.parkingSpaceId !== undefined)            dbUpdates.parking_space_id              = updates.parkingSpaceId;
  if (updates.propertyPurchasePrice !== undefined)     dbUpdates.property_purchase_price       = updates.propertyPurchasePrice;
  if (updates.pricePerSqm !== undefined)               dbUpdates.price_per_sqm                 = updates.pricePerSqm;
  if (updates.broker !== undefined)                    dbUpdates.broker                        = updates.broker;
  if (updates.brokerValue !== undefined)               dbUpdates.broker_value                  = updates.brokerValue;
  if (updates.notary !== undefined)                    dbUpdates.notary                        = updates.notary;
  if (updates.notaryValue !== undefined)               dbUpdates.notary_value                  = updates.notaryValue;
  if (updates.landRegistry !== undefined)              dbUpdates.land_registry                 = updates.landRegistry;
  if (updates.landRegistryValue !== undefined)         dbUpdates.land_registry_value           = updates.landRegistryValue;
  if (updates.realEstateTax !== undefined)             dbUpdates.real_estate_tax               = updates.realEstateTax;
  if (updates.realEstateTaxValue !== undefined)        dbUpdates.real_estate_tax_value         = updates.realEstateTaxValue;
  if (updates.adjustmentVariable !== undefined)        dbUpdates.adjustment_variable           = updates.adjustmentVariable;
  if (updates.adjustmentVariableValue !== undefined)   dbUpdates.adjustment_variable_value     = updates.adjustmentVariableValue;
  if (updates.totalAncillaryCostsValue !== undefined)  dbUpdates.total_ancillary_costs_value   = updates.totalAncillaryCostsValue;
  if (updates.totalAncillaryCosts !== undefined)       dbUpdates.total_ancillary_costs         = updates.totalAncillaryCosts;
  if (updates.parkingSpacePurchasePrice !== undefined) dbUpdates.parking_space_purchase_price  = updates.parkingSpacePurchasePrice;
  const data = await propertyResourceRequest<Record<string, unknown>>('acquisition-costs', jsonRequest('PATCH', { id: acquisitionCostsId, values: dbUpdates }));
  if (!data) return null;
  return toAcquisitionCosts(data);
}

export async function deleteAcquisitionCosts(acquisitionCostsId: number): Promise<boolean> {
  return Boolean(await propertyResourceRequest<{ deleted: number }>('acquisition-costs', { method: 'DELETE' }, { id: acquisitionCostsId }));
}
