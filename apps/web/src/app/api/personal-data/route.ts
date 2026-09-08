import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const COLUMNS = {
  lastName: 'last_name', firstName: 'first_name', street: 'street', houseNumber: 'house_number',
  city: 'city', postalCode: 'postal_code', phoneNumber: 'phone_number', emailAddress: 'email_address',
  taxIdentificationNumber: 'tax_identification_number', profilePicture: 'profile_picture',
} as const;

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const { rows } = await db.query('SELECT * FROM personal_data WHERE user_id = $1 LIMIT 1', [userId]);
  if (!rows[0]) return NextResponse.json({ error: 'Profildaten nicht gefunden.' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PUT(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const values = Object.fromEntries(Object.entries(COLUMNS).filter(([key]) => Object.hasOwn(input, key)).map(([key, column]) => [column, input[key]]));
  const required = ['last_name', 'first_name', 'street', 'house_number', 'city', 'postal_code', 'email_address', 'tax_identification_number'];
  const missing = required.filter((column) => !String(values[column] ?? '').trim());
  if (missing.length > 0) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen.', missing }, { status: 400 });
  }
  const columns = Object.keys(values);
  const updates = columns.filter((column) => column !== 'user_id').map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  const { rows } = await db.query(
    `INSERT INTO personal_data (user_id, ${columns.join(', ')}) VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')}) ON CONFLICT (user_id) DO UPDATE SET ${updates}, updated_at = NOW() RETURNING *`,
    [userId, ...Object.values(values)],
  );
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const entries = Object.entries(COLUMNS).filter(([key]) => Object.hasOwn(input, key));
  if (entries.length === 0) return NextResponse.json({ error: 'Keine Änderungen übermittelt.' }, { status: 400 });
  const assignments = entries.map(([, column], index) => `${column} = $${index + 2}`);
  assignments.push('updated_at = NOW()');
  const { rows } = await db.query(
    `UPDATE personal_data SET ${assignments.join(', ')} WHERE user_id = $1 RETURNING *`,
    [userId, ...entries.map(([key]) => input[key])],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Profildaten nicht gefunden.' }, { status: 404 });
  return NextResponse.json(rows[0]);
}
