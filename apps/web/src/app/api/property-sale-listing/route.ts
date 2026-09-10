import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function requireOwnedProperty(propertyId: number, userId: string): Promise<boolean> {
  const property = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [propertyId, userId]);
  return property.rowCount! > 0;
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const propertyId = Number(new URL(request.url).searchParams.get('propertyId'));
  if (!Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Ungültige Objekt-ID.' }, { status: 400 });
  }
  if (!(await requireOwnedProperty(propertyId, userId))) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }

  const { rows } = await db.query('SELECT * FROM property_sale_listing WHERE property_id = $1', [propertyId]);
  return NextResponse.json(rows[0] ?? null);
}

// Upserts the one listing row for a property — insert on first Speichern/
// Veröffentlichen, update from then on.
export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const propertyId = Number(input.propertyId);
  if (!Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Ungültige Objekt-ID.' }, { status: 400 });
  }
  if (!(await requireOwnedProperty(propertyId, userId))) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }

  const f = input.fields ?? {};
  const { rows } = await db.query(
    `
      INSERT INTO property_sale_listing (
        property_id, street, house_number, postal_code, city, square_meters, year_of_construction,
        energy_efficient, floor, number_of_rooms, is_rented, cold_rent, service_charges, parking_space_count,
        condition, heating_type, parking_space_type, sale_price, parking_space_sale_price, available_from,
        broker_commission_percent, description, status, published_at, selected_portals
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
      )
      ON CONFLICT (property_id) DO UPDATE SET
        street = $2, house_number = $3, postal_code = $4, city = $5, square_meters = $6, year_of_construction = $7,
        energy_efficient = $8, floor = $9, number_of_rooms = $10, is_rented = $11, cold_rent = $12, service_charges = $13,
        parking_space_count = $14, condition = $15, heating_type = $16, parking_space_type = $17, sale_price = $18,
        parking_space_sale_price = $19, available_from = $20, broker_commission_percent = $21, description = $22,
        status = $23, published_at = $24, selected_portals = $25
      RETURNING *
    `,
    [
      propertyId, f.street ?? null, f.houseNumber ?? null, f.postalCode ?? null, f.city ?? null,
      f.squareMeters ?? null, f.yearOfConstruction ?? null, f.energyEfficient ?? null, f.floor ?? null,
      f.numberOfRooms ?? null, f.isRented ?? null, f.coldRent ?? null, f.serviceCharges ?? null,
      f.parkingSpaceCount ?? null, f.condition ?? null, f.heatingType ?? null, f.parkingSpaceType ?? null,
      f.salePrice ?? null, f.parkingSpaceSalePrice ?? null, f.availableFrom ?? null,
      f.brokerCommissionPercent ?? null, f.description ?? null, f.status ?? 'draft',
      f.publishedAt ?? null, f.selectedPortals ?? [],
    ],
  );
  return NextResponse.json(rows[0]);
}
