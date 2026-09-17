import { supabase } from '@/lib/supabase/client.supabase';

const BUCKET = 'user-assets';

function publicUrlFor(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export interface UploadUserAssetResult {
  url: string | null;
  storagePath: string | null;
  error: string | null;
}

/** Avatar photo and signature image both live in the same small per-user
 *  bucket — unlike property photos, there's only ever one of each, so the
 *  public URL is written straight onto `personal_data` (profilePicture /
 *  signatureUrl) by the caller instead of a separate metadata table. */
export async function uploadUserAsset(userId: string, file: File, kind: 'avatar' | 'signature'): Promise<UploadUserAssetResult> {
  const storagePath = `${userId}/${kind}-${Date.now()}-${file.name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || 'application/octet-stream',
  });
  if (error) {
    console.error('User asset upload failed:', error.message);
    return { url: null, storagePath: null, error: error.message };
  }

  return { url: publicUrlFor(storagePath), storagePath, error: null };
}

/** `storagePath` is the part after the bucket's public URL prefix — callers
 *  that only have the full public URL can derive it by stripping everything
 *  up to and including `${BUCKET}/`. */
export async function removeUserAsset(storagePath: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error('User asset removal failed:', error.message);
  return !error;
}

export function userAssetStoragePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}
