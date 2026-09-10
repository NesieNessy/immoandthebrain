import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { PropertyRnd, PropertyRndInsert } from '@immoandthebrain/types';

function toPropertyRnd(row: Record<string, unknown>): PropertyRnd {
  return {
    propertyRndId:          row.property_rnd_id as number,
    propertyId:             row.property_id as number,
    rndMode:                row.rnd_mode as PropertyRnd['rndMode'],
    modernizationRoof:      row.modernization_roof as string | null,
    modernizationWindows:   row.modernization_windows as string | null,
    modernizationLines:     row.modernization_lines as string | null,
    modernizationHeating:   row.modernization_heating as string | null,
    modernizationFacade:    row.modernization_facade as string | null,
    modernizationBathrooms: row.modernization_bathrooms as string | null,
    modernizationInterior:  row.modernization_interior as string | null,
    remainingUsefulLifeYears: Number(row.remaining_useful_life_years),
    afaPercent:              Number(row.afa_percent),
    createdAt:              row.created_at as string,
    updatedAt:              row.updated_at as string,
  };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getPropertyRndByProperty(propertyId: number): Promise<PropertyRnd | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('property-rnd', {}, { propertyId, single: true });
  if (!data) return null;
  return toPropertyRnd(data);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function upsertPropertyRnd(payload: PropertyRndInsert): Promise<PropertyRnd | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('property-rnd', jsonRequest('POST', { upsert: true, values: {
        property_id:             payload.propertyId,
        rnd_mode:                payload.rndMode,
        modernization_roof:      payload.modernizationRoof,
        modernization_windows:   payload.modernizationWindows,
        modernization_lines:     payload.modernizationLines,
        modernization_heating:   payload.modernizationHeating,
        modernization_facade:    payload.modernizationFacade,
        modernization_bathrooms: payload.modernizationBathrooms,
        modernization_interior:  payload.modernizationInterior,
        remaining_useful_life_years: payload.remainingUsefulLifeYears,
        afa_percent:              payload.afaPercent,
      } }));
  if (!data) return null;
  return toPropertyRnd(data);
}
