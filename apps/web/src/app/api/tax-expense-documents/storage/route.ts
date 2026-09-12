import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'tax-expense-documents';

// Talks to the Storage REST API directly with the service-role key rather
// than through the @supabase/supabase-js Storage client — that client
// inexplicably reports "Bucket not found" for this bucket in this bundled
// Next.js server context even though the exact same request succeeds via a
// plain fetch (verified directly against the API), so the raw HTTP calls
// are used here instead of chasing the library's behavior further.
function storageHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Response(JSON.stringify({ error: 'Supabase admin configuration is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

function storageBaseUrl(): string {
  const url = process.env.SUPABASE_ADMIN_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Response(JSON.stringify({ error: 'Supabase admin configuration is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return `${url}/storage/v1`;
}

async function ownedCategoryPropertyId(userId: string, categoryId: number): Promise<number | null> {
  const result = await db.query(
    `SELECT c.property_id FROM tax_expense_category c JOIN property p ON p.property_id = c.property_id WHERE c.tax_expense_category_id = $1 AND p.user_id = $2`,
    [categoryId, userId],
  );
  return result.rows[0]?.property_id ?? null;
}

// Uploads the file to Storage and records it in one call, then bumps the
// parent category's running total by the receipt's amount — see the
// migration comment on tax_expense_document.amount for why the category
// total is derived this way instead of typed in directly.
export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const file = formData.get('file');
  const categoryId = Number(formData.get('categoryId'));
  const amount = Number(formData.get('amount'));

  if (!(file instanceof File) || !Number.isInteger(categoryId) || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const propertyId = await ownedCategoryPropertyId(userId, categoryId);
  if (!propertyId) return NextResponse.json({ error: 'Kategorie nicht gefunden.' }, { status: 404 });

  const storagePath = `${userId}/${propertyId}/${categoryId}/beleg-${crypto.randomUUID()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadResponse = await fetch(`${storageBaseUrl()}/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
    body: buffer,
  });
  if (!uploadResponse.ok) {
    console.error('tax-expense-documents upload failed:', uploadResponse.status, await uploadResponse.text());
    return NextResponse.json({ error: 'Datei konnte nicht hochgeladen werden.' }, { status: 500 });
  }

  const { rows: documentRows } = await db.query(
    `INSERT INTO tax_expense_document (tax_expense_category_id, property_id, storage_path, file_name, amount) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [categoryId, propertyId, storagePath, file.name, amount],
  );
  const { rows: categoryRows } = await db.query(
    `UPDATE tax_expense_category SET amount = amount + $1, updated_at = NOW() WHERE tax_expense_category_id = $2 RETURNING *`,
    [amount, categoryId],
  );

  return NextResponse.json({ document: documentRows[0], category: categoryRows[0] }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const path = new URL(request.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'Pfad fehlt.' }, { status: 400 });
  // The path is namespaced "{userId}/...", so a mismatched prefix rejects a
  // request for someone else's file outright, without needing a DB lookup.
  if (!path.startsWith(`${userId}/`)) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });

  const signResponse = await fetch(`${storageBaseUrl()}/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!signResponse.ok) {
    console.error('tax-expense-documents sign failed:', signResponse.status, await signResponse.text());
    return NextResponse.json({ error: 'URL konnte nicht erstellt werden.' }, { status: 500 });
  }
  const { signedURL } = await signResponse.json();
  return NextResponse.json({ url: `${storageBaseUrl()}${signedURL}` });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });

  const { rows: owned } = await db.query(
    `SELECT d.storage_path, d.amount, d.tax_expense_category_id FROM tax_expense_document d JOIN property p ON p.property_id = d.property_id WHERE d.tax_expense_document_id = $1 AND p.user_id = $2`,
    [id, userId],
  );
  const document = owned[0];
  if (!document) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });

  const deleteResponse = await fetch(`${storageBaseUrl()}/object/${BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [document.storage_path] }),
  });
  if (!deleteResponse.ok) {
    console.error('tax-expense-documents delete failed:', deleteResponse.status, await deleteResponse.text());
  }

  const result = await db.query('DELETE FROM tax_expense_document WHERE tax_expense_document_id = $1', [id]);
  const { rows: categoryRows } = await db.query(
    `UPDATE tax_expense_category SET amount = amount - $1, updated_at = NOW() WHERE tax_expense_category_id = $2 RETURNING *`,
    [document.amount, document.tax_expense_category_id],
  );

  return NextResponse.json({ deleted: result.rowCount ?? 0, category: categoryRows[0] });
}
