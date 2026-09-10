import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import type { PropertyDocument, PropertyDocumentType } from '@immoandthebrain/types';

const BUCKET = 'property-documents';

function toPropertyDocument(row: Record<string, unknown>): PropertyDocument {
  return {
    propertyDocumentId: row.property_document_id as number,
    propertyId:         row.property_id as number,
    documentType:       row.document_type as PropertyDocumentType,
    fileName:           row.file_name as string,
    storagePath:        row.storage_path as string,
    contentType:        row.content_type as string | null,
    fileSize:           row.file_size as number | null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
    supersededAt:       row.superseded_at as string | null,
  };
}

export async function getPropertyDocumentsByProperty(propertyId: number): Promise<PropertyDocument[]> {
  const response = await authFetch(`/api/property-documents?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toPropertyDocument);
}

/** Signed URL for viewing/downloading — the bucket is private. */
export async function getPropertyDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Uploads the file to storage and inserts a new property_document row —
 * every upload is its own independent document, as many as the owner
 * likes, under whatever name they gave it.
 */
export async function uploadPropertyDocument(
  userId: string,
  file: File,
  propertyId: number,
  /** Display name shown in the Unterlagen list — chosen by the owner. */
  name: string,
): Promise<PropertyDocument | null> {
  const storagePath = `${userId}/${propertyId}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (uploadError) return null;

  const metadataResponse = await authFetch('/api/property-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        property_id:   propertyId,
        file_name:     name.trim(),
        storage_path:  storagePath,
        content_type:  file.type || null,
        file_size:     file.size,
    }),
  });

  if (!metadataResponse.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return null;
  }
  const result = await metadataResponse.json() as { document: Record<string, unknown> };
  return toPropertyDocument(result.document);
}

export async function deletePropertyDocument(propertyDocumentId: number, storagePath: string): Promise<boolean> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const response = await authFetch(`/api/property-documents?id=${encodeURIComponent(propertyDocumentId)}`, { method: 'DELETE' });
  return response.ok;
}
