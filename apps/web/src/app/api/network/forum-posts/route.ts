import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Every signed-in user can see every post — the app's other genuinely
// cross-user read, alongside /api/network/wegs. author_user_id is NULL for
// staff-authored posts ("inb Expertenkommentar" — no staff/admin role
// exists, so this is a sentinel rather than a real flag).
export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (auth instanceof Response) return auth;
  const { rows } = await db.query(
    `SELECT f.*, COALESCE(p.first_name || ' ' || p.last_name, 'inb Expertenkommentar') AS author_name
     FROM forum_post f
     LEFT JOIN personal_data p ON p.user_id = f.author_user_id
     ORDER BY f.created_at DESC`,
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();

  const missing = ['category', 'title', 'body'].filter((field) => !String(input[field] ?? '').trim());
  if (missing.length > 0) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen.', missing }, { status: 400 });
  }

  const { rows } = await db.query(
    `INSERT INTO forum_post (author_user_id, category, title, body) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, input.category, input.title, input.body],
  );
  const { rows: authorRows } = await db.query('SELECT first_name, last_name FROM personal_data WHERE user_id = $1', [userId]);
  const authorName = authorRows[0] ? `${authorRows[0].first_name} ${authorRows[0].last_name}` : 'inb Expertenkommentar';
  return NextResponse.json({ ...rows[0], author_name: authorName }, { status: 201 });
}
