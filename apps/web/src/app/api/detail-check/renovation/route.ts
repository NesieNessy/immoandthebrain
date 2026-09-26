import {
  aggregateRenovationPricing,
  evaluateRenovationCases,
  sumSelectedCosts,
  withDefaultSelectedCosts,
  type RenovationCase,
  type RenovationFinancingMode,
} from '@/lib/detailCheck/renovation';
import { computeFinancing, computeIndividualAdditionalCosts, type InterestPeriodYears } from '@/lib/detailCheck/financing';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { loadRenovationRegionFactor } from '@/lib/server/renovationRegionFactor';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCases(value: unknown): RenovationCase[] {
  return Array.isArray(value) ? (value as RenovationCase[]) : [];
}

function normalizeFinancingMode(value: unknown): RenovationFinancingMode {
  if (value === 'EIGEN' || value === 'TEILWEISE') return value;
  return 'FREMD';
}

function interestYears(value: unknown): InterestPeriodYears {
  const parsed = Number(value);
  return parsed === 15 || parsed === 20 ? parsed : 10;
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, postal_code, year_of_construction, purchase_price FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };
  const propertyRows = await db.query(
    'SELECT postal_code, living_area_m2, year_of_construction, property_category FROM detail_check_property_data WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );
  const acquisitionRows = await db.query(
    `SELECT purchase_price, parking_purchase_price, broker_percent, notary_percent,
            land_registry_percent, property_transfer_tax_percent, total_additional_costs
     FROM detail_check_acquisition_costs
     WHERE user_id = $1 AND workflow_id = $2 LIMIT 1`,
    [userId, workflowId],
  );

  const quickCheck = quickCheckRows.rows[0];
  const property = propertyRows.rows[0];
  const acquisition = acquisitionRows.rows[0];
  const postalCode: string = property?.postal_code ?? quickCheck?.postal_code ?? '';

  return {
    quickCheck,
    postalCode,
    regionFactor: await loadRenovationRegionFactor(postalCode),
    livingAreaM2: toNumber(property?.living_area_m2 ?? 0),
    yearOfConstruction: toNumber(property?.year_of_construction ?? quickCheck?.year_of_construction ?? 0),
    propertyCategory: property?.property_category ?? 'EIGENTUMSWOHNUNG',
    purchasePrice: toNumber(acquisition?.purchase_price ?? quickCheck?.purchase_price ?? 0),
    parkingPrice: toNumber(acquisition?.parking_purchase_price ?? 0),
    additionalCosts: toNumber(acquisition?.total_additional_costs ?? 0),
    brokerPercent: toNumber(acquisition?.broker_percent ?? 3.57),
    notaryPercent: toNumber(acquisition?.notary_percent ?? 1.5),
    landRegistryPercent: toNumber(acquisition?.land_registry_percent ?? 0.5),
    propertyTransferTaxPercent: acquisition?.property_transfer_tax_percent == null
      ? null
      : toNumber(acquisition.property_transfer_tax_percent),
  };
}

async function syncFinancingRenovation(args: {
  userId: string;
  workflowId: string;
  financedAmount: number;
  previousFinancedAmount: number;
  context: Awaited<ReturnType<typeof loadContext>>;
}) {
  const { rows } = await db.query(
    'SELECT * FROM detail_check_financing WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [args.userId, args.workflowId],
  );
  const saved = rows[0];
  if (!saved) return;

  const previousOffer = toNumber(saved.offer_renovation_costs);
  const previousIndividual = toNumber(saved.individual_renovation_costs);
  const offerRenovation = previousOffer === 0
    || Math.abs(previousOffer - args.previousFinancedAmount) < 0.01
    ? args.financedAmount
    : previousOffer;
  const individualRenovation = previousIndividual === 0
    || Math.abs(previousIndividual - args.previousFinancedAmount) < 0.01
    ? args.financedAmount
    : previousIndividual;
  const repaymentRate = toNumber(saved.repayment_rate ?? 2) || 2;
  const interestAdjustmentFactor = toNumber(saved.interest_adjustment_factor ?? 1) || 1;
  const offerComputed = computeFinancing({
    purchasePrice: args.context.purchasePrice,
    parkingPrice: args.context.parkingPrice,
    additionalCosts: args.context.additionalCosts,
    renovationCosts: offerRenovation,
    equity: toNumber(saved.offer_equity),
    interestPeriodYears: interestYears(saved.offer_interest_period_years),
    repaymentRate,
    interestAdjustmentFactor,
  });
  const individualPurchasePrice = toNumber(saved.individual_purchase_price ?? args.context.purchasePrice);
  const individualParkingPrice = toNumber(saved.individual_parking_price ?? args.context.parkingPrice);
  const individualAdditionalCosts = computeIndividualAdditionalCosts({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    brokerPercent: args.context.brokerPercent,
    notaryPercent: args.context.notaryPercent,
    landRegistryPercent: args.context.landRegistryPercent,
    propertyTransferTaxPercent: args.context.propertyTransferTaxPercent,
  });
  const individualComputed = computeFinancing({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    additionalCosts: individualAdditionalCosts,
    renovationCosts: individualRenovation,
    equity: toNumber(saved.individual_equity),
    interestPeriodYears: interestYears(saved.individual_interest_period_years),
    repaymentRate,
    interestAdjustmentFactor,
  });
  const offerRate = toNumber(saved.offer_interest_rate ?? offerComputed.interestRate);
  const individualRate = toNumber(saved.individual_interest_rate ?? individualComputed.interestRate);
  const offerDebtService = Math.round(offerComputed.loanAmount * ((offerRate + repaymentRate) / 100) / 12 * 100) / 100;
  const individualDebtService = Math.round(individualComputed.loanAmount * ((individualRate + repaymentRate) / 100) / 12 * 100) / 100;

  await db.query(
    `UPDATE detail_check_financing
     SET offer_renovation_costs = $3,
         individual_renovation_costs = $4,
         offer_monthly_debt_service = $5,
         individual_monthly_debt_service = $6,
         updated_at = NOW()
     WHERE user_id = $1 AND workflow_id = $2`,
    [args.userId, args.workflowId, offerRenovation, individualRenovation, offerDebtService, individualDebtService],
  );
}

function buildResponse(saved: Record<string, unknown> | undefined, context: Awaited<ReturnType<typeof loadContext>>) {
  const savedCases = safeCases(saved?.cases);
  const evaluatedCases = savedCases.length
    ? withDefaultSelectedCosts(evaluateRenovationCases({
        cases: savedCases,
        regionFactor: context.regionFactor,
        livingAreaM2: context.livingAreaM2,
      }))
    : [];
  const aggregate = aggregateRenovationPricing(evaluatedCases);
  // Derived from the per-measure amounts rather than read back from the stored
  // pricing blob, so the total can never drift away from the parts it sums.
  const selected = sumSelectedCosts(evaluatedCases);
  const financingMode = normalizeFinancingMode(saved?.financing_mode);
  const financedAmount = saved
    ? toNumber(saved.financed_amount)
    : financingMode === 'FREMD'
      ? selected
      : 0;

  return {
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    context: {
      postalCode: context.postalCode,
      // The browser prices a newly added measure itself (see the renovation
      // page) and cannot read the factor table, so it gets the resolved value.
      regionFactor: context.regionFactor,
      livingAreaM2: context.livingAreaM2,
      yearOfConstruction: context.yearOfConstruction,
      propertyCategory: context.propertyCategory,
    },
    cases: evaluatedCases,
    pricing: {
      ...aggregate,
      sum_selected: selected,
    },
    financing: {
      mode: financingMode,
      financedAmount,
    },
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
    'SELECT * FROM detail_check_renovation WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
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
  const previousRows = await db.query(
    'SELECT financed_amount FROM detail_check_renovation WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );
  const previousFinancedAmount = toNumber(previousRows.rows[0]?.financed_amount ?? 0);
  const evaluatedCases = evaluateRenovationCases({
    cases: safeCases(input.cases),
    regionFactor: context.regionFactor,
    livingAreaM2: context.livingAreaM2,
  });
  const aggregate = aggregateRenovationPricing(evaluatedCases);
  // Per-measure amounts are authoritative and are stored as the client sent
  // them; the total is their sum. This used to run allocateSelectedRenovationCosts,
  // which recomputed every amount proportionally from the total and therefore
  // discarded any individually entered figure on every save.
  const cases = withDefaultSelectedCosts(evaluatedCases);
  const sumSelected = sumSelectedCosts(cases);
  const financingMode = normalizeFinancingMode(input.financing?.mode);
  const requestedFinanced = toNumber(input.financing?.financedAmount);
  const financedAmount = financingMode === 'FREMD'
    ? sumSelected
    : financingMode === 'TEILWEISE'
      ? Math.max(0, Math.min(sumSelected, requestedFinanced))
      : 0;
  const pricing = {
    sum_min: aggregate.sum_min,
    sum_max: aggregate.sum_max,
    sum_mid: aggregate.sum_mid,
    sum_selected: sumSelected,
  };

  await db.query(
    `
      INSERT INTO detail_check_renovation (
        user_id, quick_check_id, workflow_id, cases, pricing, financing_mode, financed_amount
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        cases = EXCLUDED.cases,
        pricing = EXCLUDED.pricing,
        financing_mode = EXCLUDED.financing_mode,
        financed_amount = EXCLUDED.financed_amount,
        updated_at = NOW()
    `,
    [
      userId,
      context.quickCheck?.quick_check_id ?? null,
      workflowId,
      JSON.stringify(cases),
      JSON.stringify(pricing),
      financingMode,
      financedAmount,
    ],
  );

  await syncFinancingRenovation({
    userId,
    workflowId,
    financedAmount,
    previousFinancedAmount,
    context,
  });

  return NextResponse.json({
    status: 'OK',
    next: 'KALKULATOR',
    cases,
    pricing,
    financing: { mode: financingMode, financedAmount },
  });
}
