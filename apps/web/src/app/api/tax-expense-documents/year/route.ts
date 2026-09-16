import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'tax-expense-documents';

// Same rationale as storage/route.ts: raw Storage REST calls with the
// service-role key rather than the @supabase/supabase-js Storage client.
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

// Deletes every receipt uploaded in one calendar year, for one property,
// across all its categories — "Jahr löschen" on the Steuerunterlagen page.
// Only ever touches this property (receipts aren't cross-property synced,
// unlike category names), and re-derives each affected category's running
// `amount` total by subtracting exactly what was removed.
export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const propertyId = Number(url.searchParams.get('propertyId'));
  const year = Number(url.searchParams.get('year'));
  if (!Number.isInteger(propertyId) || !Number.isInteger(year)) {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const { rows: owned } = await db.query(
    `SELECT d.tax_expense_document_id, d.storage_path, d.amount, d.tax_expense_category_id
     FROM tax_expense_document d
     JOIN property p ON p.property_id = d.property_id
     WHERE d.property_id = $1 AND p.user_id = $2 AND EXTRACT(YEAR FROM d.created_at) = $3`,
    [propertyId, userId, year],
  );
  if (owned.length === 0) return NextResponse.json({ deleted: 0, categories: [] });

  const storagePaths = owned.map((row) => row.storage_path as string);
  const deleteResponse = await fetch(`${storageBaseUrl()}/object/${BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: storagePaths }),
  });
  if (!deleteResponse.ok) {
    console.error('tax-expense-documents year delete failed:', deleteResponse.status, await deleteResponse.text());
  }

  const amountByCategory = new Map<number, number>();
  for (const row of owned) {
    const categoryId = row.tax_expense_category_id as number;
    amountByCategory.set(categoryId, (amountByCategory.get(categoryId) ?? 0) + Number(row.amount));
  }

  const documentIds = owned.map((row) => row.tax_expense_document_id as number);
  await db.query('DELETE FROM tax_expense_document WHERE tax_expense_document_id = ANY($1)', [documentIds]);

  const categories = [];
  for (const [categoryId, amount] of amountByCategory) {
    const { rows } = await db.query(
      `UPDATE tax_expense_category SET amount = amount - $1, updated_at = NOW() WHERE tax_expense_category_id = $2 RETURNING *`,
      [amount, categoryId],
    );
    if (rows[0]) categories.push(rows[0]);
  }

  return NextResponse.json({ deleted: documentIds.length, categories });
}
