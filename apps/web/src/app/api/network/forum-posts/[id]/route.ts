import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

// Bumps view_count on every read — the one new "counter" pattern in this
// app, a plain increment-on-load rather than a per-viewer dedupe table
// (matching the scope this pass is meant to cover).
export async function GET(request: Request, context: RouteContext) {
  await requireUserId(request);
  const postId = Number((await context.params).id);
  if (!Number.isInteger(postId)) return NextResponse.json({ error: 'Ungültiger Beitrag.' }, { status: 400 });

  const { rows } = await db.query(
    `UPDATE forum_post SET view_count = view_count + 1 WHERE forum_post_id = $1 RETURNING *`,
    [postId],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Beitrag nicht gefunden.' }, { status: 404 });

  const { rows: authorRows } = rows[0].author_user_id
    ? await db.query('SELECT first_name, last_name FROM personal_data WHERE user_id = $1', [rows[0].author_user_id])
    : { rows: [] as { first_name: string; last_name: string }[] };
  const authorName = authorRows[0] ? `${authorRows[0].first_name} ${authorRows[0].last_name}` : 'inb Expertenkommentar';
  return NextResponse.json({ ...rows[0], author_name: authorName });
}
