import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import type { DocumentCategory, UserDocument, UserDocumentInsert } from '@immoandthebrain/types';

const BUCKET = 'documents';

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** `File.type` is unreliable for PDFs on Windows (comes back empty when the
 *  .pdf extension has no registered MIME association), which then fails the
 *  bucket's allowed_mime_types check silently. Derive it from the extension
 *  instead so uploads don't depend on OS/browser MIME sniffing. */
function resolveContentType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES_BY_EXTENSION[ext] ?? file.type ?? 'application/octet-stream';
}

function toUserDocument(row: Record<string, unknown>): UserDocument {
  return {
    documentId:     row.document_id as number,
    userId:         row.user_id as string,
    category:       row.category as DocumentCategory,
    name:           row.name as string,
    propertyId:     row.property_id as number | null,
    quickCheckId:   row.quick_check_id as number | null,
    documentDate:   row.document_date as string | null,
    fileName:       row.file_name as string,
    storagePath:    row.storage_path as string,
    contentType:    row.content_type as string | null,
    fileSize:       row.file_size as number | null,
    createdAt:      row.created_at as string,
    updatedAt:      row.updated_at as string,
  };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getDocumentsByUser(userId: string): Promise<UserDocument[]> {
  void userId;
  const response = await authFetch('/api/documents', { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toUserDocument);
}

/** Short-lived signed URL — bucket is private, no public access. */
export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export interface UploadDocumentResult {
  document: UserDocument | null;
  error: string | null;
}

export async function uploadDocument(userId: string, file: File, payload: UserDocumentInsert): Promise<UploadDocumentResult> {
  const storagePath = `${userId}/${Date.now()}-${file.name}`;
  const contentType = resolveContentType(file);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType,
  });
  if (uploadError) {
    console.error('Document upload failed:', uploadError.message);
    return { document: null, error: uploadError.message };
  }

  const metadataResponse = await authFetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category:       payload.category,
      name:           payload.name,
      property_id:    payload.propertyId,
      quick_check_id: payload.quickCheckId,
      document_date:  payload.documentDate,
      file_name:      file.name,
      storage_path:   storagePath,
      content_type:   contentType,
      file_size:      file.size,
    }),
  });

  if (!metadataResponse.ok) {
    const message = await metadataResponse.text();
    console.error('Document metadata insert failed:', message);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { document: null, error: message || 'Unbekannter Fehler beim Speichern.' };
  }
  const data = await metadataResponse.json() as Record<string, unknown>;
  return { document: toUserDocument(data), error: null };
}

export async function deleteDocument(documentId: number, storagePath: string): Promise<boolean> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) return false;

  const response = await authFetch(`/api/documents?id=${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  return response.ok;
}
