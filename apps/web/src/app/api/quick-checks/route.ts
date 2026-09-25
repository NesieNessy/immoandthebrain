import { isValidListingUrl, LISTING_URL_ERROR, normalizeListingReference } from '@/lib/listingUrl';
import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type QuickCheckRow = {
  quick_check_id: number;
  user_id: string;
  ingest_date?: string;
  created_at?: string;
  portal_id: string | null;
  data_entry_source: 'MANUELL' | 'PORTAL_IMPORT';
  kpf_multiplier: string | number;
  purchase_price: string | number;
  cold_rent: string | number;
  street: string;
  postal_code: string;
  city: string;
  year_of_construction: number;
  condition: string;
  status: 'ACTIVE' | 'INACTIVE';
  finalised_action: 'ACCEPT' | 'DISCARD' | null;
  detail_check: boolean;
  property_id: number | null;
  recommendation_score: string | number | null;
  recommendation_level: string | null;
  updated_at?: string;
};

function toNumber(value: string | number | null): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

function mapQuickCheck(row: QuickCheckRow) {
  return {
    quick_check_id: row.quick_check_id,
    user_id: row.user_id,
    ingest_date: row.ingest_date ?? row.created_at,
    portal_id: row.portal_id,
    data_entry_source: row.data_entry_source,
    kpf_multiplier: toNumber(row.kpf_multiplier),
    purchase_price: toNumber(row.purchase_price),
    cold_rent: toNumber(row.cold_rent),
    street: row.street,
    postal_code: row.postal_code,
    city: row.city,
    year_of_construction: row.year_of_construction,
    condition: row.condition,
    status: row.status,
    finalised_action: row.finalised_action,
    detail_check: row.detail_check,
    property_id: row.property_id,
    recommendation_score: row.recommendation_score == null ? null : toNumber(row.recommendation_score),
    recommendation_level: row.recommendation_level,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const detailCheck = searchParams.get('detailCheck') === 'true';

  if (id) {
    const { rows } = await db.query<QuickCheckRow>(
      `
        SELECT *
        FROM quick_check
        WHERE user_id = $1
          AND quick_check_id = $2
        LIMIT 1
      `,
      [userId, Number(id)],
    );

    if (!rows[0]) {
      return NextResponse.json({ error: 'Quick-check not found' }, { status: 404 });
    }

    return NextResponse.json(mapQuickCheck(rows[0]));
  }

  const { rows } = await db.query<QuickCheckRow>(
    `
      SELECT *
      FROM quick_check_overview
      WHERE user_id = $1
        AND detail_check = $2
      ORDER BY ingest_date DESC
      LIMIT 100
    `,
    [userId, detailCheck],
  );

  return NextResponse.json(rows.map(mapQuickCheck));
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();

  const purchasePrice = Number(input.purchasePrice);
  const coldRent = Number(input.coldRent);
  const yearOfConstruction = Number(input.yearOfConstruction);
  const kpfMultiplier = Number(input.kpfMultiplier);
  const postalCode = String(input.postalCode ?? '');
  // Same listing-URL rule as the Detailbewertung's Inserats-URL, which this
  // value is carried into (lib/listingUrl.ts); invalid links are rejected below.
  const portalId = normalizeListingReference(input.portalId) || null;
  const dataEntrySource = input.dataEntrySource === 'PORTAL_IMPORT' || portalId
    ? 'PORTAL_IMPORT'
    : 'MANUELL';

  if (
    !Number.isFinite(purchasePrice) || purchasePrice <= 0 ||
    !Number.isFinite(coldRent) || coldRent <= 0 ||
    !Number.isFinite(yearOfConstruction) ||
    !Number.isFinite(kpfMultiplier) ||
    !input.street ||
    !/^\d{5}$/.test(postalCode) ||
    !input.city ||
    !input.condition
  ) {
    return NextResponse.json({ error: 'Invalid quick-check payload' }, { status: 400 });
  }
  if (portalId && !isValidListingUrl(portalId)) {
    return NextResponse.json({ error: LISTING_URL_ERROR }, { status: 400 });
  }

  const { rows } = await db.query<QuickCheckRow>(
    `
      INSERT INTO quick_check (
        user_id,
        portal_id,
        data_entry_source,
        purchase_price,
        cold_rent,
        street,
        postal_code,
        city,
        year_of_construction,
        condition,
        kpf_multiplier
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
    [
      userId,
      portalId,
      dataEntrySource,
      purchasePrice,
      coldRent,
      String(input.street).trim(),
      postalCode,
      String(input.city).trim(),
      yearOfConstruction,
      input.condition,
      kpfMultiplier,
    ],
  );

  return NextResponse.json(mapQuickCheck(rows[0]), { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const id = Number(input.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid quick-check id' }, { status: 400 });

  if (input.action === 'MARK_DETAIL_CHECK') {
    const result = await db.query(
      'UPDATE quick_check SET detail_check = TRUE, updated_at = NOW() WHERE quick_check_id = $1 AND user_id = $2',
      [id, userId],
    );
    return NextResponse.json({ updated: result.rowCount ?? 0 });
  }

  if (input.action === 'ACCEPT' || input.action === 'DISCARD') {
    const { rows } = await db.query<{ property_id: number | null }>(
      'SELECT finalize_quick_check($1::int, $2::uuid, $3::varchar) AS property_id',
      [id, userId, input.action],
    );
    return NextResponse.json({ propertyId: rows[0]?.property_id ?? null });
  }

  const values = input.values ?? {};
  const purchasePrice = Number(values.purchasePrice);
  const coldRent = Number(values.coldRent);
  const yearOfConstruction = Number(values.yearOfConstruction);
  const kpfMultiplier = Number(values.kpfMultiplier);
  const postalCode = String(values.postalCode ?? '');
  if (
    !Number.isFinite(purchasePrice) || purchasePrice <= 0 ||
    !Number.isFinite(coldRent) || coldRent <= 0 ||
    !Number.isFinite(yearOfConstruction) ||
    !Number.isFinite(kpfMultiplier) ||
    !values.street ||
    !/^\d{5}$/.test(postalCode) ||
    !values.city ||
    !values.condition
  ) {
    return NextResponse.json({ error: 'Invalid quick-check payload' }, { status: 400 });
  }
  const portalId = normalizeListingReference(values.portalId) || null;
  if (portalId && !isValidListingUrl(portalId)) {
    return NextResponse.json({ error: LISTING_URL_ERROR }, { status: 400 });
  }
  const { rows } = await db.query<QuickCheckRow>(
    `
      UPDATE quick_check SET
        portal_id = $3, purchase_price = $4, cold_rent = $5, street = $6,
        postal_code = $7, city = $8, year_of_construction = $9,
        condition = $10, kpf_multiplier = $11, updated_at = NOW()
      WHERE quick_check_id = $1 AND user_id = $2
      RETURNING *
    `,
    [
      id, userId, portalId, purchasePrice, coldRent,
      String(values.street).trim(), postalCode,
      String(values.city).trim(), yearOfConstruction, values.condition, kpfMultiplier,
    ],
  );
  if (!rows[0]) return NextResponse.json({ error: 'Quick-check not found' }, { status: 404 });
  return NextResponse.json(mapQuickCheck(rows[0]));
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const ids = Array.isArray(input.ids) ? input.ids.map(Number).filter(Number.isFinite) : [];

  if (ids.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const { rowCount } = await db.query(
    `
      DELETE FROM quick_check
      WHERE user_id = $1
        AND quick_check_id = ANY($2::int[])
    `,
    [userId, ids],
  );

  return NextResponse.json({ deleted: rowCount ?? 0 });
}
