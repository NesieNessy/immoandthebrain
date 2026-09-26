import {
  buildSubjectProperty,
  deviationLabel,
  referenceMatches,
  scoreReference,
  type ReferenceProperty,
  type SubjectProperty,
} from '@/lib/detailCheck/comparison';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, street, postal_code, city, purchase_price, cold_rent, year_of_construction FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };
  const propertyRows = await db.query(
    `
      SELECT street_house_number, postal_code, city, living_area_m2, year_of_construction
      FROM detail_check_property_data
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const acquisitionRows = await db.query(
    `
      SELECT purchase_price
      FROM detail_check_acquisition_costs
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const rentalRows = await db.query(
    `
      SELECT cold_rent
      FROM detail_check_rental
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );

  const quickCheck = quickCheckRows.rows[0];
  const property = propertyRows.rows[0];
  const acquisition = acquisitionRows.rows[0];
  const rental = rentalRows.rows[0];

  return {
    quickCheck,
    subject: buildSubjectProperty({
      streetHouseNumber: property?.street_house_number ?? quickCheck?.street ?? '',
      postalCode: property?.postal_code ?? quickCheck?.postal_code ?? '',
      city: property?.city ?? quickCheck?.city ?? '',
      purchasePrice: toNumber(acquisition?.purchase_price ?? quickCheck?.purchase_price ?? 0),
      coldRent: toNumber(rental?.cold_rent ?? quickCheck?.cold_rent ?? 0),
      livingAreaM2: toNumber(property?.living_area_m2 ?? 0),
      yearOfConstruction: toNumber(property?.year_of_construction ?? quickCheck?.year_of_construction ?? 0),
    }),
  };
}

async function loadReferences(subject: SubjectProperty): Promise<ReferenceProperty[]> {
  const { rows } = await db.query(
    `
      SELECT reference_id, street_house_number, postal_code, city, purchase_price,
             cold_rent, living_area_m2, year_of_construction
      FROM comparison_reference_properties
      WHERE ABS(cold_rent - $1) <= 200
        AND ABS(living_area_m2 - $2) <= 10
        AND ABS(year_of_construction - $3) <= 5
        AND (
          ($4::boolean = TRUE AND postal_code = $5)
          OR
          ($4::boolean = FALSE AND (postal_code = $5 OR LOWER(city) = LOWER($6)))
        )
      LIMIT 50
    `,
    [
      subject.coldRent,
      subject.livingAreaM2,
      subject.yearOfConstruction,
      subject.denseMarket,
      subject.postalCode,
      subject.city,
    ],
  );

  const candidates = rows.map((row) => {
    const referenceSubject = buildSubjectProperty({
      streetHouseNumber: row.street_house_number,
      postalCode: row.postal_code,
      city: row.city,
      purchasePrice: toNumber(row.purchase_price),
      coldRent: toNumber(row.cold_rent),
      livingAreaM2: toNumber(row.living_area_m2),
      yearOfConstruction: toNumber(row.year_of_construction),
    });
    const similarityScore = scoreReference(subject, referenceSubject);
    return {
      ...referenceSubject,
      id: row.reference_id,
      similarityScore,
      deviationLabel: deviationLabel(similarityScore),
    };
  });

  return candidates
    .filter((item) => referenceMatches(subject, item))
    .sort((a, b) => a.similarityScore - b.similarityScore)
    .slice(0, 3);
}

async function saveResult(
  userId: string,
  workflowId: string,
  quickCheckId: number | null,
  subject: SubjectProperty,
  references: ReferenceProperty[],
) {
  await db.query(
    `
      INSERT INTO detail_check_comparison (
        user_id, quick_check_id, workflow_id, subject, references_result
      )
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        subject = EXCLUDED.subject,
        references_result = EXCLUDED.references_result,
        updated_at = NOW()
    `,
    [
      userId,
      quickCheckId,
      workflowId,
      JSON.stringify(subject),
      JSON.stringify(references),
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
  const references = await loadReferences(context.subject);

  return NextResponse.json({
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    subject: context.subject,
    references,
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
  const references = await loadReferences(context.subject);
  await saveResult(userId, workflowId, context.quickCheck?.quick_check_id ?? null, context.subject, references);

  return NextResponse.json({
    status: 'OK',
    next: 'ERGEBNIS',
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    subject: context.subject,
    references,
  });
}
