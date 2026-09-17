import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const { rows } = await db.query(
    'SELECT * FROM subscription WHERE user_id = $1 ORDER BY start_date DESC LIMIT 1',
    [userId],
  );
  // No row yet is a normal state (e.g. a brand-new account) — the caller
  // shows a sensible Free default rather than this route inventing one.
  return NextResponse.json(rows[0] ?? null);
}
