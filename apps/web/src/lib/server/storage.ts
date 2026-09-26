/**
 * Server-side Supabase Storage access with the service-role key, over the
 * Storage REST API (same approach as api/tax-expense-documents/storage — the
 * supabase-js Storage client misbehaves in the bundled Next.js server).
 * Never throws: every function reports failure through its return value, so
 * a route decides itself whether a storage problem is fatal.
 */

function storageConfig(): { baseUrl: string; key: string } | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_ADMIN_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return { baseUrl: `${url}/storage/v1`, key };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Copies a file from one bucket to another (download + upload — Storage's own
 * copy only works within a bucket). Returns false when anything fails; the
 * reason is logged, not returned, so it never reaches a response.
 */
export async function copyStorageObject(args: {
  fromBucket: string;
  fromPath: string;
  toBucket: string;
  toPath: string;
  contentType?: string | null;
}): Promise<boolean> {
  const config = storageConfig();
  if (!config) {
    console.error('copyStorageObject: SUPABASE_SERVICE_ROLE_KEY or Supabase URL is not configured.');
    return false;
  }
  const headers = { Authorization: `Bearer ${config.key}`, apikey: config.key };
  try {
    const download = await fetch(`${config.baseUrl}/object/${args.fromBucket}/${encodePath(args.fromPath)}`, { headers });
    if (!download.ok) {
      console.error('copyStorageObject download failed:', download.status, await download.text().catch(() => ''));
      return false;
    }
    const contentType = args.contentType || download.headers.get('content-type') || 'application/octet-stream';
    const upload = await fetch(`${config.baseUrl}/object/${args.toBucket}/${encodePath(args.toPath)}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': contentType },
      body: Buffer.from(await download.arrayBuffer()),
    });
    if (!upload.ok) {
      console.error('copyStorageObject upload failed:', upload.status, await upload.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('copyStorageObject threw:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Removes files, e.g. a copy whose database row could not be written. */
export async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  const config = storageConfig();
  if (!config || paths.length === 0) return;
  try {
    const response = await fetch(`${config.baseUrl}/object/${bucket}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.key}`, apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!response.ok) console.error('removeStorageObjects failed:', response.status, await response.text().catch(() => ''));
  } catch (err) {
    console.error('removeStorageObjects threw:', err instanceof Error ? err.message : err);
  }
}
