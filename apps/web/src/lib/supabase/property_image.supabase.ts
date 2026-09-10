import { supabase } from '@/lib/supabase/client.supabase';
import { authFetch } from '@/lib/api/authFetch';
import { invalidatePropertyCache } from '@/lib/supabase/property.supabase';
import type { PropertyImage } from '@immoandthebrain/types';

const BUCKET = 'property-images';

function toPropertyImage(row: Record<string, unknown>): PropertyImage {
  return {
    propertyImageId: row.propertyImageId as number,
    propertyId: row.propertyId as number,
    storagePath: row.storagePath as string,
    publicUrl: row.publicUrl as string,
    isCover: row.isCover as boolean,
    createdAt: row.createdAt as string,
  };
}

export async function getPropertyImages(propertyId: number): Promise<PropertyImage[]> {
  const response = await authFetch(`/api/property-images?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toPropertyImage);
}

export interface UploadPropertyImageResult {
  image: PropertyImage | null;
  error: string | null;
}

export async function uploadPropertyImage(userId: string, propertyId: number, file: File): Promise<UploadPropertyImageResult> {
  const storagePath = `${userId}/${propertyId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
  });
  if (uploadError) {
    console.error('Property image upload failed:', uploadError.message);
    return { image: null, error: uploadError.message };
  }

  const metadataResponse = await authFetch('/api/property-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId, storagePath }),
  });

  if (!metadataResponse.ok) {
    const message = await metadataResponse.text();
    console.error('Property image metadata insert failed:', message);
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { image: null, error: message || 'Unbekannter Fehler beim Speichern.' };
  }

  invalidatePropertyCache(propertyId);
  const data = await metadataResponse.json() as Record<string, unknown>;
  return { image: toPropertyImage(data), error: null };
}

export async function setCoverPropertyImage(propertyId: number, propertyImageId: number): Promise<boolean> {
  const response = await authFetch('/api/property-images', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyImageId }),
  });
  invalidatePropertyCache(propertyId);
  return response.ok;
}

export async function deletePropertyImage(propertyId: number, propertyImageId: number, storagePath: string): Promise<boolean> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageError) return false;

  const response = await authFetch(`/api/property-images?id=${encodeURIComponent(propertyImageId)}`, { method: 'DELETE' });
  invalidatePropertyCache(propertyId);
  return response.ok;
}
