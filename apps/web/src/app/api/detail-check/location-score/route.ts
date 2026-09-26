import { computeLocationScore } from '@/lib/detailCheck/locationScoring';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, street, postal_code, city FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };
  const propertyRows = await db.query(
    `
      SELECT street_house_number, postal_code, city
      FROM detail_check_property_data
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );

  const quickCheck = quickCheckRows.rows[0];
  const property = propertyRows.rows[0];

  return {
    quickCheck,
    streetHouseNumber: property?.street_house_number ?? quickCheck?.street ?? '',
    postalCode: property?.postal_code ?? quickCheck?.postal_code ?? '',
    city: property?.city ?? quickCheck?.city ?? '',
  };
}

async function saveResult(userId: string, workflowId: string, quickCheckId: number | null, result: ReturnType<typeof computeLocationScore>) {
  await db.query(
    `
      INSERT INTO detail_check_location_score (
        user_id, quick_check_id, workflow_id, city, postal_code, street_house_number,
        total_score, macro_score, micro_score, result
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        city = EXCLUDED.city,
        postal_code = EXCLUDED.postal_code,
        street_house_number = EXCLUDED.street_house_number,
        total_score = EXCLUDED.total_score,
        macro_score = EXCLUDED.macro_score,
        micro_score = EXCLUDED.micro_score,
        result = EXCLUDED.result,
        updated_at = NOW()
    `,
    [
      userId,
      quickCheckId,
      workflowId,
      result.city || null,
      result.postalCode || null,
      result.address || null,
      result.totalScore,
      result.macroScore,
      result.microScore,
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
  const result = computeLocationScore(context);

  return NextResponse.json({
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
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
  const result = computeLocationScore(context);
  await saveResult(userId, workflowId, context.quickCheck?.quick_check_id ?? null, result);

  return NextResponse.json({
    status: 'OK',
    next: 'VERGLEICH',
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    ...result,
  });
}
