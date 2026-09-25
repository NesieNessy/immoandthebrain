import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  await requireUserId(request);
  const wegId = Number((await context.params).id);
  if (!Number.isInteger(wegId)) return NextResponse.json({ error: 'Ungültige WEG-ID.' }, { status: 400 });

  const { rows } = await db.query(
    `SELECT r.*, p.first_name, p.last_name FROM weg_review r
     JOIN personal_data p ON p.user_id = r.user_id
     WHERE r.weg_id = $1 ORDER BY r.created_at DESC`,
    [wegId],
  );
  return NextResponse.json(rows);
}

// One review per (weg, user) — submitting again replaces it rather than
// adding a second one (see the UNIQUE (weg_id, user_id) constraint).
export async function POST(request: Request, context: RouteContext) {
  const userId = await requireUserId(request);
  const wegId = Number((await context.params).id);
  if (!Number.isInteger(wegId)) return NextResponse.json({ error: 'Ungültige WEG-ID.' }, { status: 400 });

  const input = await request.json();
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Bewertung muss zwischen 1 und 5 liegen.' }, { status: 400 });
  }

  const { rows } = await db.query(
    `INSERT INTO weg_review (weg_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (weg_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
     RETURNING *`,
    [wegId, userId, rating, input.comment ?? null],
  );
  return NextResponse.json(rows[0], { status: 201 });
}
