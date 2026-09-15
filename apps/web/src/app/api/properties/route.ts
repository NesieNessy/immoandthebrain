import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function mapProperty(row: Record<string, unknown>) {
  return {
    propertyId: Number(row.property_id),
    userId: String(row.user_id),
    cityId: row.city_id == null ? null : Number(row.city_id),
    propertyAbbreviation: row.property_abbreviation == null ? null : String(row.property_abbreviation),
    street: String(row.street),
    houseNumber: row.house_number == null ? '' : String(row.house_number),
    city: String(row.city),
    postalCode: String(row.postal_code),
    federalState: row.federal_state == null ? '' : String(row.federal_state),
    squareMeters: row.square_meters == null ? 0 : Number(row.square_meters),
    numberOfRooms: row.number_of_rooms == null ? null : Number(row.number_of_rooms),
    yearOfConstruction: Number(row.year_of_construction),
    energyEfficient: row.energy_efficient ?? null,
    imageUrl: row.image_base64 ?? null,
    propertyCategory: row.property_category ?? null,
    numberOfUnits: Number(row.number_of_units ?? 1),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(Object.hasOwn(row, 'is_rented') ? { isRented: Boolean(row.is_rented) } : {}),
    ...(Object.hasOwn(row, 'purchase_price')
      ? { purchasePrice: row.purchase_price == null ? null : Number(row.purchase_price) }
      : {}),
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const { rows } = await db.query(
      `SELECT * FROM property_overview WHERE user_id = $1 AND property_id = $2 LIMIT 1`,
      [userId, Number(id)],
    );
    if (!rows[0]) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
    return NextResponse.json(mapProperty(rows[0]));
  }
  const { rows } = await db.query(
    `SELECT * FROM property_overview WHERE user_id = $1 ORDER BY property_abbreviation NULLS LAST, property_id`,
    [userId],
  );
  return NextResponse.json(rows.map(mapProperty));
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const yearOfConstruction = Number(input.yearOfConstruction);
  const squareMeters = input.squareMeters == null ? null : Number(input.squareMeters);
  const numberOfRooms = input.numberOfRooms == null ? null : Number(input.numberOfRooms);
  const numberOfUnits = Number(input.numberOfUnits ?? 1);

  const currentYear = new Date().getFullYear();

  if (
    !String(input.street ?? '').trim() ||
    !String(input.city ?? '').trim() ||
    !/^\d{5}$/.test(String(input.postalCode ?? '')) ||
    !Number.isInteger(yearOfConstruction) || yearOfConstruction < 1800 || yearOfConstruction > currentYear ||
    (squareMeters != null && (!Number.isFinite(squareMeters) || squareMeters <= 0)) ||
    (numberOfRooms != null && (!Number.isFinite(numberOfRooms) || numberOfRooms <= 0)) ||
    !Number.isInteger(numberOfUnits) || numberOfUnits < 1
  ) {
    return NextResponse.json({ error: 'Ungültige Objektdaten.' }, { status: 400 });
  }

  const { rows } = await db.query(
    `
      INSERT INTO property (
        user_id, city_id, property_abbreviation, street, house_number, city,
        postal_code, federal_state, square_meters, number_of_rooms,
        year_of_construction, energy_efficient, image_base64,
        property_category, number_of_units
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `,
    [
      userId,
      input.cityId ?? null,
      input.propertyAbbreviation ?? null,
      String(input.street).trim(),
      String(input.houseNumber ?? '').trim(),
      String(input.city).trim(),
      String(input.postalCode).trim(),
      String(input.federalState ?? '').trim(),
      squareMeters,
      numberOfRooms,
      yearOfConstruction,
      input.energyEfficient || null,
      input.imageUrl ?? null,
      input.propertyCategory ?? null,
      numberOfUnits,
    ],
  );

  return NextResponse.json(mapProperty(rows[0]), { status: 201 });
}

const UPDATE_COLUMNS = {
  cityId: 'city_id',
  propertyAbbreviation: 'property_abbreviation',
  street: 'street',
  houseNumber: 'house_number',
  city: 'city',
  postalCode: 'postal_code',
  federalState: 'federal_state',
  squareMeters: 'square_meters',
  numberOfRooms: 'number_of_rooms',
  yearOfConstruction: 'year_of_construction',
  energyEfficient: 'energy_efficient',
  imageUrl: 'image_base64',
  propertyCategory: 'property_category',
  numberOfUnits: 'number_of_units',
  archivedAt: 'archived_at',
} as const;

/** Validates only the fields actually present in a PATCH's `updates` — this
 *  endpoint is shared by many partial-update use cases (Objektdaten form,
 *  archiving, image updates, ...), so a field absent from this particular
 *  call is never required. Mirrors POST's rules for whichever fields a
 *  caller does include, so a bad value fails with a clean 400 here instead
 *  of an empty string silently satisfying a NOT NULL column, or a raw DB
 *  CHECK-constraint violation surfacing as an unhandled 500. */
function findUpdateError(updates: Record<string, unknown>): string | null {
  if (Object.hasOwn(updates, 'street') && !String(updates.street ?? '').trim()) return 'street';
  if (Object.hasOwn(updates, 'city') && !String(updates.city ?? '').trim()) return 'city';
  if (Object.hasOwn(updates, 'postalCode') && !/^\d{5}$/.test(String(updates.postalCode ?? ''))) return 'postalCode';
  if (Object.hasOwn(updates, 'yearOfConstruction')) {
    const year = Number(updates.yearOfConstruction);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1800 || year > currentYear) return 'yearOfConstruction';
  }
  if (Object.hasOwn(updates, 'squareMeters') && updates.squareMeters != null) {
    const value = Number(updates.squareMeters);
    if (!Number.isFinite(value) || value <= 0) return 'squareMeters';
  }
  if (Object.hasOwn(updates, 'numberOfRooms') && updates.numberOfRooms != null) {
    const value = Number(updates.numberOfRooms);
    if (!Number.isFinite(value) || value <= 0) return 'numberOfRooms';
  }
  if (Object.hasOwn(updates, 'numberOfUnits')) {
    const value = Number(updates.numberOfUnits);
    if (!Number.isInteger(value) || value < 1) return 'numberOfUnits';
  }
  return null;
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const propertyId = Number(input.propertyId);
  if (!Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Ungültige Objekt-ID.' }, { status: 400 });
  }

  const updates = input.updates ?? {};
  const entries = Object.entries(UPDATE_COLUMNS)
    .filter(([key]) => Object.hasOwn(updates, key));
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übermittelt.' }, { status: 400 });
  }

  const invalidField = findUpdateError(updates);
  if (invalidField) {
    return NextResponse.json({ error: `Ungültiger Wert für Feld "${invalidField}".` }, { status: 400 });
  }

  const assignments = entries.map(([, column], index) => `${column} = $${index + 3}`);
  assignments.push('updated_at = NOW()');
  const values = entries.map(([key]) =>
    key === 'street' || key === 'city' || key === 'postalCode'
      ? String(updates[key]).trim()
      : updates[key],
  );
  const { rows } = await db.query(
    `UPDATE property SET ${assignments.join(', ')} WHERE property_id = $1 AND user_id = $2 RETURNING *`,
    [propertyId, userId, ...values],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  return NextResponse.json(mapProperty(rows[0]));
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Ungültige Objekt-ID.' }, { status: 400 });
  }
  const result = await db.query('DELETE FROM property WHERE property_id = $1 AND user_id = $2', [id, userId]);
  if (!result.rowCount) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
