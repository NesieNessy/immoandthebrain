import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const COLUMNS = ['last_name', 'first_name', 'tax_id', 'is_primary', 'sort_order', 'move_in_date'] as const;

function updatesFrom(input: Record<string, unknown>) {
  return Object.fromEntries(COLUMNS.filter((column) => Object.hasOwn(input, column)).map((column) => [column, input[column]]));
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const tenancyId = Number(new URL(request.url).searchParams.get('tenancyId'));
  const { rows } = await db.query(
    `
      SELECT tp.* FROM tenancy_person tp
      JOIN tenancy t ON t.tenancy_id = tp.tenancy_id
      JOIN property p ON p.property_id = t.property_id
      WHERE tp.tenancy_id = $1 AND p.user_id = $2
      ORDER BY tp.sort_order, tp.tenancy_person_id
    `,
    [tenancyId, userId],
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const tenancyId = Number(input.tenancy_id);
  const owned = await db.query(
    'SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id WHERE t.tenancy_id = $1 AND p.user_id = $2',
    [tenancyId, userId],
  );
  if (!owned.rowCount) return NextResponse.json({ error: 'Mietverhältnis nicht gefunden.' }, { status: 404 });
  const values = updatesFrom(input);
  const columns = ['tenancy_id', ...Object.keys(values)];
  const { rows } = await db.query(
    `INSERT INTO tenancy_person (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
    [tenancyId, ...Object.values(values)],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const id = Number(input.id);
  const values = updatesFrom(input.values ?? {});
  const columns = Object.keys(values);
  if (!Number.isInteger(id) || columns.length === 0) return NextResponse.json({ error: 'Ungültige Änderung.' }, { status: 400 });
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`);
  assignments.push('updated_at = NOW()');
  const { rows } = await db.query(
    `
      UPDATE tenancy_person tp SET ${assignments.join(', ')}
      WHERE tp.tenancy_person_id = $1 AND EXISTS (
        SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id
        WHERE t.tenancy_id = tp.tenancy_id AND p.user_id = $2
      ) RETURNING tp.*
    `,
    [id, userId, ...Object.values(values)],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Person nicht gefunden.' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const id = Number(new URL(request.url).searchParams.get('id'));
  const result = await db.query(
    `
      DELETE FROM tenancy_person tp WHERE tp.tenancy_person_id = $1 AND EXISTS (
        SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id
        WHERE t.tenancy_id = tp.tenancy_id AND p.user_id = $2
      )
    `,
    [id, userId],
  );
  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}
