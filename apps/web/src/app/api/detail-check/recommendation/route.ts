import { computeRecommendation } from '@/lib/detailCheck/recommendation';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toArray(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function lastTimelineRent(calculatorResult: Record<string, unknown>, fallbackRent: number): number {
  const timeline = toArray(calculatorResult.timeline);
  const last = timeline[timeline.length - 1];
  return toNumber(last?.rentTotal ?? last?.miete_monat ?? last?.rent_total ?? fallbackRent) || fallbackRent;
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, purchase_price, cold_rent FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };
  const acquisitionRows = await db.query(
    `
      SELECT purchase_price, parking_purchase_price, total_additional_costs, total_costs
      FROM detail_check_acquisition_costs
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const rentalRows = await db.query(
    `
      SELECT cold_rent, service_charges_non_allocable
      FROM detail_check_rental
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const financingRows = await db.query(
    `
      SELECT selected_variant, offer_monthly_debt_service, individual_monthly_debt_service
      FROM detail_check_financing
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const depreciationRows = await db.query(
    `
      SELECT afa_percent, building_value
      FROM detail_check_depreciation
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const calculatorRows = await db.query(
    `
      SELECT result
      FROM detail_check_rent_calculator
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const locationRows = await db.query(
    `
      SELECT total_score
      FROM detail_check_location_score
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const comparisonRows = await db.query(
    `
      SELECT references_result
      FROM detail_check_comparison
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );

  const quickCheck = quickCheckRows.rows[0];
  const acquisition = acquisitionRows.rows[0];
  const rental = rentalRows.rows[0];
  const financing = financingRows.rows[0];
  const depreciation = depreciationRows.rows[0];
  const calculator = calculatorRows.rows[0];
  const selectedVariant = financing?.selected_variant === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'OFFER';
  const monthlyDebtService = selectedVariant === 'INDIVIDUAL'
    ? toNumber(financing?.individual_monthly_debt_service)
    : toNumber(financing?.offer_monthly_debt_service);
  const coldRentToday = toNumber(rental?.cold_rent ?? quickCheck?.cold_rent ?? 0);
  const calculatorResult = toObject(calculator?.result);
  const references = toArray(comparisonRows.rows[0]?.references_result);
  const bestReference = references[0];

  return {
    quickCheck,
    selectedVariant,
    input: {
      purchasePrice: toNumber(acquisition?.purchase_price ?? quickCheck?.purchase_price ?? 0),
      parkingPurchasePrice: toNumber(acquisition?.parking_purchase_price),
      totalAdditionalCosts: toNumber(acquisition?.total_additional_costs),
      totalCosts: toNumber(acquisition?.total_costs),
      coldRentToday,
      rentInTenYears: lastTimelineRent(calculatorResult, coldRentToday),
      monthlyDebtService,
      serviceChargesNonAllocable: toNumber(rental?.service_charges_non_allocable),
      afaPercent: toNumber(depreciation?.afa_percent),
      buildingValue: toNumber(depreciation?.building_value),
      locationScore: locationRows.rows[0] ? toNumber(locationRows.rows[0].total_score) : null,
      comparisonSimilarityScore: bestReference ? toNumber(bestReference.similarityScore) : null,
    },
  };
}

async function saveResult(
  userId: string,
  workflowId: string,
  quickCheckId: number | null,
  result: ReturnType<typeof computeRecommendation>,
) {
  await db.query(
    `
      INSERT INTO detail_check_recommendation (
        user_id, quick_check_id, workflow_id, recommendation_score,
        recommendation_level, result
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        recommendation_score = EXCLUDED.recommendation_score,
        recommendation_level = EXCLUDED.recommendation_level,
        result = EXCLUDED.result,
        updated_at = NOW()
    `,
    [
      userId,
      quickCheckId,
      workflowId,
      result.recommendationScore,
      result.level,
      JSON.stringify(result),
    ],
  );
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const url = new URL(request.url);
  const quickCheckId = url.searchParams.get('quickCheckId');
  const workflowId = resolveWorkflowId(userId, quickCheckId, url.searchParams.get('workflowId'));
  if (workflowId instanceof Response) return workflowId;
  const context = await loadContext(userId, workflowId, quickCheckId);
  const result = computeRecommendation(context.input);

  return NextResponse.json({
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    selectedFinancingVariant: context.selectedVariant,
    ...result,
  });
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const quickCheckId = input.quickCheckId ? String(input.quickCheckId) : null;
  const workflowId = resolveWorkflowId(userId, quickCheckId, input.workflowId ? String(input.workflowId) : null);
  if (workflowId instanceof Response) return workflowId;
  const context = await loadContext(userId, workflowId, quickCheckId);
  const result = computeRecommendation(context.input);
  await saveResult(userId, workflowId, context.quickCheck?.quick_check_id ?? null, result);

  return NextResponse.json({
    status: 'OK',
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    selectedFinancingVariant: context.selectedVariant,
    ...result,
  });
}
