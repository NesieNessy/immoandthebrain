import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import type { Property, PropertyInsert, PropertyUpdate, PropertyWithCity } from '@immoandthebrain/types';

function toProperty(row: Record<string, unknown>): Property {
  return {
    propertyId: row.property_id as number,
    userId: row.user_id as string,
    cityId: row.city_id as number | null,
    street: row.street as string,
    houseNumber: row.house_number as string,
    city: row.city as string,
    postalCode: row.postal_code as string,
    federalState: row.federal_state as string,
    squareMeters: row.square_meters as number,
    numberOfRooms: row.number_of_rooms as number | null,
    yearOfConstruction: row.year_of_construction as number,
    energyEfficient: row.energy_efficient as Property['energyEfficient'],
    propertyAbbreviation: row.property_abbreviation as string | null,
    propertyCategory: (row.property_category as string | null) ?? null,
    imageUrl: row.image_base64 as string | null,
    numberOfUnits: row.number_of_units as number,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toPropertyWithCity(row: Record<string, unknown>): PropertyWithCity {
  const cityRel = row.city_rel as Record<string, unknown>;
  return {
    ...toProperty(row),
    cityRel: {
      cityId: cityRel.city_id as number,
      cityName: cityRel.city_name as string,
      metropolitanArea: cityRel.metropolitan_area as string,
      buildingShare: cityRel.building_share as number,
      landShare: cityRel.land_share as number,
    },
  };
}

/**
 * property + fields from the property_overview view that aren't plain
 * columns on `property`:
 *   - isRented: TRUE if any tenancy row for this property has is_rented
 *   - purchasePrice: from acquisition_costs (NULL if never entered)
 * (propertyCategory is a real column on `property` — see Property — the
 * view just falls back to the linked detail-check's value when it's unset.)
 */
export interface PropertyOverview extends Property {
  isRented: boolean;
  purchasePrice: number | null;
}

export async function getProperties(userId: string): Promise<Property[]> {
  void userId;
  const response = await authFetch('/api/properties', { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json() as Promise<Property[]>;
}

export async function getPropertiesOverview(userId: string): Promise<PropertyOverview[]> {
  void userId;
  const response = await authFetch('/api/properties', { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json() as Promise<PropertyOverview[]>;
}

export async function getPropertiesWithCity(userId: string): Promise<PropertyWithCity[]> {
  const { data, error } = await supabase
    .from('property')
    .select(`
      *,
      city_rel:city (
        city_id,
        city_name,
        metropolitan_area,
        building_share,
        land_share
      )
    `)
    .eq('user_id', userId)
    .order('property_abbreviation', { ascending: true });

  if (error || !data) return [];
  return data.map(toPropertyWithCity);
}

// Property detail is fetched independently by several components in quick
// succession while navigating property → unit hub → a use-case page (each
// resolves its own propertyId/unitId props from scratch). A short-lived
// cache turns that string of redundant round-trips back into one, without
// risking staleness beyond a few seconds — invalidated immediately on any
// write below anyway.
const PROPERTY_CACHE_TTL_MS = 15_000;
const propertyCache = new Map<number, { data: PropertyOverview; expiresAt: number }>();

export function invalidatePropertyCache(propertyId: number) {
  propertyCache.delete(propertyId);
}

async function fetchPropertyOverview(propertyId: number): Promise<PropertyOverview | null> {
  const cached = propertyCache.get(propertyId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const response = await authFetch(`/api/properties?id=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json() as PropertyOverview;
  propertyCache.set(propertyId, { data, expiresAt: Date.now() + PROPERTY_CACHE_TTL_MS });
  return data;
}

export async function getPropertyById(propertyId: number): Promise<Property | null> {
  return fetchPropertyOverview(propertyId);
}

export async function getPropertyOverviewById(propertyId: number): Promise<PropertyOverview | null> {
  return fetchPropertyOverview(propertyId);
}

export async function getPropertyWithCityById(propertyId: number): Promise<PropertyWithCity | null> {
  const { data, error } = await supabase
    .from('property')
    .select(`
      *,
      city_rel:city (
        city_id,
        city_name,
        metropolitan_area,
        building_share,
        land_share
      )
    `)
    .eq('property_id', propertyId)
    .single();

  if (error || !data) return null;
  return toPropertyWithCity(data);
}

export async function createProperty(payload: PropertyInsert): Promise<Property | null> {
  const response = await authFetch('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null) as Property | { error?: string } | null;
  if (!response.ok) {
    throw new Error(result && 'error' in result && result.error
      ? result.error
      : 'Objekt konnte nicht gespeichert werden.');
  }
  return result as Property;
}

export async function updateProperty(propertyId: number, updates: PropertyUpdate): Promise<Property | null> {
  const response = await authFetch('/api/properties', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId, updates }),
  });
  invalidatePropertyCache(propertyId);
  if (!response.ok) return null;
  return response.json() as Promise<Property>;
}

export async function deleteProperty(propertyId: number): Promise<boolean> {
  const response = await authFetch(`/api/properties?id=${encodeURIComponent(propertyId)}`, { method: 'DELETE' });
  invalidatePropertyCache(propertyId);
  return response.ok;
}

/** Archives a property instead of deleting it — hidden from the default
 *  Bestandsobjekte list, still reachable via "Verlauf". */
export async function archiveProperty(propertyId: number): Promise<Property | null> {
  return updateProperty(propertyId, { archivedAt: new Date().toISOString() });
}
