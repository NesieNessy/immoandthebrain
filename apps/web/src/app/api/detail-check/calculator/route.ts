import {
  normalizeYyyymm,
  runRentCalculator,
  type CalculatorParams,
  type RentIncreasePlanRow,
} from '@/lib/detailCheck/rentCalculator';
import { computeIndividualAdditionalCosts, computeFinancing } from '@/lib/detailCheck/financing';
import { estimateRentIndexPerM2 } from '@/lib/detailCheck/rentIndex';
import { roundCurrency } from '@/lib/detailCheck/acquisitionCosts';
import {
  clampInterestRate,
  normalizeLast558RentBefore,
  normalizeRecentMonth,
  normalizeRentIncreaseIntervalMonths,
  normalizeRentIncreaseUtilizationPercent,
  normalizeRentIndexGrowthPercent,
  normalizeTaxRate,
  normalizeViewPeriodYears,
  recomputeMonthlyDebtService,
  safeCases,
  toInterestYears,
  toMode,
  toNumber,
  toPlacementMode,
} from '@/lib/detailCheck/calculatorParamNormalization';
import { calculatorContextFingerprint } from '@/lib/detailCheck/calculatorContextFingerprint';
import { requireUserId, resolveWorkflowId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function loadRentIncreasePlan(userId: string, workflowId: string): Promise<RentIncreasePlanRow[]> {
  const rows = await db.query(
    `
      SELECT rent_increase_id, legal_basis, source_type, source_id,
             sequence_number, effective_yyyymm, monthly_amount
      FROM detail_check_rent_increases
      WHERE user_id = $1 AND workflow_id = $2
      ORDER BY legal_basis, sequence_number
    `,
    [userId, workflowId],
  );
  return rows.rows.map((row) => ({
    id: String(row.rent_increase_id),
    legalBasis: row.legal_basis === '559' ? '559' : '558',
    sourceType: row.source_type === 'RENOVATION' || row.source_type === 'MANUAL' ? row.source_type : 'RENT_INDEX',
    sourceId: row.source_id == null ? null : String(row.source_id),
    sequenceNumber: Number(row.sequence_number),
    effectiveYyyymm: String(row.effective_yyyymm),
    monthlyAmount: toNumber(row.monthly_amount),
  }));
}

type CalculatorResult = ReturnType<typeof runRentCalculator>;

function rentIncreasePlanNeedsSync(plan: RentIncreasePlanRow[], result: CalculatorResult): boolean {
  const stored558 = plan.filter((item) => item.legalBasis === '558').sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const stored559 = plan.filter((item) => item.legalBasis === '559').sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (stored558.length !== result.increases558.length || stored559.length !== result.modernizationPlan.length) return true;
  const changed558 = result.increases558.some((item, index) => {
    const stored = stored558[index];
    return !stored
      || stored.effectiveYyyymm !== item.effectiveYyyymm
      || stored.sourceType !== item.sourceType
      || Math.abs(stored.monthlyAmount - item.monthlyDelta) > 0.009;
  });
  if (changed558) return true;
  return result.modernizationPlan.some((item, index) => {
    const stored = stored559[index];
    return !stored
      || stored.sourceId !== item.id
      || stored.effectiveYyyymm !== item.effectiveYyyymm
      || Math.abs(stored.monthlyAmount - item.monthlyDelta) > 0.009;
  });
}

async function syncRentIncreasePlan(
  userId: string,
  workflowId: string,
  result: CalculatorResult,
): Promise<RentIncreasePlanRow[]> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existingRows = await client.query(
      `
        SELECT rent_increase_id, legal_basis, source_id, sequence_number
        FROM detail_check_rent_increases
        WHERE user_id = $1 AND workflow_id = $2
      `,
      [userId, workflowId],
    );
    const existing558 = new Map<number, string>();
    const existing559 = new Map<string, string>();
    for (const row of existingRows.rows) {
      if (row.legal_basis === '558') existing558.set(Number(row.sequence_number), String(row.rent_increase_id));
      if (row.legal_basis === '559' && row.source_id != null) existing559.set(String(row.source_id), String(row.rent_increase_id));
    }

    await client.query(
      `UPDATE detail_check_rent_increases
       SET sequence_number = sequence_number + 10000
       WHERE user_id = $1 AND workflow_id = $2`,
      [userId, workflowId],
    );

    const retainedIds: string[] = [];
    for (const [index, increase] of result.increases558.entries()) {
      const sequence = index + 1;
      const existingId = existing558.get(sequence);
      if (existingId) {
        await client.query(
          `
            UPDATE detail_check_rent_increases
            SET legal_basis = '558', source_type = $1, source_id = NULL,
                sequence_number = $2, effective_yyyymm = $3, monthly_amount = $4
            WHERE rent_increase_id = $5 AND user_id = $6 AND workflow_id = $7
          `,
          [increase.sourceType, sequence, increase.effectiveYyyymm, increase.monthlyDelta, existingId, userId, workflowId],
        );
        retainedIds.push(existingId);
      } else {
        const inserted = await client.query(
          `
            INSERT INTO detail_check_rent_increases (
              user_id, workflow_id, legal_basis, source_type, source_id,
              sequence_number, effective_yyyymm, monthly_amount
            ) VALUES ($1,$2,'558',$3,NULL,$4,$5,$6)
            RETURNING rent_increase_id
          `,
          [userId, workflowId, increase.sourceType, sequence, increase.effectiveYyyymm, increase.monthlyDelta],
        );
        retainedIds.push(String(inserted.rows[0].rent_increase_id));
      }
    }

    for (const [index, increase] of result.modernizationPlan.entries()) {
      const sequence = index + 1;
      const existingId = existing559.get(increase.id);
      if (existingId) {
        await client.query(
          `
            UPDATE detail_check_rent_increases
            SET legal_basis = '559', source_type = 'RENOVATION', source_id = $1,
                sequence_number = $2, effective_yyyymm = $3, monthly_amount = $4
            WHERE rent_increase_id = $5 AND user_id = $6 AND workflow_id = $7
          `,
          [increase.id, sequence, increase.effectiveYyyymm, increase.monthlyDelta, existingId, userId, workflowId],
        );
        retainedIds.push(existingId);
      } else {
        const inserted = await client.query(
          `
            INSERT INTO detail_check_rent_increases (
              user_id, workflow_id, legal_basis, source_type, source_id,
              sequence_number, effective_yyyymm, monthly_amount
            ) VALUES ($1,$2,'559','RENOVATION',$3,$4,$5,$6)
            RETURNING rent_increase_id
          `,
          [userId, workflowId, increase.id, sequence, increase.effectiveYyyymm, increase.monthlyDelta],
        );
        retainedIds.push(String(inserted.rows[0].rent_increase_id));
      }
    }

    if (retainedIds.length === 0) {
      await client.query(
        'DELETE FROM detail_check_rent_increases WHERE user_id = $1 AND workflow_id = $2',
        [userId, workflowId],
      );
    } else {
      await client.query(
        `DELETE FROM detail_check_rent_increases
         WHERE user_id = $1 AND workflow_id = $2
           AND NOT (rent_increase_id = ANY($3::bigint[]))`,
        [userId, workflowId, retainedIds],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return loadRentIncreasePlan(userId, workflowId);
}

function resultForStorage(result: CalculatorResult, contextFingerprint: string) {
  const storedParams = { ...result.params };
  delete storedParams.rentIncreasePlan;
  delete storedParams.rentIncreaseOverrides;
  // Stored alongside the result so a later GET can tell whether the upstream
  // values these overrides were computed against have actually moved.
  return { ...result, params: storedParams, contextFingerprint };
}

async function loadContext(userId: string, workflowId: string, quickCheckId: string | null) {
  const contextRows = await db.query(
    `
      SELECT
        (
          SELECT row_to_json(item)
          FROM (
            SELECT quick_check_id, purchase_price, city, postal_code, cold_rent, year_of_construction
            FROM quick_check
            WHERE user_id = $1 AND quick_check_id = $3
            LIMIT 1
          ) item
        ) AS quick_check,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT city, postal_code, living_area_m2, year_of_construction, updated_at
            FROM detail_check_property_data
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS property,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT valuation_date, cold_rent, service_charges_allocable, service_charges_non_allocable, updated_at
            FROM detail_check_rental
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS rental,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT *
            FROM detail_check_financing
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS financing,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT cases, financed_amount, updated_at
            FROM detail_check_renovation
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS renovation,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT purchase_price, parking_purchase_price, total_additional_costs,
                   broker_percent, notary_percent, land_registry_percent,
                   property_transfer_tax_percent, updated_at
            FROM detail_check_acquisition_costs
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS acquisition,
        (
          SELECT row_to_json(item)
          FROM (
            SELECT building_value, afa_percent, updated_at
            FROM detail_check_depreciation
            WHERE user_id = $1 AND workflow_id = $2
            LIMIT 1
          ) item
        ) AS depreciation
    `,
    [userId, workflowId, quickCheckId ? Number(quickCheckId) : null],
  );

  const context = contextRows.rows[0] ?? {};
  const quickCheck = context.quick_check;
  const property = context.property;
  const rental = context.rental;
  const financing = context.financing;
  const renovation = context.renovation;
  const acquisition = context.acquisition;
  const depreciation = context.depreciation;
  const purchasePrice = toNumber(acquisition?.purchase_price ?? quickCheck?.purchase_price ?? 0);
  const parkingPrice = toNumber(acquisition?.parking_purchase_price ?? 0);
  const additionalCosts = toNumber(acquisition?.total_additional_costs ?? 0);
  const renovationCases = safeCases(renovation?.cases);
  const renovationFinancedAmount = toNumber(renovation?.financed_amount ?? 0);
  const selectedVariant = financing?.selected_variant === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'OFFER';
  const individualPurchasePrice = toNumber(financing?.individual_purchase_price ?? purchasePrice);
  const individualParkingPrice = toNumber(financing?.individual_parking_price ?? parkingPrice);
  const individualAdditionalCosts = computeIndividualAdditionalCosts({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    brokerPercent: toNumber(acquisition?.broker_percent ?? 3.57),
    notaryPercent: toNumber(acquisition?.notary_percent ?? 1.5),
    landRegistryPercent: toNumber(acquisition?.land_registry_percent ?? 0.5),
    propertyTransferTaxPercent: acquisition?.property_transfer_tax_percent == null
      ? null
      : toNumber(acquisition.property_transfer_tax_percent),
  });
  const offerFinancing = computeFinancing({
    purchasePrice,
    parkingPrice,
    additionalCosts,
    renovationCosts: toNumber(financing?.offer_renovation_costs ?? renovationFinancedAmount),
    equity: toNumber(financing?.offer_equity ?? 0),
    interestPeriodYears: toInterestYears(financing?.offer_interest_period_years),
    repaymentRate: toNumber(financing?.repayment_rate ?? 2) || 2,
    interestAdjustmentFactor: toNumber(financing?.interest_adjustment_factor ?? 1) || 1,
  });
  const individualFinancing = computeFinancing({
    purchasePrice: individualPurchasePrice,
    parkingPrice: individualParkingPrice,
    additionalCosts: individualAdditionalCosts,
    renovationCosts: toNumber(financing?.individual_renovation_costs ?? renovationFinancedAmount),
    equity: toNumber(financing?.individual_equity ?? 0),
    interestPeriodYears: toInterestYears(financing?.individual_interest_period_years),
    repaymentRate: toNumber(financing?.repayment_rate ?? 2) || 2,
    interestAdjustmentFactor: toNumber(financing?.interest_adjustment_factor ?? 1) || 1,
  });
  const selectedFinancing = selectedVariant === 'INDIVIDUAL' ? individualFinancing : offerFinancing;
  const selectedRenovationFinancedAmount = selectedVariant === 'INDIVIDUAL'
    ? toNumber(financing?.individual_renovation_costs ?? renovationFinancedAmount)
    : toNumber(financing?.offer_renovation_costs ?? renovationFinancedAmount);
  const selectedEquity = selectedVariant === 'INDIVIDUAL'
    ? toNumber(financing?.individual_equity ?? 0)
    : toNumber(financing?.offer_equity ?? 0);
  const buildingValue = toNumber(depreciation?.building_value ?? 0);
  const afaPercent = toNumber(depreciation?.afa_percent ?? 0);
  const propertyYear = toNumber(property?.year_of_construction ?? quickCheck?.year_of_construction ?? new Date().getFullYear());
  const livingAreaM2 = toNumber(property?.living_area_m2 ?? 0);
  const serviceChargesAllocable = toNumber(rental?.service_charges_allocable ?? 0);
  const serviceChargesNonAllocable = toNumber(rental?.service_charges_non_allocable ?? 0);
  const upstream = {
    city: property?.city ?? quickCheck?.city ?? '',
    postalCode: property?.postal_code ?? quickCheck?.postal_code ?? '',
    livingAreaM2,
    yearOfConstruction: propertyYear,
    valuationDate: rental?.valuation_date ?? null,
    coldRent: toNumber(rental?.cold_rent ?? quickCheck?.cold_rent ?? 0),
    serviceChargesAllocable,
    serviceChargesNonAllocable,
    selectedVariant,
    monthlyDebtService: toNumber(financing?.[selectedVariant === 'INDIVIDUAL' ? 'individual_monthly_debt_service' : 'offer_monthly_debt_service']) || selectedFinancing.monthlyDebtService,
    loanAmount: selectedFinancing.loanAmount,
    interestRate: toNumber(financing?.[selectedVariant === 'INDIVIDUAL' ? 'individual_interest_rate' : 'offer_interest_rate']) || selectedFinancing.interestRate,
    individualLoanAmount: individualFinancing.loanAmount,
    repaymentRate: toNumber(financing?.repayment_rate ?? 2) || 2,
    interestPeriodYears: toInterestYears(financing?.[selectedVariant === 'INDIVIDUAL' ? 'individual_interest_period_years' : 'offer_interest_period_years']),
    equityAmount: selectedEquity,
    monthlyAfa: buildingValue > 0 && afaPercent > 0 ? roundCurrency((buildingValue * (afaPercent / 100)) / 12) : 0,
    purchasePrice,
    totalInvestment: roundCurrency(selectedFinancing.totalCosts),
    renovationFinancedAmount: selectedRenovationFinancedAmount,
    renovationCases,
  };
  // Derived from the values above rather than from `updated_at`: the wizard
  // steps re-save unconditionally when left, so a timestamp says only "the
  // row was written", never "a number the calculator uses actually moved".
  return { quickCheck, ...upstream, contextFingerprint: calculatorContextFingerprint(upstream) };
}

function buildParams(
  saved: Record<string, unknown> | undefined,
  context: Awaited<ReturnType<typeof loadContext>>,
  rentIncreasePlan: RentIncreasePlanRow[],
): { params: CalculatorParams; overridesResetByUpstreamChange: boolean } {
  const fallbackStart = new Date().toISOString().slice(0, 7);
  const livingAreaM2 = context.livingAreaM2;
  const rentStart = context.coldRent;
  const last558Date = normalizeRecentMonth(saved?.last_558_date, 1);
  const savedFingerprint = typeof (saved?.result as Record<string, unknown> | undefined)?.contextFingerprint === 'string'
    ? String((saved!.result as Record<string, unknown>).contextFingerprint)
    : null;
  // Rows saved before fingerprints existed carry none. Those are treated as
  // unchanged rather than reset: the timestamp rule this replaces discarded
  // overrides on almost every visit, so "keep what the user made" is by far
  // the safer default, and the very next save writes a fingerprint and the
  // row self-heals.
  const upstreamIsNewer = savedFingerprint !== null && savedFingerprint !== context.contextFingerprint;
  const fallbackRentIndex = estimateRentIndexPerM2(context.yearOfConstruction, livingAreaM2)
    ?? (livingAreaM2 > 0 && rentStart > 0 ? (rentStart / livingAreaM2) * 1.02 : null);
  const savedResult = (saved?.result as Record<string, unknown> | undefined) ?? {};
  const savedParams = (savedResult.params as Record<string, unknown> | undefined) ?? {};
  const savedModernizationPlan = Array.isArray(savedResult.modernizationPlan)
    ? savedResult.modernizationPlan as Array<Record<string, unknown>>
    : [];
  const savedPlanPlacements = Object.fromEntries(
    savedModernizationPlan.flatMap((item) => (
      typeof item.id === 'string' && typeof item.effectiveYyyymm === 'string'
        ? [[item.id, item.effectiveYyyymm]]
        : []
    )),
  );
  const savedFinancingInterestRate = upstreamIsNewer || savedParams.financingInterestRateOverride == null
    ? context.interestRate
    : clampInterestRate(toNumber(savedParams.financingInterestRateOverride));
  const savedRefinancingInterestRate = upstreamIsNewer || savedParams.interestRateOverride == null
    ? context.interestRate
    : clampInterestRate(toNumber(savedParams.interestRateOverride));
  const monthlyDebtService = upstreamIsNewer || savedParams.financingInterestRateOverride == null
    ? context.monthlyDebtService
    : recomputeMonthlyDebtService(context.loanAmount, savedFinancingInterestRate, context.repaymentRate);
  // Whether this load actually dropped a previously-saved manual override
  // because upstream data (Objektdaten/Finanzierung/etc.) changed more
  // recently than the calculator was last saved — surfaced to the client so
  // it can tell the user, instead of the override just silently vanishing.
  const overridesResetByUpstreamChange = upstreamIsNewer && (
    savedParams.financingInterestRateOverride != null
    || savedParams.interestRateOverride != null
    || (savedParams.modernizationPlacements != null && Object.keys(savedParams.modernizationPlacements as object).length > 0)
    || Object.keys(savedPlanPlacements).length > 0
    || (savedParams.modernizationCostOverrides != null && Object.keys(savedParams.modernizationCostOverrides as object).length > 0)
    || (savedParams.renovationTimingOverrides != null && Object.keys(savedParams.renovationTimingOverrides as object).length > 0)
    || (savedParams.rentIncreaseOverrides != null && Object.keys(savedParams.rentIncreaseOverrides as object).length > 0)
    || (Array.isArray(savedParams.excludedModernizationIds) && savedParams.excludedModernizationIds.length > 0)
  );

  return {
    params: {
    startYyyymm: normalizeYyyymm(saved?.start_yyyymm as string | undefined, fallbackStart),
    rentStartYyyymm: normalizeYyyymm(context.valuationDate, fallbackStart),
    monthlyRentStart: rentStart,
    livingAreaM2,
    yearOfConstruction: context.yearOfConstruction,
    city: context.city,
    postalCode: context.postalCode,
    last558Date,
    last558RentBefore: normalizeLast558RentBefore(savedParams.last558RentBefore, last558Date),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(savedParams.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(savedParams.viewPeriodYears),
    last559Date: normalizeRecentMonth(saved?.last_559_date, 5),
    last559MonthlyDelta: Math.max(0, toNumber(savedParams.last559MonthlyDelta)),
    rentIncreaseIntervalMonths: normalizeRentIncreaseIntervalMonths(savedParams.rentIncreaseIntervalMonths),
    rentIncreaseUtilizationPercent: normalizeRentIncreaseUtilizationPercent(savedParams.rentIncreaseUtilizationPercent),
    rentIndexPerM2: saved?.rent_index_per_m2 == null ? fallbackRentIndex : toNumber(saved.rent_index_per_m2),
    rentIndexSource: saved?.rent_index_per_m2 == null ? 'AUTOMATIC' : 'MANUAL',
    monthlyDebtService,
    loanAmount: context.loanAmount,
    interestRate: savedFinancingInterestRate,
    repaymentRate: context.repaymentRate,
    monthlyAfa: context.monthlyAfa,
    serviceChargesAllocable: context.serviceChargesAllocable,
    serviceChargesNonAllocable: context.serviceChargesNonAllocable,
    purchasePrice: context.purchasePrice,
    totalInvestment: context.totalInvestment,
    renovationFinancedAmount: context.renovationFinancedAmount,
    excludedModernizationIds: upstreamIsNewer
      ? []
      : (Array.isArray(savedParams.excludedModernizationIds)
        ? savedParams.excludedModernizationIds.filter((id): id is string => typeof id === 'string')
        : []),
    taxRate: normalizeTaxRate(savedParams.taxRate),
    taxableLossesOffsettable: savedParams.taxableLossesOffsettable === true,
    equityAmount: context.equityAmount,
    equityIncluded: savedParams.equityIncluded === true,
    financingInterestRateOverride: upstreamIsNewer || savedParams.financingInterestRateOverride == null ? null : savedFinancingInterestRate,
    interestRateOverride: upstreamIsNewer || savedParams.interestRateOverride == null ? null : savedRefinancingInterestRate,
    interestPeriodYears: context.interestPeriodYears,
    refinancingInterestRate: savedParams.refinancingInterestRate == null ? savedRefinancingInterestRate : toNumber(savedParams.refinancingInterestRate),
    modernizationPlacements: upstreamIsNewer ? undefined : ((savedParams.modernizationPlacements as Record<string, string> | undefined)
      ?? (Object.keys(savedPlanPlacements).length > 0 ? savedPlanPlacements : undefined)),
    modernizationCostOverrides: upstreamIsNewer ? undefined : (savedParams.modernizationCostOverrides as Record<string, number> | undefined) ?? undefined,
    renovationTimingOverrides: upstreamIsNewer ? undefined : (savedParams.renovationTimingOverrides as CalculatorParams['renovationTimingOverrides']) ?? undefined,
    rentIncreasePlan,
    rentIncreaseOverrides: rentIncreasePlan.length > 0 || upstreamIsNewer
      ? undefined
      : (savedParams.rentIncreaseOverrides as Record<string, { effectiveYyyymm?: string; monthlyDelta?: number }> | undefined) ?? undefined,
    mode: toMode(saved?.mode),
    placementMode: toPlacementMode(savedResult.placementMode),
    },
    overridesResetByUpstreamChange,
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
    'SELECT * FROM detail_check_rent_calculator WHERE user_id = $1 AND workflow_id = $2 LIMIT 1',
    [userId, workflowId],
  );
  let rentIncreasePlan = await loadRentIncreasePlan(userId, workflowId);
  const built = buildParams(savedRows.rows[0], context, rentIncreasePlan);
  let params = built.params;
  let result = runRentCalculator(params, context.renovationCases);
  if (rentIncreasePlanNeedsSync(rentIncreasePlan, result)) {
    rentIncreasePlan = await syncRentIncreasePlan(userId, workflowId, result);
    params = { ...params, rentIncreasePlan, rentIncreaseOverrides: undefined };
    result = runRentCalculator(params, context.renovationCases);
  }

  return NextResponse.json({
    workflowId,
    quickCheckId: context.quickCheck?.quick_check_id ?? null,
    selectedFinancingVariant: context.selectedVariant,
    renovationCases: context.renovationCases,
    overridesResetByUpstreamChange: built.overridesResetByUpstreamChange,
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
  const storedRentIncreasePlan = await loadRentIncreasePlan(userId, workflowId);
  const resetRentIncreasePlan = input.optimize === true || input.resetRentIncreasePlan === true;
  const savedResult = input.optimize === true ? 'OPTIMIZED' : 'DEFAULT';
  const requestedInterestRate = input.interestRateOverride == null ? null : toNumber(input.interestRateOverride);
  const requestedFinancingInterestRate = input.financingInterestRateOverride == null
    ? null
    : toNumber(input.financingInterestRateOverride);
  const interestRate = requestedFinancingInterestRate == null
    ? context.interestRate
    : clampInterestRate(requestedFinancingInterestRate);
  const refinancingInterestRate = requestedInterestRate == null
    ? context.interestRate
    : clampInterestRate(requestedInterestRate);
  const monthlyDebtService = requestedFinancingInterestRate == null
    ? context.monthlyDebtService
    : recomputeMonthlyDebtService(context.loanAmount, interestRate, context.repaymentRate);
  const last558Date = normalizeRecentMonth(input.last558Date, 1);
  let params: CalculatorParams = {
    startYyyymm: normalizeYyyymm(input.startYyyymm, new Date().toISOString().slice(0, 7)),
    rentStartYyyymm: normalizeYyyymm(context.valuationDate, new Date().toISOString().slice(0, 7)),
    monthlyRentStart: context.coldRent,
    livingAreaM2: context.livingAreaM2,
    yearOfConstruction: context.yearOfConstruction,
    city: context.city,
    postalCode: context.postalCode,
    last558Date,
    last558RentBefore: normalizeLast558RentBefore(input.last558RentBefore, last558Date),
    rentIndexGrowthPercent: normalizeRentIndexGrowthPercent(input.rentIndexGrowthPercent),
    viewPeriodYears: normalizeViewPeriodYears(input.viewPeriodYears),
    last559Date: normalizeRecentMonth(input.last559Date, 5),
    last559MonthlyDelta: normalizeRecentMonth(input.last559Date, 5) ? Math.max(0, toNumber(input.last559MonthlyDelta)) : 0,
    rentIncreaseIntervalMonths: normalizeRentIncreaseIntervalMonths(input.rentIncreaseIntervalMonths),
    rentIncreaseUtilizationPercent: normalizeRentIncreaseUtilizationPercent(input.rentIncreaseUtilizationPercent),
    rentIndexPerM2: input.rentIndexSource !== 'MANUAL' || input.rentIndexPerM2 == null || input.rentIndexPerM2 === ''
      ? estimateRentIndexPerM2(context.yearOfConstruction, context.livingAreaM2)
      : toNumber(input.rentIndexPerM2),
    rentIndexSource: input.rentIndexSource === 'MANUAL' && input.rentIndexPerM2 != null && input.rentIndexPerM2 !== ''
      ? 'MANUAL'
      : 'AUTOMATIC',
    monthlyDebtService,
    loanAmount: context.loanAmount,
    interestRate,
    repaymentRate: context.repaymentRate,
    interestPeriodYears: context.interestPeriodYears,
    monthlyAfa: context.monthlyAfa,
    serviceChargesAllocable: context.serviceChargesAllocable,
    serviceChargesNonAllocable: context.serviceChargesNonAllocable,
    purchasePrice: context.purchasePrice,
    totalInvestment: context.totalInvestment,
    renovationFinancedAmount: context.renovationFinancedAmount,
    excludedModernizationIds: Array.isArray(input.excludedModernizationIds)
      ? input.excludedModernizationIds.filter((id: unknown): id is string => typeof id === 'string')
      : [],
    taxRate: normalizeTaxRate(input.taxRate),
    taxableLossesOffsettable: input.taxableLossesOffsettable === true,
    equityAmount: context.equityAmount,
    equityIncluded: input.equityIncluded === true,
    financingInterestRateOverride: requestedFinancingInterestRate,
    interestRateOverride: requestedInterestRate,
    refinancingInterestRate,
    modernizationPlacements: input.optimize !== true && input.modernizationPlacements && typeof input.modernizationPlacements === 'object'
      ? input.modernizationPlacements as Record<string, string>
      : undefined,
    modernizationCostOverrides: input.modernizationCostOverrides && typeof input.modernizationCostOverrides === 'object'
      ? input.modernizationCostOverrides as Record<string, number>
      : undefined,
    renovationTimingOverrides: input.renovationTimingOverrides && typeof input.renovationTimingOverrides === 'object'
      ? input.renovationTimingOverrides as CalculatorParams['renovationTimingOverrides']
      : undefined,
    rentIncreasePlan: resetRentIncreasePlan ? undefined : storedRentIncreasePlan,
    rentIncreaseOverrides: input.optimize !== true && input.rentIncreaseOverrides && typeof input.rentIncreaseOverrides === 'object'
      ? input.rentIncreaseOverrides as Record<string, { effectiveYyyymm?: string; monthlyDelta?: number }>
      : undefined,
    mode: toMode(input.mode),
    placementMode: savedResult,
  };

  let result = runRentCalculator(params, context.renovationCases);
  const rentIncreasePlan = await syncRentIncreasePlan(userId, workflowId, result);
  params = { ...params, rentIncreasePlan, rentIncreaseOverrides: undefined };
  result = runRentCalculator(params, context.renovationCases);

  await db.query(
    `
      INSERT INTO detail_check_rent_calculator (
        user_id, quick_check_id, workflow_id, start_yyyymm, monthly_rent_start,
        rent_index_per_m2, last_558_date, last_559_date, mode, result
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id, workflow_id) DO UPDATE SET
        quick_check_id = EXCLUDED.quick_check_id,
        start_yyyymm = EXCLUDED.start_yyyymm,
        monthly_rent_start = EXCLUDED.monthly_rent_start,
        rent_index_per_m2 = EXCLUDED.rent_index_per_m2,
        last_558_date = EXCLUDED.last_558_date,
        last_559_date = EXCLUDED.last_559_date,
        mode = EXCLUDED.mode,
        result = EXCLUDED.result,
        updated_at = NOW()
    `,
    [
      userId,
      context.quickCheck?.quick_check_id ?? null,
      workflowId,
      params.startYyyymm,
      params.monthlyRentStart,
      params.rentIndexPerM2,
      params.last558Date,
      params.last559Date,
      params.mode,
      JSON.stringify(resultForStorage(result, context.contextFingerprint)),
    ],
  );

  if (input.apply === true) {
    const appliedCases = context.renovationCases.map((item) => ({
      ...item,
      ...(params.modernizationPlacements?.[item.id]
        ? { calculator_effective_yyyymm: params.modernizationPlacements[item.id] }
        : {}),
      ...(params.modernizationCostOverrides?.[item.id] != null
        ? { cost_selected: params.modernizationCostOverrides[item.id] }
        : {}),
      ...(params.renovationTimingOverrides?.[item.id]
        ? { zeitpunkt: params.renovationTimingOverrides[item.id] }
        : {}),
    }));
    await db.query(
      'UPDATE detail_check_renovation SET cases = $1, updated_at = NOW() WHERE user_id = $2 AND workflow_id = $3',
      [JSON.stringify(appliedCases), userId, workflowId],
    );
    const individualMonthlyDebtService = roundCurrency(
      context.individualLoanAmount * ((params.interestRate + context.repaymentRate) / 100) / 12,
    );
    await db.query(
      `
        UPDATE detail_check_financing
        SET individual_interest_rate = $1,
            individual_monthly_debt_service = $2,
            updated_at = NOW()
        WHERE user_id = $3 AND workflow_id = $4
      `,
      [params.interestRate, individualMonthlyDebtService, userId, workflowId],
    );
    if (context.selectedVariant === 'OFFER') {
      await db.query(
        `
          UPDATE detail_check_financing
          SET offer_interest_rate = $1,
              offer_monthly_debt_service = $2,
              updated_at = NOW()
          WHERE user_id = $3 AND workflow_id = $4
        `,
        [params.interestRate, params.monthlyDebtService, userId, workflowId],
      );
    }
    // Applying writes the user's own overrides back into the upstream tables,
    // so the context legitimately differs from the fingerprint stored moments
    // ago. Re-derive it from the post-apply state, otherwise the very next GET
    // would compare against the pre-apply snapshot, see a difference, and
    // discard the overrides the user just chose to apply.
    const appliedContext = await loadContext(userId, workflowId, quickCheckId);
    await db.query(
      `
        UPDATE detail_check_rent_calculator
        SET result = jsonb_set(result::jsonb, '{contextFingerprint}', to_jsonb($1::text)),
            updated_at = NOW()
        WHERE user_id = $2 AND workflow_id = $3
      `,
      [appliedContext.contextFingerprint, userId, workflowId],
    );
  }

  return NextResponse.json({
    status: 'OK',
    next: 'MAKROLAGE',
    selectedFinancingVariant: context.selectedVariant,
    renovationCases: context.renovationCases,
    ...result,
  });
}
