import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');
  const propertyUnitId = url.searchParams.get('propertyUnitId');
  // When given, load the settlement/tenancy for this exact billing period
  // instead of "most recent" — lets the UI browse a specific past period's
  // settlement (see the "per period" fix) without disturbing any other
  // period's saved data.
  const periodStart = url.searchParams.get('periodStart');
  const periodEnd = url.searchParams.get('periodEnd');

  if (!propertyId) return NextResponse.json({ error: 'propertyId missing' }, { status: 400 });

  const values: unknown[] = [userId, Number(propertyId)];

  // Fetch units and current settlement and tenancy in parallel where possible
  const unitsPromise = db.query(
    `SELECT r.* FROM property_unit r WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.property_id = $2 ORDER BY sort_order, property_unit_id`,
    values,
  );

  // Settlements are per unit, not shared across a building (see the
  // per-unit migration) — without a unit, "the settlement" isn't a
  // well-defined thing to look up any more, so this returns none rather
  // than arbitrarily picking whichever unit's row happens to sort first.
  const settlementPromise = !propertyUnitId
    ? Promise.resolve({ rows: [] } as { rows: unknown[] })
    : periodStart && periodEnd
      ? db.query(
          `SELECT r.* FROM service_charge_settlement r WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.property_id = $2 AND r.property_unit_id = $3 AND r.period_start = $4 AND r.period_end = $5 LIMIT 1`,
          [...values, Number(propertyUnitId), periodStart, periodEnd],
        )
      : db.query(
          `SELECT r.* FROM service_charge_settlement r WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.property_id = $2 AND r.property_unit_id = $3 ORDER BY period_end DESC LIMIT 1`,
          [...values, Number(propertyUnitId)],
        );

  // house_money (WEG/Hausgeld) lives on the tenancy's linked maintenance_costs
  // row, not on tenancy itself — joined in here so the Nebenkostenabrechnung
  // "Wert vorschlagen" ratio (NK-Vorauszahlung ÷ WEG) has it without a
  // separate round-trip.
  const tenancyPromise = propertyUnitId
    ? (periodStart && periodEnd
        ? db.query(
            // The tenancy that overlaps the viewed period — not just
            // whichever tenancy is current today — so proration and the
            // NK-Vorauszahlung figures shown for a past settlement use the
            // tenant who actually held the unit during that period.
            `SELECT r.*, mc.house_money FROM tenancy r LEFT JOIN maintenance_costs mc ON mc.maintenance_costs_id = r.maintenance_costs_id WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.property_unit_id = $2 AND r.tenancy_start_date <= $4 AND (r.tenancy_end_date IS NULL OR r.tenancy_end_date >= $3) ORDER BY tenancy_start_date DESC NULLS LAST LIMIT 1`,
            [userId, Number(propertyUnitId), periodStart, periodEnd],
          )
        : db.query(
            `SELECT r.*, mc.house_money FROM tenancy r LEFT JOIN maintenance_costs mc ON mc.maintenance_costs_id = r.maintenance_costs_id WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.property_unit_id = $2 ORDER BY (tenancy_end_date IS NULL) DESC, tenancy_start_date DESC NULLS LAST LIMIT 1`,
            [userId, Number(propertyUnitId)],
          ))
    : Promise.resolve({ rows: [] } as { rows: unknown[] });

  const [unitsRes, settlementRes, tenancyRes] = await Promise.all([unitsPromise, settlementPromise, tenancyPromise]);

  let costItems: unknown[] = [];
  if (settlementRes.rows[0]) {
    const settlementId = settlementRes.rows[0].service_charge_settlement_id;
    const costRes = await db.query(
      `SELECT r.* FROM service_charge_cost_item r WHERE EXISTS (SELECT 1 FROM property p WHERE p.property_id = r.property_id AND p.user_id = $1) AND r.service_charge_settlement_id = $2 ORDER BY sort_order, service_charge_cost_item_id`,
      [userId, settlementId],
    );
    costItems = costRes.rows;
  }
  const result = { units: unitsRes.rows, settlement: settlementRes.rows[0] ?? null, tenancy: tenancyRes.rows[0] ?? null, costItems };

  return NextResponse.json(result);
}
