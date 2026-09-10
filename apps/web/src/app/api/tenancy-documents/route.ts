import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const tenancyId = new URL(request.url).searchParams.get('tenancyId');
  const values: unknown[] = [userId];
  const filter = tenancyId ? ' AND td.tenancy_id = $2' : '';
  if (tenancyId) values.push(Number(tenancyId));
  const { rows } = await db.query(
    `
      SELECT td.*, t.property_id FROM tenancy_document td
      JOIN tenancy t ON t.tenancy_id = td.tenancy_id
      JOIN property p ON p.property_id = t.property_id
      WHERE p.user_id = $1${filter}
      ORDER BY td.created_at DESC
    `,
    values,
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const tenancyId = Number(input.tenancy_id);
  const owned = await db.query(
    'SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id WHERE t.tenancy_id = $1 AND p.user_id = $2',
    [tenancyId, userId],
  );
  if (!owned.rowCount) return NextResponse.json({ error: 'Mietverhältnis nicht gefunden.' }, { status: 404 });

  // A new upload into an already-occupied (tenancy, document_type,
  // tenancy_person_id) slot archives the current row instead of overwriting
  // it in place — the old file stays in storage and the old row stays
  // queryable as history, just excluded from "current document" views.
  await db.query(
    `UPDATE tenancy_document SET superseded_at = NOW()
     WHERE tenancy_id = $1 AND document_type = $2 AND tenancy_person_id IS NOT DISTINCT FROM $3 AND superseded_at IS NULL`,
    [tenancyId, input.document_type, input.tenancy_person_id ?? null],
  );

  const { rows } = await db.query(
    `INSERT INTO tenancy_document (tenancy_id, tenancy_person_id, document_type, file_name, storage_path, content_type, file_size) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenancyId, input.tenancy_person_id ?? null, input.document_type, input.file_name, input.storage_path, input.content_type ?? null, input.file_size ?? null],
  );
  return NextResponse.json({ document: rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const id = Number(input.tenancy_document_id);
  if (!id) return NextResponse.json({ error: 'Ungültiges Dokument.' }, { status: 400 });

  if (input.action === 'archive') {
    const { rows } = await db.query(
      `
        UPDATE tenancy_document td SET superseded_at = NOW(), updated_at = NOW()
        WHERE td.tenancy_document_id = $1 AND td.superseded_at IS NULL AND EXISTS (
          SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id
          WHERE t.tenancy_id = td.tenancy_id AND p.user_id = $2
        )
        RETURNING *
      `,
      [id, userId],
    );
    if (!rows[0]) return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    return NextResponse.json({ document: rows[0] });
  }

  const fileName = String(input.file_name ?? '').trim();
  if (!fileName) return NextResponse.json({ error: 'Ungültiger Dateiname.' }, { status: 400 });

  const { rows } = await db.query(
    `
      UPDATE tenancy_document td SET file_name = $2, updated_at = NOW()
      WHERE td.tenancy_document_id = $1 AND EXISTS (
        SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id
        WHERE t.tenancy_id = td.tenancy_id AND p.user_id = $3
      )
      RETURNING *
    `,
    [id, fileName, userId],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
  return NextResponse.json({ document: rows[0] });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const id = Number(new URL(request.url).searchParams.get('id'));
  const result = await db.query(
    `
      DELETE FROM tenancy_document td WHERE td.tenancy_document_id = $1 AND EXISTS (
        SELECT 1 FROM tenancy t JOIN property p ON p.property_id = t.property_id
        WHERE t.tenancy_id = td.tenancy_id AND p.user_id = $2
      )
    `,
    [id, userId],
  );
  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}
