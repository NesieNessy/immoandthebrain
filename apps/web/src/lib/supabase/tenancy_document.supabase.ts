import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import type { TenancyDocument, TenancyDocumentInsert, TenancyDocumentType } from '@immoandthebrain/types';

const BUCKET = 'tenancy-documents';

function toTenancyDocument(row: Record<string, unknown>): TenancyDocument {
  return {
    tenancyDocumentId: row.tenancy_document_id as number,
    tenancyId:         row.tenancy_id as number,
    tenancyPersonId:   row.tenancy_person_id as number | null,
    documentType:      row.document_type as TenancyDocumentType,
    fileName:          row.file_name as string,
    storagePath:       row.storage_path as string,
    contentType:       row.content_type as string | null,
    fileSize:          row.file_size as number | null,
    createdAt:         row.created_at as string,
    updatedAt:         row.updated_at as string,
  };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getTenancyDocumentsByTenancy(tenancyId: number): Promise<TenancyDocument[]> {
  const response = await authFetch(`/api/tenancy-documents?tenancyId=${encodeURIComponent(tenancyId)}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toTenancyDocument);
}

export interface TenancyDocumentForUser {
  tenancyDocumentId: number;
  tenancyId: number;
  propertyId: number | null;
  documentType: TenancyDocumentType;
  fileName: string;
  storagePath: string;
  createdAt: string;
}

/**
 * Documents uploaded per-tenancy on the tenant-data page (ID/credit report/
 * guarantee/lease agreement) — surfaced here too so the global documents page
 * doesn't miss them. tenancy_document has no user_id of its own, so this
 * joins through tenancy → property client-side; RLS on both tables already
 * scopes everything to the caller, so no explicit user filter is needed.
 */
export async function getTenancyDocumentsByUser(): Promise<TenancyDocumentForUser[]> {
  const response = await authFetch('/api/tenancy-documents', { cache: 'no-store' });
  if (!response.ok) return [];
  const docs = await response.json() as Record<string, unknown>[];
  return docs.map((row) => ({
    tenancyDocumentId: row.tenancy_document_id as number,
    tenancyId: row.tenancy_id as number,
    propertyId: row.property_id as number | null,
    documentType: row.document_type as TenancyDocumentType,
    fileName: row.file_name as string,
    storagePath: row.storage_path as string,
    createdAt: row.created_at as string,
  }));
}

/** Signed URL for viewing/downloading — the bucket is private. */
export async function getTenancyDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

/**
 * Uploads the file to storage and upserts the tenancy_document row for this
 * (tenancy, person-or-shared, document type) slot — a re-upload replaces
 * whatever was there before, both the object and the old metadata row.
 */
export async function uploadTenancyDocument(
  userId: string,
  file: File,
  payload: Omit<TenancyDocumentInsert, 'fileName' | 'storagePath' | 'contentType' | 'fileSize'>,
  /** Display name shown in the documents table — defaults to the file's own name. */
  fileName?: string,
): Promise<TenancyDocument | null> {
  const storagePath = `${userId}/${payload.tenancyId}/${payload.documentType}-${payload.tenancyPersonId ?? 'shared'}-${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) return null;

  const metadataResponse = await authFetch('/api/tenancy-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        tenancy_id:          payload.tenancyId,
        tenancy_person_id:   payload.tenancyPersonId,
        document_type:       payload.documentType,
        file_name:           fileName?.trim() || file.name,
        storage_path:        storagePath,
        content_type:        file.type || null,
        file_size:           file.size,
    }),
  });

  if (!metadataResponse.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return null;
  }
  const result = await metadataResponse.json() as { document: Record<string, unknown>; previousStoragePath: string | null };

  if (result.previousStoragePath) {
    await supabase.storage.from(BUCKET).remove([result.previousStoragePath]);
  }

  return toTenancyDocument(result.document);
}

/** Renames a document — updates only the display name, not the stored file. */
export async function renameTenancyDocument(tenancyDocumentId: number, fileName: string): Promise<TenancyDocument | null> {
  const response = await authFetch('/api/tenancy-documents', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenancy_document_id: tenancyDocumentId, file_name: fileName }),
  });
  if (!response.ok) return null;
  const result = await response.json() as { document: Record<string, unknown> };
  return toTenancyDocument(result.document);
}

export async function deleteTenancyDocument(tenancyDocumentId: number, storagePath: string): Promise<boolean> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const response = await authFetch(`/api/tenancy-documents?id=${encodeURIComponent(tenancyDocumentId)}`, { method: 'DELETE' });
  return response.ok;
}
