import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function ownsProperty(userId: string, propertyId: unknown): Promise<boolean> {
  const id = Number(propertyId);
  if (!Number.isInteger(id)) return false;
  const result = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [id, userId]);
  return Boolean(result.rowCount);
}

// Every published, not-yet-commissioned measure across every user's
// properties — the cross-user read the property-resources dispatcher can't
// do (it always scopes to the caller's own properties).
export async function GET(request: Request) {
  await requireUserId(request);
  const { rows } = await db.query(
    `SELECT r.*, p.city, p.street FROM renovation_measure r
     JOIN property p ON p.property_id = r.property_id
     WHERE r.published = true AND r.quote_accepted = false
     ORDER BY r.published_at DESC`,
  );
  return NextResponse.json(rows);
}

// Posts a job straight to the board — unlike the property-scoped
// Handwerkerleistungen page's create-then-separately-publish flow, posting
// here IS the intent, so published/published_at are set directly.
export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();

  const propertyId = Number(input.property_id);
  if (!(await ownsProperty(userId, propertyId))) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }
  if (!String(input.title ?? '').trim()) {
    return NextResponse.json({ error: 'Titel darf nicht leer sein.' }, { status: 400 });
  }

  const { rows: existing } = await db.query('SELECT COUNT(*)::int AS count FROM renovation_measure WHERE property_id = $1', [propertyId]);
  const sortOrder = existing[0].count as number;

  const { rows } = await db.query(
    `INSERT INTO renovation_measure (property_id, sort_order, title, category, description, estimated_cost, budget_min, budget_max, preferred_start_date, published, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
     RETURNING *`,
    [
      propertyId,
      sortOrder,
      input.title,
      input.category ?? null,
      input.description ?? null,
      input.estimated_cost ?? null,
      input.budget_min ?? null,
      input.budget_max ?? null,
      input.preferred_start_date ?? null,
    ],
  );

  const { rows: propertyRows } = await db.query('SELECT city, street FROM property WHERE property_id = $1', [propertyId]);
  return NextResponse.json({ ...rows[0], city: propertyRows[0].city, street: propertyRows[0].street }, { status: 201 });
}
