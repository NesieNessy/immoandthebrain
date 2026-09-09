import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// A detail check's data is spread across these tables, all keyed by
// (user_id, workflow_id) with no FK between them — so deleting one means
// deleting from every table individually.
const DETAIL_CHECK_TABLES = [
  'detail_check_property_data',
  'detail_check_acquisition_costs',
  'detail_check_rental',
  'detail_check_financing',
  'detail_check_depreciation',
  'detail_check_renovation',
  'detail_check_rent_increases',
  'detail_check_rent_calculator',
  'detail_check_location_score',
  'detail_check_comparison',
  'detail_check_recommendation',
];

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const quickCheckId = url.searchParams.get('quickCheckId');
  // Scopes the list to one specific workflow — used by the step pages to
  // check which steps already have saved data (so the Stepper can unlock
  // them), as opposed to the unfiltered call the overview page makes.
  const workflowId = quickCheckId ? `quick-check:${quickCheckId}` : url.searchParams.get('workflowId');
  const filterClause = workflowId ? 'AND pd.workflow_id = $2' : '';
  const values = workflowId ? [userId, workflowId] : [userId];

  const { rows } = await db.query(
    `
      SELECT
        pd.workflow_id,
        pd.quick_check_id,
        pd.street_house_number,
        pd.postal_code,
        pd.city,
        pd.year_of_construction,
        pd.living_area_m2,
        pd.property_category,
        pd.parking_spaces,
        pd.energy_efficiency,
        pd.created_at,
        GREATEST(pd.updated_at, COALESCE(rec.updated_at, pd.updated_at)) AS updated_at,
        COALESCE(costs.purchase_price, 0) AS purchase_price,
        rec.recommendation_score,
        rec.recommendation_level,
        (costs.workflow_id IS NOT NULL) AS has_acquisition_costs,
        (rental.workflow_id IS NOT NULL) AS has_rental,
        (fin.workflow_id IS NOT NULL) AS has_financing,
        (dep.workflow_id IS NOT NULL) AS has_depreciation,
        (reno.workflow_id IS NOT NULL) AS has_renovation,
        (calc.workflow_id IS NOT NULL) AS has_calculator,
        (loc.workflow_id IS NOT NULL) AS has_location_score,
        (comp.workflow_id IS NOT NULL) AS has_comparison
      FROM detail_check_property_data pd
      LEFT JOIN detail_check_acquisition_costs costs
        ON costs.user_id = pd.user_id AND costs.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_rental rental
        ON rental.user_id = pd.user_id AND rental.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_financing fin
        ON fin.user_id = pd.user_id AND fin.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_depreciation dep
        ON dep.user_id = pd.user_id AND dep.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_renovation reno
        ON reno.user_id = pd.user_id AND reno.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_rent_calculator calc
        ON calc.user_id = pd.user_id AND calc.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_location_score loc
        ON loc.user_id = pd.user_id AND loc.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_comparison comp
        ON comp.user_id = pd.user_id AND comp.workflow_id = pd.workflow_id
      LEFT JOIN detail_check_recommendation rec
        ON rec.user_id = pd.user_id AND rec.workflow_id = pd.workflow_id
      WHERE pd.user_id = $1 ${filterClause}
      ORDER BY updated_at DESC
      LIMIT 100
    `,
    values,
  );

  return NextResponse.json(rows);
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  const input = await request.json();
  const workflowId = typeof input.workflowId === 'string' ? input.workflowId : null;

  if (!workflowId) {
    return NextResponse.json({ error: 'workflowId required' }, { status: 400 });
  }

  for (const table of DETAIL_CHECK_TABLES) {
    await db.query(`DELETE FROM ${table} WHERE user_id = $1 AND workflow_id = $2`, [userId, workflowId]);
  }

  return NextResponse.json({ deleted: true });
}
