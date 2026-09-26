import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TenancyMoveOutRow = {
  tenancy_move_out_id: number;
  tenancy_id: number;
  property_id: number;
  meter_readings: unknown | null;
  damages: unknown | null;
  created_at: string;
  updated_at: string;
};

function mapTenancyMoveOut(row: TenancyMoveOutRow) {
  return {
    tenancyMoveOutId: row.tenancy_move_out_id,
    tenancyId: row.tenancy_id,
    propertyId: row.property_id,
    meterReadings: row.meter_readings ?? [],
    damages: row.damages ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const { searchParams } = new URL(request.url);
  const tenancyId = Number(searchParams.get('tenancyId'));
  if (!Number.isInteger(tenancyId)) {
    return NextResponse.json({ error: 'Das Mietverhältnis fehlt.' }, { status: 400 });
  }

  const { rows } = await db.query<TenancyMoveOutRow>(
    `
      SELECT tmo.*
      FROM tenancy_move_out tmo
      JOIN property p ON p.property_id = tmo.property_id
      WHERE tmo.tenancy_id = $1
        AND p.user_id = $2
      LIMIT 1
    `,
    [tenancyId, userId],
  );

  if (!rows[0]) return NextResponse.json(null);
  return NextResponse.json(mapTenancyMoveOut(rows[0]));
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();

  const tenancyId = Number(input.tenancyId);
  const propertyId = Number(input.propertyId);
  if (!Number.isInteger(tenancyId) || !Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Die Angaben zum Auszug sind unvollständig oder ungültig.' }, { status: 400 });
  }

  const { rows } = await db.query<TenancyMoveOutRow>(
    `
      INSERT INTO tenancy_move_out (tenancy_id, property_id, meter_readings, damages)
      SELECT $1, $2, $3::jsonb, $4::jsonb
      WHERE EXISTS (SELECT 1 FROM property WHERE property_id = $2 AND user_id = $5)
      RETURNING *
    `,
    [tenancyId, propertyId, JSON.stringify(input.meterReadings ?? []), JSON.stringify(input.damages ?? []), userId],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  return NextResponse.json(mapTenancyMoveOut(rows[0]), { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const tenancyMoveOutId = Number(input.tenancyMoveOutId);
  if (!Number.isInteger(tenancyMoveOutId)) {
    return NextResponse.json({ error: 'Ungültiger Auszug.' }, { status: 400 });
  }

  const { rows } = await db.query<TenancyMoveOutRow>(
    `
      UPDATE tenancy_move_out tmo SET
        meter_readings = $3::jsonb,
        damages = $4::jsonb,
        updated_at = NOW()
      FROM property p
      WHERE tmo.property_id = p.property_id
        AND tmo.tenancy_move_out_id = $1
        AND p.user_id = $2
      RETURNING tmo.*
    `,
    [tenancyMoveOutId, userId, JSON.stringify(input.meterReadings ?? []), JSON.stringify(input.damages ?? [])],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Auszug nicht gefunden.' }, { status: 404 });
  return NextResponse.json(mapTenancyMoveOut(rows[0]));
}
