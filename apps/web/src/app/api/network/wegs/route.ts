import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REQUIRED_FIELDS = ['name', 'city', 'service_tier'] as const;

// Every signed-in user can see every WEG — this is the app's first
// genuinely cross-user read, no ownership filter at all (unlike every
// property-resources query, which always scopes to the caller).
export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (auth instanceof Response) return auth;
  const { rows } = await db.query(
    `SELECT w.*, AVG(r.rating)::float AS average_rating, COUNT(r.weg_review_id)::int AS review_count
     FROM weg w
     LEFT JOIN weg_review r ON r.weg_id = w.weg_id
     WHERE w.approved = true
     GROUP BY w.weg_id
     ORDER BY w.name`,
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();

  const missing = REQUIRED_FIELDS.filter((field) => !String(input[field] ?? '').trim());
  if (missing.length > 0) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen.', missing }, { status: 400 });
  }

  const { rows } = await db.query(
    `INSERT INTO weg (created_by_user_id, name, founded_year, city, unit_count, service_tier, annual_fee_per_unit, response_time_hours, reachability, website, phone, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *, NULL::float AS average_rating, 0 AS review_count`,
    [
      userId,
      input.name,
      input.founded_year ?? null,
      input.city,
      input.unit_count ?? null,
      input.service_tier,
      input.annual_fee_per_unit ?? null,
      input.response_time_hours ?? null,
      input.reachability ?? null,
      input.website ?? null,
      input.phone ?? null,
      input.email ?? null,
    ],
  );
  return NextResponse.json(rows[0], { status: 201 });
}
