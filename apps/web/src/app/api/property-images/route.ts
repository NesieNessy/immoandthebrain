import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'property-images';

/** Public bucket — the URL is a deterministic string, no signed URL/network
 *  call needed to resolve it. */
function publicUrlFor(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

function mapPropertyImage(row: Record<string, unknown>) {
  return {
    propertyImageId: Number(row.property_image_id),
    propertyId: Number(row.property_id),
    storagePath: String(row.storage_path),
    publicUrl: publicUrlFor(String(row.storage_path)),
    isCover: Boolean(row.is_cover),
    createdAt: String(row.created_at),
  };
}

async function requireOwnedProperty(propertyId: number, userId: string) {
  const property = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [propertyId, userId]);
  return property.rowCount! > 0;
}

/** Keeps `property.image_base64` (the cover-image cache every list/hub view
 *  reads) in sync whenever the gallery's cover image changes. */
async function syncCoverOnProperty(propertyId: number) {
  const { rows } = await db.query(
    'SELECT storage_path FROM property_image WHERE property_id = $1 AND is_cover = true LIMIT 1',
    [propertyId],
  );
  const coverUrl = rows[0] ? publicUrlFor(String(rows[0].storage_path)) : null;
  await db.query('UPDATE property SET image_base64 = $2, updated_at = NOW() WHERE property_id = $1', [propertyId, coverUrl]);
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const propertyId = Number(new URL(request.url).searchParams.get('propertyId'));
  if (!Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Ungültige Objekt-ID.' }, { status: 400 });
  }
  if (!(await requireOwnedProperty(propertyId, userId))) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }

  const { rows } = await db.query(
    'SELECT * FROM property_image WHERE property_id = $1 ORDER BY created_at',
    [propertyId],
  );
  return NextResponse.json(rows.map(mapPropertyImage));
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const propertyId = Number(input.propertyId);
  const storagePath = String(input.storagePath ?? '');
  if (!Number.isInteger(propertyId) || !storagePath) {
    return NextResponse.json({ error: 'Ungültige Bilddaten.' }, { status: 400 });
  }
  if (!(await requireOwnedProperty(propertyId, userId))) {
    return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }

  const existing = await db.query('SELECT 1 FROM property_image WHERE property_id = $1 LIMIT 1', [propertyId]);
  const isFirstImage = existing.rowCount === 0;

  const { rows } = await db.query(
    'INSERT INTO property_image (property_id, storage_path, is_cover) VALUES ($1, $2, $3) RETURNING *',
    [propertyId, storagePath, isFirstImage],
  );

  if (isFirstImage) await syncCoverOnProperty(propertyId);

  return NextResponse.json(mapPropertyImage(rows[0]), { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const propertyImageId = Number(input.propertyImageId);
  if (!Number.isInteger(propertyImageId)) {
    return NextResponse.json({ error: 'Ungültige Bild-ID.' }, { status: 400 });
  }

  const { rows: target } = await db.query(
    `SELECT pi.property_id FROM property_image pi
       JOIN property p ON p.property_id = pi.property_id
      WHERE pi.property_image_id = $1 AND p.user_id = $2`,
    [propertyImageId, userId],
  );
  if (!target[0]) return NextResponse.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const propertyId = Number(target[0].property_id);

  await db.query('UPDATE property_image SET is_cover = (property_image_id = $2) WHERE property_id = $1', [propertyId, propertyImageId]);
  await syncCoverOnProperty(propertyId);

  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const propertyImageId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(propertyImageId)) {
    return NextResponse.json({ error: 'Ungültige Bild-ID.' }, { status: 400 });
  }

  const { rows: target } = await db.query(
    `SELECT pi.property_id FROM property_image pi
       JOIN property p ON p.property_id = pi.property_id
      WHERE pi.property_image_id = $1 AND p.user_id = $2`,
    [propertyImageId, userId],
  );
  if (!target[0]) return NextResponse.json({ error: 'Bild nicht gefunden.' }, { status: 404 });
  const propertyId = Number(target[0].property_id);

  await db.query('DELETE FROM property_image WHERE property_image_id = $1', [propertyImageId]);

  // If the deleted image was the cover, promote the oldest remaining photo.
  const { rows: remaining } = await db.query(
    'SELECT property_image_id FROM property_image WHERE property_id = $1 ORDER BY created_at LIMIT 1',
    [propertyId],
  );
  const hasCover = await db.query('SELECT 1 FROM property_image WHERE property_id = $1 AND is_cover = true', [propertyId]);
  if (!hasCover.rowCount && remaining[0]) {
    await db.query('UPDATE property_image SET is_cover = true WHERE property_image_id = $1', [remaining[0].property_image_id]);
  }
  await syncCoverOnProperty(propertyId);

  return NextResponse.json({ deleted: true });
}
