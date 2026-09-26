import { roundCurrency } from '@/lib/detailCheck/acquisitionCosts';
import { currentMonthDate } from '@/lib/detailCheck/rental';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadQuickCheck(userId: string, quickCheckId: string | null) {
  if (!quickCheckId) return null;
  const { rows } = await db.query(
    `
      SELECT quick_check_id, cold_rent
      FROM quick_check
      WHERE user_id = $1
        AND quick_check_id = $2
      LIMIT 1
    `,
    [userId, Number(quickCheckId)],
  );
  return rows[0] ?? null;
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const url = new URL(request.url);
  const quickCheckId = url.searchParams.get('quickCheckId');
  const workflowId = resolveWorkflowId(userId, quickCheckId, url.searchParams.get('workflowId'));
  if (workflowId instanceof Response) return workflowId;
  const quickCheck = await loadQuickCheck(userId, quickCheckId);

  const { rows } = await db.query(
    `
      SELECT *
      FROM detail_check_rental
      WHERE user_id = $1
        AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );

  const saved = rows[0];
  const propertyRows = await db.query(
    'SELECT parking_spaces FROM detail_check_property_data WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );

  return NextResponse.json({
    workflowId,
    quickCheckId: quickCheck?.quick_check_id ?? null,
    valuationDate: saved?.valuation_date ?? currentMonthDate(),
    isRented: saved?.is_rented ?? true,
    source: saved?.source ?? 'MANUELL',
    coldRent: toNumber(saved?.cold_rent ?? quickCheck?.cold_rent ?? 0),
    parkingRent: toNumber(saved?.parking_rent ?? 0),
    serviceChargesAllocable: toNumber(saved?.service_charges_allocable ?? 0),
    serviceChargesNonAllocable: toNumber(saved?.service_charges_non_allocable ?? 0),
    serviceChargesTotal: toNumber(saved?.service_charges_total ?? 0),
    parkingSpaces: toNumber(propertyRows.rows[0]?.parking_spaces ?? 0),
    plausibilityWarningNk: saved?.plausibility_warning_nk ?? false,
  });
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const quickCheckId = input.quickCheckId ? String(input.quickCheckId) : null;
  const workflowId = resolveWorkflowId(userId, quickCheckId, input.workflowId ? String(input.workflowId) : null);
  if (workflowId instanceof Response) return workflowId;
  const quickCheck = await loadQuickCheck(userId, quickCheckId);

  const isRented = Boolean(input.isRented);
  const valuationDate = String(input.valuationDate ?? currentMonthDate());
  const coldRent = isRented ? toNumber(input.coldRent) : 0;
  const parkingRent = isRented ? toNumber(input.parkingRent) : 0;
  const serviceChargesAllocable = toNumber(input.serviceChargesAllocable);
  const serviceChargesNonAllocable = toNumber(input.serviceChargesNonAllocable);
  const serviceChargesTotal = roundCurrency(serviceChargesAllocable + serviceChargesNonAllocable);
  const values = [
    coldRent,
    parkingRent,
    serviceChargesAllocable,
    serviceChargesNonAllocable,
    serviceChargesTotal,
  ];

  if (
    !/^\d{4}-\d{2}-01$/.test(valuationDate) ||
    values.some((value) => value < 0 || value > 1_000_000_000)
  ) {
    return NextResponse.json({ error: 'Die Angaben zur Vermietung sind ungültig. Bitte nur Beträge ab 0 eingeben.' }, { status: 400 });
  }

  const plausibilityWarningNk = false;

  await db.query(
    `
      INSERT INTO detail_check_rental (
        user_id,
        quick_check_id,
        workflow_id,
        valuation_date,
        is_rented,
        source,
        cold_rent,
        parking_rent,
        service_charges_allocable,
        service_charges_non_allocable,
        service_charges_total,
        plausibility_warning_nk
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        valuation_date = EXCLUDED.valuation_date,
        is_rented = EXCLUDED.is_rented,
        source = EXCLUDED.source,
        cold_rent = EXCLUDED.cold_rent,
        parking_rent = EXCLUDED.parking_rent,
        service_charges_allocable = EXCLUDED.service_charges_allocable,
        service_charges_non_allocable = EXCLUDED.service_charges_non_allocable,
        service_charges_total = EXCLUDED.service_charges_total,
        plausibility_warning_nk = EXCLUDED.plausibility_warning_nk,
        updated_at = NOW()
    `,
    [
      userId,
      quickCheck?.quick_check_id ?? null,
      workflowId,
      valuationDate,
      isRented,
      input.source ?? 'MANUELL',
      coldRent,
      parkingRent,
      serviceChargesAllocable,
      serviceChargesNonAllocable,
      serviceChargesTotal,
      plausibilityWarningNk,
    ],
  );

  return NextResponse.json({ status: 'OK', next: 'FINANZIERUNG', plausibilityWarningNk });
}
