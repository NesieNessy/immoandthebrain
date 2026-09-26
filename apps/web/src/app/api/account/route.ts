import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const USER_ASSETS_BUCKET = 'user-assets';

function storageHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Response(JSON.stringify({ error: 'Der Server ist nicht richtig konfiguriert. Bitte später erneut versuchen.' }), { status: 500 });
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

function storageBaseUrl(): string {
  const url = process.env.SUPABASE_ADMIN_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Response(JSON.stringify({ error: 'Der Server ist nicht richtig konfiguriert. Bitte später erneut versuchen.' }), { status: 500 });
  return `${url}/storage/v1`;
}

/** Best-effort — leftover avatar/signature files under this user's folder
 *  are cleaned up, but this does *not* touch the property-images,
 *  tax-expense-documents, or tenancy-document buckets: the plain property
 *  DELETE route doesn't clean those either (a pre-existing gap), so this
 *  isn't a regression, just not a fix for it either. */
async function deleteUserAssetFolder(userId: string) {
  const listResponse = await fetch(`${storageBaseUrl()}/object/list/${USER_ASSETS_BUCKET}`, {
    method: 'POST',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: `${userId}/` }),
  });
  if (!listResponse.ok) {
    console.error('account delete: user-assets list failed:', listResponse.status, await listResponse.text());
    return;
  }
  const entries = await listResponse.json() as { name: string }[];
  if (entries.length === 0) return;

  const deleteResponse = await fetch(`${storageBaseUrl()}/object/${USER_ASSETS_BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: entries.map((entry) => `${userId}/${entry.name}`) }),
  });
  if (!deleteResponse.ok) {
    console.error('account delete: user-assets cleanup failed:', deleteResponse.status, await deleteResponse.text());
  }
}

/** Permanent, irreversible account deletion — every property (and
 *  everything cascading from it: units, tax categories/documents, images,
 *  tenancy documents, ...), the personal_data row (cascading `subscription`),
 *  the user's avatar/signature files, and finally the Supabase Auth user
 *  itself. Gated client-side by requiring the user to type their own email
 *  before the confirm button is enabled — there is no server-side undo. */
export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;

  await db.query('DELETE FROM property WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM personal_data WHERE user_id = $1', [userId]);
  await deleteUserAssetFolder(userId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Der Server ist nicht richtig konfiguriert. Bitte später erneut versuchen.' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    // The data is already gone at this point — surface the Auth-user
    // deletion failure specifically rather than a generic error, since the
    // account is left in a half-deleted state the user can't self-recover.
    console.error('account delete: auth user deletion failed:', error.message);
    return NextResponse.json({ error: 'Konto-Daten wurden gelöscht, aber der Zugang konnte nicht vollständig entfernt werden. Bitte kontaktieren Sie den Support.' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
