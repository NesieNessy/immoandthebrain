import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const propertyId = new URL(request.url).searchParams.get('propertyId');
  const values: unknown[] = [userId];
  const filter = propertyId ? ' AND pd.property_id = $2' : '';
  if (propertyId) values.push(Number(propertyId));
  const { rows } = await db.query(
    `
      SELECT pd.* FROM property_document pd
      JOIN property p ON p.property_id = pd.property_id
      WHERE p.user_id = $1${filter}
      ORDER BY pd.created_at DESC
    `,
    values,
  );
  return NextResponse.json(rows);
}

// Every upload is its own independent document — as many as the owner
// likes, each under whatever name they gave it. No slot/replace semantics.
export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const propertyId = Number(input.property_id);
  const owned = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [propertyId, userId]);
  if (!owned.rowCount) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });

  const { rows } = await db.query(
    `INSERT INTO property_document (property_id, document_type, file_name, storage_path, content_type, file_size) VALUES ($1,'Sonstiges',$2,$3,$4,$5) RETURNING *`,
    [propertyId, input.file_name, input.storage_path, input.content_type ?? null, input.file_size ?? null],
  );
  return NextResponse.json({ document: rows[0] }, { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const id = Number(new URL(request.url).searchParams.get('id'));
  const result = await db.query(
    `
      DELETE FROM property_document pd WHERE pd.property_document_id = $1 AND EXISTS (
        SELECT 1 FROM property p WHERE p.property_id = pd.property_id AND p.user_id = $2
      )
    `,
    [id, userId],
  );
  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}
