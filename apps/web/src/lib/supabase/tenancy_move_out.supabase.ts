import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import type { TenancyMoveOut, TenancyMoveOutInsert, TenancyMoveOutUpdate } from '@immoandthebrain/types';

const BUCKET = 'tenancy-documents';

// get/create/update go through /api/tenancy-move-out (server-side, service-role
// DB pool) rather than the browser Supabase client directly — the RLS policies
// on this table check auth.uid(), which is never set under auth-bypass mode
// (no real Supabase Auth session backs the bypass user), so a direct client
// call silently fails there. It previously did: createTenancyMoveOut/
// updateTenancyMoveOut returned null on any error, and the caller
// (useTenantMoveOutData's handleSave) showed a "saved" toast regardless,
// masking the failure completely — confirmed by a real save never reaching
// the database. Matches the pattern already used by quick_check.supabase.ts.

export async function getTenancyMoveOutByTenancy(tenancyId: number): Promise<TenancyMoveOut | null> {
  const res = await authFetch(`/api/tenancy-move-out?tenancyId=${tenancyId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createTenancyMoveOut(payload: TenancyMoveOutInsert): Promise<TenancyMoveOut | null> {
  const res = await authFetch('/api/tenancy-move-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateTenancyMoveOut(tenancyMoveOutId: number, updates: TenancyMoveOutUpdate): Promise<TenancyMoveOut | null> {
  const res = await authFetch('/api/tenancy-move-out', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenancyMoveOutId, ...updates }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ----------------------------------------------------------------------------
// Damage photos — stored directly in the tenancy-documents bucket (RLS is
// folder-based on userId, no tenancy_document row needed) since each damage
// can carry several photos and re-uploading must never replace an existing
// one, unlike the single-slot ID/credit-report/… documents.
// ----------------------------------------------------------------------------

export async function uploadMoveOutDamagePhoto(userId: string, tenancyId: number, file: File): Promise<{ path: string; fileName: string } | null> {
  const path = `${userId}/${tenancyId}/move-out-damage/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) return null;
  return { path, fileName: file.name };
}

export async function getMoveOutDamagePhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteMoveOutDamagePhoto(storagePath: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  return !error;
}
