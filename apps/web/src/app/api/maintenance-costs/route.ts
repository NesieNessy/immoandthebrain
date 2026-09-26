import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type MaintenanceCostsRow = {
  maintenance_costs_id: number;
  property_id: number;
  cost_breakdown: boolean;
  allocable_costs: string | number | null;
  non_allocable_costs: string | number | null;
  total_costs: string | number | null;
  house_money: string | number | null;
  allocable_costs_projection: boolean;
  non_allocable_costs_projection: boolean;
  total_costs_projection: boolean;
  cost_items: unknown | null;
  created_at: string;
  updated_at: string;
};

function toNumberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function mapMaintenanceCosts(row: MaintenanceCostsRow) {
  return {
    maintenanceCostsId: row.maintenance_costs_id,
    propertyId: row.property_id,
    costBreakdown: row.cost_breakdown,
    allocableCosts: toNumberOrNull(row.allocable_costs),
    nonAllocableCosts: toNumberOrNull(row.non_allocable_costs),
    totalCosts: toNumberOrNull(row.total_costs),
    houseMoney: toNumberOrNull(row.house_money),
    allocableCostsProjection: row.allocable_costs_projection,
    nonAllocableCostsProjection: row.non_allocable_costs_projection,
    totalCostsProjection: row.total_costs_projection,
    costItems: row.cost_items ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  const propertyId = Number(searchParams.get('propertyId'));

  if (Number.isInteger(id)) {
    const { rows } = await db.query<MaintenanceCostsRow>(
      `
        SELECT mc.*
        FROM maintenance_costs mc
        JOIN property p ON p.property_id = mc.property_id
        WHERE mc.maintenance_costs_id = $1
          AND p.user_id = $2
        LIMIT 1
      `,
      [id, userId],
    );
    if (!rows[0]) return NextResponse.json(null);
    return NextResponse.json(mapMaintenanceCosts(rows[0]));
  }

  if (Number.isInteger(propertyId)) {
    const { rows } = await db.query<MaintenanceCostsRow>(
      `
        SELECT mc.*
        FROM maintenance_costs mc
        JOIN property p ON p.property_id = mc.property_id
        WHERE mc.property_id = $1
          AND p.user_id = $2
        ORDER BY mc.created_at DESC
      `,
      [propertyId, userId],
    );
    return NextResponse.json(rows.map(mapMaintenanceCosts));
  }

  return NextResponse.json({ error: 'Das Objekt fehlt.' }, { status: 400 });
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const propertyId = Number(input.propertyId);
  if (!Number.isInteger(propertyId)) {
    return NextResponse.json({ error: 'Die Angaben zu den laufenden Kosten sind unvollständig oder ungültig.' }, { status: 400 });
  }

  const { rows } = await db.query<MaintenanceCostsRow>(
    `
      INSERT INTO maintenance_costs (
        property_id, cost_breakdown, allocable_costs, non_allocable_costs,
        total_costs, house_money, allocable_costs_projection,
        non_allocable_costs_projection, total_costs_projection, cost_items
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
      WHERE EXISTS (SELECT 1 FROM property WHERE property_id = $1 AND user_id = $11)
      RETURNING *
    `,
    [
      propertyId,
      input.costBreakdown ?? false,
      input.allocableCosts ?? null,
      input.nonAllocableCosts ?? null,
      input.totalCosts ?? null,
      input.houseMoney ?? null,
      input.allocableCostsProjection ?? false,
      input.nonAllocableCostsProjection ?? false,
      input.totalCostsProjection ?? false,
      input.costItems != null ? JSON.stringify(input.costItems) : null,
      userId,
    ],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  return NextResponse.json(mapMaintenanceCosts(rows[0]), { status: 201 });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const maintenanceCostsId = Number(input.maintenanceCostsId);
  if (!Number.isInteger(maintenanceCostsId)) {
    return NextResponse.json({ error: 'Ungültiger Eintrag.' }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const addSet = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (input.costBreakdown !== undefined) addSet('cost_breakdown', input.costBreakdown);
  if (input.allocableCosts !== undefined) addSet('allocable_costs', input.allocableCosts);
  if (input.nonAllocableCosts !== undefined) addSet('non_allocable_costs', input.nonAllocableCosts);
  if (input.totalCosts !== undefined) addSet('total_costs', input.totalCosts);
  if (input.houseMoney !== undefined) addSet('house_money', input.houseMoney);
  if (input.allocableCostsProjection !== undefined) addSet('allocable_costs_projection', input.allocableCostsProjection);
  if (input.nonAllocableCostsProjection !== undefined) addSet('non_allocable_costs_projection', input.nonAllocableCostsProjection);
  if (input.totalCostsProjection !== undefined) addSet('total_costs_projection', input.totalCostsProjection);
  if (input.costItems !== undefined) {
    values.push(input.costItems != null ? JSON.stringify(input.costItems) : null);
    sets.push(`cost_items = $${values.length}::jsonb`);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übermittelt.' }, { status: 400 });
  }

  values.push(maintenanceCostsId, userId);
  const { rows } = await db.query<MaintenanceCostsRow>(
    `
      UPDATE maintenance_costs mc SET
        ${sets.join(', ')},
        updated_at = NOW()
      FROM property p
      WHERE mc.property_id = p.property_id
        AND mc.maintenance_costs_id = $${values.length - 1}
        AND p.user_id = $${values.length}
      RETURNING mc.*
    `,
    values,
  );

  if (!rows[0]) return NextResponse.json({ error: 'Eintrag nicht gefunden.' }, { status: 404 });
  return NextResponse.json(mapMaintenanceCosts(rows[0]));
}
