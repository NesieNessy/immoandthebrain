import {
  computeFinancing,
  computeIndividualAdditionalCosts,
  type InterestPeriodYears,
} from '@/lib/detailCheck/financing';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInterestYears(value: unknown): InterestPeriodYears {
  const parsed = Number(value);
  return parsed === 15 || parsed === 20 ? parsed : 10;
}

function effectiveFinancing(
  computed: ReturnType<typeof computeFinancing>,
  interestRateValue: unknown,
  repaymentRate: number,
) {
  if (interestRateValue == null) return computed;
  const parsedRate = Number(interestRateValue);
  const interestRate = Number.isFinite(parsedRate)
    ? Math.max(0, Math.min(25, parsedRate))
    : computed.interestRate;
  return {
    ...computed,
    interestRate,
    monthlyDebtService: Math.round(
      computed.loanAmount * ((interestRate + repaymentRate) / 100) / 12 * 100,
    ) / 100,
  };
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const quickCheckRows = quickCheckId
    ? await db.query(
        'SELECT quick_check_id, purchase_price FROM quick_check WHERE user_id = $1 AND quick_check_id = $2 LIMIT 1',
        [userId, Number(quickCheckId)],
      )
    : { rows: [] };

  const acquisitionRows = await db.query(
    `
      SELECT purchase_price, parking_purchase_price, broker_percent, notary_percent,
             land_registry_percent, property_transfer_tax_percent, total_additional_costs
      FROM detail_check_acquisition_costs
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );
  const renovationRows = await db.query(
    `
      SELECT financed_amount
      FROM detail_check_renovation
      WHERE user_id = $1 AND workflow_id = $2
      LIMIT 1
    `,
    [userId, workflowId],
  );

  const acquisition = acquisitionRows.rows[0];
  const quickCheck = quickCheckRows.rows[0];
  const renovationFinancedAmount = toNumber(renovationRows.rows[0]?.financed_amount ?? 0);

  return {
    quickCheck,
    purchasePrice: toNumber(acquisition?.purchase_price ?? quickCheck?.purchase_price ?? 0),
    parkingPrice: toNumber(acquisition?.parking_purchase_price ?? 0),
    additionalCosts: toNumber(acquisition?.total_additional_costs ?? 0),
    brokerPercent: toNumber(acquisition?.broker_percent ?? 3.57),
    notaryPercent: toNumber(acquisition?.notary_percent ?? 1.5),
    landRegistryPercent: toNumber(acquisition?.land_registry_percent ?? 0.5),
    propertyTransferTaxPercent: acquisition?.property_transfer_tax_percent == null
      ? null
      : toNumber(acquisition.property_transfer_tax_percent),
    renovationFinancedAmount,
  };
}

function buildPayload(saved: Record<string, unknown> | undefined, context: Awaited<ReturnType<typeof loadContext>>) {
  const repaymentRate = toNumber(saved?.repayment_rate ?? 2) || 2;
  const interestAdjustmentFactor = toNumber(saved?.interest_adjustment_factor ?? 1) || 1;

  const offer = {
    purchasePrice: context.purchasePrice,
    parkingPrice: context.parkingPrice,
    additionalCosts: context.additionalCosts,
    renovationCosts: toNumber(saved?.offer_renovation_costs ?? context.renovationFinancedAmount),
    equity: toNumber(saved?.offer_equity ?? 0),
    interestPeriodYears: toInterestYears(saved?.offer_interest_period_years ?? 10),
  };
  const individualPurchasePrice = toNumber(saved?.individual_purchase_price ?? context.purchasePrice);
  const individualParkingPrice = toNumber(saved?.individual_parking_price ?? context.parkingPrice);
  const individualAdditionalCosts = computeIndividualAdditionalCosts({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    brokerPercent: context.brokerPercent,
    notaryPercent: context.notaryPercent,
    landRegistryPercent: context.landRegistryPercent,
    propertyTransferTaxPercent: context.propertyTransferTaxPercent,
  });
  const individual = {
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    additionalCosts: individualAdditionalCosts,
    renovationCosts: toNumber(saved?.individual_renovation_costs ?? context.renovationFinancedAmount),
    equity: toNumber(saved?.individual_equity ?? 0),
    interestPeriodYears: toInterestYears(saved?.individual_interest_period_years ?? 10),
  };
  const offerComputed = effectiveFinancing(
    computeFinancing({ ...offer, repaymentRate, interestAdjustmentFactor }),
    saved?.offer_interest_rate,
    repaymentRate,
  );
  const individualComputed = effectiveFinancing(
    computeFinancing({ ...individual, repaymentRate, interestAdjustmentFactor }),
    saved?.individual_interest_rate,
    repaymentRate,
  );

  return {
    selectedVariant: saved?.selected_variant ?? 'OFFER',
    repaymentRate,
    interestAdjustmentFactor,
    offer: {
      ...offer,
      computed: offerComputed,
    },
    individual: {
      ...individual,
      computed: individualComputed,
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
  const savedRows = await db.query(
    'SELECT * FROM detail_check_financing WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );

  return NextResponse.json({
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    ...buildPayload(savedRows.rows[0], context),
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
  const repaymentRate = toNumber(input.repaymentRate ?? 2) || 2;
  const interestAdjustmentFactor = toNumber(input.interestAdjustmentFactor ?? 1) || 1;
  const offerInterestPeriodYears = toInterestYears(input.offer?.interestPeriodYears ?? 10);
  const individualInterestPeriodYears = toInterestYears(input.individual?.interestPeriodYears ?? 10);
  const offerRenovationCosts = toNumber(input.offer?.renovationCosts);
  const offerEquity = toNumber(input.offer?.equity);
  const individualPurchasePrice = toNumber(input.individual?.purchasePrice);
  const individualParkingPrice = toNumber(input.individual?.parkingPrice);
  const individualRenovationCosts = toNumber(input.individual?.renovationCosts);
  const individualEquity = toNumber(input.individual?.equity);
  const individualAdditionalCosts = computeIndividualAdditionalCosts({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    brokerPercent: context.brokerPercent,
    notaryPercent: context.notaryPercent,
    landRegistryPercent: context.landRegistryPercent,
    propertyTransferTaxPercent: context.propertyTransferTaxPercent,
  });
  const offerComputed = effectiveFinancing(computeFinancing({
    purchasePrice: context.purchasePrice,
    parkingPrice: context.parkingPrice,
    additionalCosts: context.additionalCosts,
    renovationCosts: offerRenovationCosts,
    equity: offerEquity,
    interestPeriodYears: offerInterestPeriodYears,
    repaymentRate,
    interestAdjustmentFactor,
  }), input.offer?.interestRate, repaymentRate);
  const individualComputed = effectiveFinancing(computeFinancing({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    additionalCosts: individualAdditionalCosts,
    renovationCosts: individualRenovationCosts,
    equity: individualEquity,
    interestPeriodYears: individualInterestPeriodYears,
    repaymentRate,
    interestAdjustmentFactor,
  }), input.individual?.interestRate, repaymentRate);

  await db.query(
    `
      INSERT INTO detail_check_financing (
        user_id, quick_check_id, workflow_id, selected_variant,
        offer_renovation_costs, offer_equity, offer_interest_period_years,
        offer_interest_rate, offer_monthly_debt_service,
        individual_purchase_price, individual_parking_price, individual_renovation_costs,
        individual_equity, individual_interest_period_years, individual_interest_rate,
        individual_monthly_debt_service, repayment_rate, interest_adjustment_factor
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        selected_variant = EXCLUDED.selected_variant,
        offer_renovation_costs = EXCLUDED.offer_renovation_costs,
        offer_equity = EXCLUDED.offer_equity,
        offer_interest_period_years = EXCLUDED.offer_interest_period_years,
        offer_interest_rate = EXCLUDED.offer_interest_rate,
        offer_monthly_debt_service = EXCLUDED.offer_monthly_debt_service,
        individual_purchase_price = EXCLUDED.individual_purchase_price,
        individual_parking_price = EXCLUDED.individual_parking_price,
        individual_renovation_costs = EXCLUDED.individual_renovation_costs,
        individual_equity = EXCLUDED.individual_equity,
        individual_interest_period_years = EXCLUDED.individual_interest_period_years,
        individual_interest_rate = EXCLUDED.individual_interest_rate,
        individual_monthly_debt_service = EXCLUDED.individual_monthly_debt_service,
        repayment_rate = EXCLUDED.repayment_rate,
        interest_adjustment_factor = EXCLUDED.interest_adjustment_factor,
        updated_at = NOW()
    `,
    [
      userId,
      context.quickCheck?.quick_check_id ?? null,
      workflowId,
      input.selectedVariant === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'OFFER',
      offerRenovationCosts,
      offerEquity,
      offerInterestPeriodYears,
      offerComputed.interestRate,
      offerComputed.monthlyDebtService,
      individualPurchasePrice,
      individualParkingPrice,
      individualRenovationCosts,
      individualEquity,
      individualInterestPeriodYears,
      individualComputed.interestRate,
      individualComputed.monthlyDebtService,
      repaymentRate,
      interestAdjustmentFactor,
    ],
  );

  return NextResponse.json({
    status: 'OK',
    next: 'ABSCHREIBUNG',
    offer: offerComputed,
    individual: individualComputed,
  });
}
