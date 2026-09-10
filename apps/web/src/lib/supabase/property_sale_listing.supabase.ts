import { authFetch } from '@/lib/api/authFetch';
import type { PropertySaleListing, PropertySaleListingUpdate } from '@immoandthebrain/types';

function toPropertySaleListing(row: Record<string, unknown>): PropertySaleListing {
  return {
    propertySaleListingId: row.property_sale_listing_id as number,
    propertyId: row.property_id as number,
    street: row.street as string | null,
    houseNumber: row.house_number as string | null,
    postalCode: row.postal_code as string | null,
    city: row.city as string | null,
    squareMeters: row.square_meters != null ? Number(row.square_meters) : null,
    condition: row.condition as PropertySaleListing['condition'],
    yearOfConstruction: row.year_of_construction as number | null,
    energyEfficient: row.energy_efficient as PropertySaleListing['energyEfficient'],
    floor: row.floor as number | null,
    numberOfRooms: row.number_of_rooms as number | null,
    heatingType: row.heating_type as PropertySaleListing['heatingType'],
    isRented: row.is_rented as boolean | null,
    coldRent: row.cold_rent != null ? Number(row.cold_rent) : null,
    serviceCharges: row.service_charges != null ? Number(row.service_charges) : null,
    parkingSpaceCount: row.parking_space_count as number | null,
    parkingSpaceType: row.parking_space_type as PropertySaleListing['parkingSpaceType'],
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    parkingSpaceSalePrice: row.parking_space_sale_price != null ? Number(row.parking_space_sale_price) : null,
    availableFrom: row.available_from as string | null,
    brokerCommissionPercent: row.broker_commission_percent != null ? Number(row.broker_commission_percent) : null,
    description: row.description as string | null,
    status: row.status as PropertySaleListing['status'],
    publishedAt: row.published_at as string | null,
    selectedPortals: (row.selected_portals as string[] | null) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getPropertySaleListing(propertyId: number): Promise<PropertySaleListing | null> {
  const response = await authFetch(`/api/property-sale-listing?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const row = await response.json() as Record<string, unknown> | null;
  return row ? toPropertySaleListing(row) : null;
}

/** Upserts the one listing row for a property — insert on first Speichern/
 *  Veröffentlichen, update from then on. */
export async function savePropertySaleListing(propertyId: number, fields: PropertySaleListingUpdate): Promise<PropertySaleListing | null> {
  const response = await authFetch('/api/property-sale-listing', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId, fields }),
  });
  if (!response.ok) return null;
  const row = await response.json() as Record<string, unknown>;
  return toPropertySaleListing(row);
}
