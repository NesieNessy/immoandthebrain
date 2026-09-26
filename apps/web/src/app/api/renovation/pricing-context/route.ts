import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { loadRenovationRegionFactor } from '@/lib/server/renovationRegionFactor';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Inputs of the renovation price indication for an existing property — the
 * same regional factor and area scaling the Detailbewertung prices with (see
 * indicatePriceRange in lib/renovation/catalog.ts). The factor table is only
 * readable server-side, so the Handwerkerleistungen ask for it here.
 */
export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const propertyId = Number(new URL(request.url).searchParams.get('propertyId'));
  if (!Number.isInteger(propertyId)) return NextResponse.json({ error: 'propertyId fehlt.' }, { status: 400 });

  const { rows } = await db.query(
    'SELECT postal_code, square_meters FROM property WHERE property_id = $1 AND user_id = $2',
    [propertyId, userId],
  );
  const property = rows[0];
  if (!property) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });

  const postalCode: string = property.postal_code ?? '';
  return NextResponse.json({
    postalCode,
    regionFactor: await loadRenovationRegionFactor(postalCode),
    livingAreaM2: Number(property.square_meters) || null,
  });
}
