import {
  computePriceSplitIndividual,
  computePriceSplitStandard,
  computeRemainingUsefulLife,
  type DepreciationMode,
  type ModernizationSelections,
  type PriceSplitMode,
} from '@/lib/detailCheck/depreciation';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PROPERTY_CATEGORIES = new Set(['EIGENTUMSWOHNUNG', 'HOLZBAUWEISE', 'DENKMALGESCHUETZT']);

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyModernization(): ModernizationSelections {
  return {
    modernizationRoof: '',
    modernizationWindows: '',
    modernizationLines: '',
    modernizationHeating: '',
    modernizationFacade: '',
    modernizationBathrooms: '',
    modernizationInterior: '',
  };
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, purchase_price, city, year_of_construction FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };
  const propertyRows = await db.query(
    'SELECT property_category, city, year_of_construction FROM detail_check_property_data WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );
  const acquisitionRows = await db.query(
    'SELECT purchase_price FROM detail_check_acquisition_costs WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );

  const quickCheck = quickCheckRows.rows[0];
  const property = propertyRows.rows[0];
  const city = property?.city ?? quickCheck?.city ?? '';
  const splitRows = await db.query(
    'SELECT building_share_percent, land_share_percent FROM city_purchase_price_split WHERE city_name = $1 LIMIT 1',
    [city],
  );

  return {
    quickCheck,
    propertyCategory: property?.property_category ?? 'EIGENTUMSWOHNUNG',
    city,
    yearOfConstruction: toNumber(property?.year_of_construction ?? quickCheck?.year_of_construction ?? new Date().getFullYear()),
    purchasePrice: toNumber(acquisitionRows.rows[0]?.purchase_price ?? quickCheck?.purchase_price ?? 0),
    buildingSharePercent: toNumber(splitRows.rows[0]?.building_share_percent ?? 65),
    landSharePercent: toNumber(splitRows.rows[0]?.land_share_percent ?? 35),
  };
}

function buildResponse(saved: Record<string, unknown> | undefined, context: Awaited<ReturnType<typeof loadContext>>) {
  const depreciationMode = (saved?.depreciation_mode as DepreciationMode | undefined) ?? 'STANDARD';
  const priceSplitMode = (saved?.price_split_mode as PriceSplitMode | undefined) ?? 'STANDARD';
  const modernization: ModernizationSelections = {
    modernizationRoof: String(saved?.modernization_roof ?? ''),
    modernizationWindows: String(saved?.modernization_windows ?? ''),
    modernizationLines: String(saved?.modernization_lines ?? ''),
    modernizationHeating: String(saved?.modernization_heating ?? ''),
    modernizationFacade: String(saved?.modernization_facade ?? ''),
    modernizationBathrooms: String(saved?.modernization_bathrooms ?? ''),
    modernizationInterior: String(saved?.modernization_interior ?? ''),
  };
  const standardRnd = { remainingUsefulLifeYears: 50, afaPercent: 2 };
  const individualRnd = computeRemainingUsefulLife({
    category: context.propertyCategory,
    yearOfConstruction: context.yearOfConstruction,
    selections: modernization,
  });
  const landReferenceValue = toNumber(saved?.land_reference_value ?? 0);
  const plotAreaM2 = toNumber(saved?.plot_area_m2 ?? 0);
  const coOwnershipNumerator = toNumber(saved?.co_ownership_numerator ?? 0);
  const coOwnershipDenominator = toNumber(saved?.co_ownership_denominator ?? 0);
  const standardSplit = computePriceSplitStandard(context.purchasePrice, context.buildingSharePercent);
  const individualSplit = computePriceSplitIndividual({
    purchasePrice: context.purchasePrice,
    landReferenceValue,
    plotAreaM2,
    coOwnershipNumerator,
    coOwnershipDenominator,
  });

  return {
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    city: context.city,
    propertyCategory: context.propertyCategory,
    yearOfConstruction: context.yearOfConstruction,
    purchasePrice: context.purchasePrice,
    depreciationMode,
    priceSplitMode,
    modernization,
    landReferenceValue,
    plotAreaM2,
    coOwnershipNumerator,
    coOwnershipDenominator,
    standardRnd,
    individualRnd,
    standardSplit,
    individualSplit,
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const url = new URL(request.url);
  const quickCheckId = url.searchParams.get('quickCheckId');
  const workflowId = resolveWorkflowId(userId, quickCheckId, url.searchParams.get('workflowId'));
  if (workflowId instanceof Response) return workflowId;
  const context = await loadContext(userId, workflowId, quickCheckId);
  const { rows } = await db.query(
    'SELECT * FROM detail_check_depreciation WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );

  return NextResponse.json({ workflowId, ...buildResponse(rows[0], context) });
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  const quickCheckId = input.quickCheckId ? String(input.quickCheckId) : null;
  const workflowId = resolveWorkflowId(userId, quickCheckId, input.workflowId ? String(input.workflowId) : null);
  if (workflowId instanceof Response) return workflowId;
  const context = await loadContext(userId, workflowId, quickCheckId);
  const requestedPropertyCategory = String(input.propertyCategory ?? context.propertyCategory);
  const propertyCategory = PROPERTY_CATEGORIES.has(requestedPropertyCategory)
    ? requestedPropertyCategory
    : 'EIGENTUMSWOHNUNG';
  const depreciationMode: DepreciationMode = input.depreciationMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'STANDARD';
  const priceSplitMode: PriceSplitMode = input.priceSplitMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'STANDARD';
  const modernization: ModernizationSelections = { ...emptyModernization(), ...(input.modernization ?? {}) };
  const landReferenceValue = toNumber(input.landReferenceValue);
  const plotAreaM2 = toNumber(input.plotAreaM2);
  const coOwnershipNumerator = toNumber(input.coOwnershipNumerator);
  const coOwnershipDenominator = toNumber(input.coOwnershipDenominator);
  const rnd = depreciationMode === 'STANDARD'
    ? { remainingUsefulLifeYears: 50, afaPercent: 2 }
    : computeRemainingUsefulLife({
        category: propertyCategory,
        yearOfConstruction: context.yearOfConstruction,
        selections: modernization,
      });
  const split = priceSplitMode === 'STANDARD'
    ? computePriceSplitStandard(context.purchasePrice, context.buildingSharePercent)
    : computePriceSplitIndividual({
        purchasePrice: context.purchasePrice,
        landReferenceValue,
        plotAreaM2,
        coOwnershipNumerator,
        coOwnershipDenominator,
      });

  await db.query(
    `
      INSERT INTO detail_check_depreciation (
        user_id, quick_check_id, workflow_id, depreciation_mode, price_split_mode,
        modernization_roof, modernization_windows, modernization_lines,
        modernization_heating, modernization_facade, modernization_bathrooms,
        modernization_interior, land_reference_value, plot_area_m2,
        co_ownership_numerator, co_ownership_denominator,
        remaining_useful_life_years, afa_percent, building_value,
        building_share_percent, land_value, land_share_percent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        depreciation_mode = EXCLUDED.depreciation_mode,
        price_split_mode = EXCLUDED.price_split_mode,
        modernization_roof = EXCLUDED.modernization_roof,
        modernization_windows = EXCLUDED.modernization_windows,
        modernization_lines = EXCLUDED.modernization_lines,
        modernization_heating = EXCLUDED.modernization_heating,
        modernization_facade = EXCLUDED.modernization_facade,
        modernization_bathrooms = EXCLUDED.modernization_bathrooms,
        modernization_interior = EXCLUDED.modernization_interior,
        land_reference_value = EXCLUDED.land_reference_value,
        plot_area_m2 = EXCLUDED.plot_area_m2,
        co_ownership_numerator = EXCLUDED.co_ownership_numerator,
        co_ownership_denominator = EXCLUDED.co_ownership_denominator,
        remaining_useful_life_years = EXCLUDED.remaining_useful_life_years,
        afa_percent = EXCLUDED.afa_percent,
        building_value = EXCLUDED.building_value,
        building_share_percent = EXCLUDED.building_share_percent,
        land_value = EXCLUDED.land_value,
        land_share_percent = EXCLUDED.land_share_percent,
        updated_at = NOW()
    `,
    [
      userId,
      context.quickCheck?.quick_check_id ?? null,
      workflowId,
      depreciationMode,
      priceSplitMode,
      modernization.modernizationRoof || null,
      modernization.modernizationWindows || null,
      modernization.modernizationLines || null,
      modernization.modernizationHeating || null,
      modernization.modernizationFacade || null,
      modernization.modernizationBathrooms || null,
      modernization.modernizationInterior || null,
      landReferenceValue,
      plotAreaM2,
      coOwnershipNumerator,
      coOwnershipDenominator,
      rnd.remainingUsefulLifeYears,
      rnd.afaPercent,
      split.buildingValue,
      split.buildingSharePercent,
      split.landValue,
      split.landSharePercent,
    ],
  );

  await db.query(
    `UPDATE detail_check_property_data
     SET property_category = $3, updated_at = NOW()
     WHERE user_id = $1 AND workflow_id = $2`,
    [userId, workflowId, propertyCategory],
  );

  return NextResponse.json({ status: 'OK', next: 'SANIERUNG', rnd, split });
}
