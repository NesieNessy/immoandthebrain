import { categoryLabel } from '@/lib/renovation/catalog';
import { computeIndividualAdditionalCosts, computeFinancing, type InterestPeriodYears } from './financing';
import type { RenovationCase } from './renovation';

/**
 * "In Bestandsobjekte übernehmen": what a Detailbewertung becomes on the
 * Bestandsobjekt, step by step. Pure — the API route
 * (app/api/detail-checks/takeover) loads the saved steps, turns them into this
 * plan and writes it in one transaction.
 *
 *   Objektdaten      → property (+ Bundesland, Straße/Hausnummer split)
 *   Kaufkosten       → acquisition_costs (all percentages and amounts)
 *   Vermietung       → default unit "Gesamtes Objekt" with its Soll-Mieten,
 *                      and the uploaded Nebenkostenabrechnung → a
 *                      Nebenkostenabrechnung of that unit
 *   Finanzierung     → property_financials (the variant chosen in the step)
 *   Restnutzungsdauer→ property_rnd + property_price_split
 *   Sanierung        → Handwerkerleistungen (one Maßnahme per selected case)
 */

type Row = Record<string, unknown>;

export interface DetailCheckSnapshot {
  propertyData: Row;
  acquisition: Row | null;
  rental: Row | null;
  financing: Row | null;
  depreciation: Row | null;
  renovationCases: RenovationCase[];
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = num(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

/**
 * Splits Objektdaten's single "Straße + Hausnummer" field into the two fields
 * a Bestandsobjekt has: "Musterstraße 12a" → "Musterstraße" + "12a". Without a
 * recognisable number at the end everything stays in the street.
 */
export function splitStreetAndHouseNumber(value: string | null | undefined): { street: string; houseNumber: string | null } {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  const match = /^(.*?\S)[\s,]+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?)$/.exec(text);
  if (!match) return { street: text, houseNumber: null };
  // property.house_number is VARCHAR(10).
  return { street: match[1], houseNumber: match[2].replace(/\s+/g, '').slice(0, 10) };
}

/**
 * The billing period an uploaded Nebenkostenabrechnung most likely covers:
 * the calendar year before the valuation date ("die letzte Abrechnung"). It
 * can be corrected on the Nebenkostenabrechnung page — changing the period
 * of a saved settlement updates it in place.
 */
export function settlementPeriodFor(valuationDate: string | Date | null | undefined, today: Date = new Date()): { start: string; end: string } {
  const parsed = valuationDate ? new Date(valuationDate) : today;
  const year = (Number.isNaN(parsed.getTime()) ? today : parsed).getFullYear() - 1;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export interface TakeoverPlan {
  property: {
    street: string;
    houseNumber: string | null;
    postalCode: string | null;
    city: string;
    squareMeters: number | null;
    yearOfConstruction: number | null;
    energyEfficient: string | null;
    propertyCategory: string | null;
  };
  parkingSpaces: number;
  acquisitionCosts: {
    purchasePrice: number;
    pricePerSqm: number | null;
    brokerPercent: number | null;
    brokerValue: number | null;
    notaryPercent: number | null;
    notaryValue: number | null;
    landRegistryPercent: number | null;
    landRegistryValue: number | null;
    transferTaxPercent: number | null;
    transferTaxValue: number | null;
    totalAncillaryPercent: number | null;
    totalAncillaryValue: number | null;
    parkingPurchasePrice: number | null;
  } | null;
  unit: {
    usageType: 'WOHNUNG' | 'GEWERBEFLAECHE';
    livingAreaM2: number | null;
    yearOfConstruction: number | null;
    energyEfficient: string | null;
    numberOfParkingSpaces: number;
    targetColdRent: number | null;
    targetParkingRent: number | null;
    targetAncillaryCosts: number | null;
  };
  financials: {
    loanAmount: number;
    equity: number;
    interestRate: number;
    repaymentRate: number;
    fixedInterestPeriodYears: number;
  } | null;
  rnd: {
    rndMode: string;
    modernizationRoof: string | null;
    modernizationWindows: string | null;
    modernizationLines: string | null;
    modernizationHeating: string | null;
    modernizationFacade: string | null;
    modernizationBathrooms: string | null;
    modernizationInterior: string | null;
    remainingUsefulLifeYears: number | null;
    afaPercent: number | null;
  } | null;
  priceSplit: {
    splitMode: string;
    plotAreaM2: number | null;
    landReferenceValue: number | null;
    coOwnershipNumerator: number | null;
    coOwnershipDenominator: number | null;
  } | null;
  measures: {
    title: string;
    category: string;
    description: string | null;
    estimatedCost: number | null;
    budgetMin: number | null;
    budgetMax: number | null;
    published: boolean;
  }[];
  /** Period for the Nebenkostenabrechnung built from an uploaded statement. */
  settlementPeriod: { start: string; end: string };
}

const ENERGY_CLASSES = new Set(['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

/** property.energy_efficient is an enum; anything else (e.g. "A++") is dropped. */
function energyClass(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ENERGY_CLASSES.has(text) ? text : null;
}

/**
 * What a Bestandsobjekt requires but a Detailbewertung may lack (Straße and
 * PLZ are optional in Objektdaten; a Neubau can have a future Baujahr). The
 * route answers 400 with these, so the user knows what to complete first.
 */
export function takeoverBlockers(plan: TakeoverPlan, today: Date = new Date()): string[] {
  const blockers: string[] = [];
  if (!plan.property.street) blockers.push('Straße');
  if (!plan.property.postalCode || !/^\d{5}$/.test(plan.property.postalCode)) blockers.push('PLZ (5 Ziffern)');
  if (!plan.property.city.trim()) blockers.push('Ort');
  const year = plan.property.yearOfConstruction;
  if (year == null || year < 1800 || year > today.getFullYear()) blockers.push('Baujahr (1800 bis heute)');
  return blockers;
}

function interestYears(value: unknown): InterestPeriodYears {
  const parsed = Number(value);
  return parsed === 15 || parsed === 20 ? parsed : 10;
}

/** Finanzierung → Finanzierungsangaben, for the variant chosen in the step. */
function financialsFrom(financing: Row, acquisition: Row | null): TakeoverPlan['financials'] {
  const repaymentRate = num(financing.repayment_rate) ?? 2;
  const interestAdjustmentFactor = num(financing.interest_adjustment_factor) ?? 1;
  const brokerPercent = num(acquisition?.broker_percent) ?? 0;
  const notaryPercent = num(acquisition?.notary_percent) ?? 0;
  const landRegistryPercent = num(acquisition?.land_registry_percent) ?? 0;
  const transferTaxPercent = num(acquisition?.property_transfer_tax_percent);

  if (financing.selected_variant === 'INDIVIDUAL') {
    const purchasePrice = num(financing.individual_purchase_price) ?? 0;
    const parkingPrice = num(financing.individual_parking_price) ?? 0;
    const computed = computeFinancing({
      purchasePrice,
      parkingPrice,
      additionalCosts: computeIndividualAdditionalCosts({
        purchasePrice, parkingPrice, brokerPercent, notaryPercent, landRegistryPercent,
        propertyTransferTaxPercent: transferTaxPercent,
      }),
      renovationCosts: num(financing.individual_renovation_costs) ?? 0,
      equity: num(financing.individual_equity) ?? 0,
      interestPeriodYears: interestYears(financing.individual_interest_period_years),
      repaymentRate,
      interestAdjustmentFactor,
    });
    return {
      loanAmount: computed.loanAmount,
      equity: num(financing.individual_equity) ?? 0,
      interestRate: num(financing.individual_interest_rate) ?? computed.interestRate,
      repaymentRate,
      fixedInterestPeriodYears: interestYears(financing.individual_interest_period_years),
    };
  }

  const computed = computeFinancing({
    purchasePrice: num(acquisition?.purchase_price) ?? 0,
    parkingPrice: num(acquisition?.parking_purchase_price) ?? 0,
    additionalCosts: num(acquisition?.total_additional_costs) ?? 0,
    renovationCosts: num(financing.offer_renovation_costs) ?? 0,
    equity: num(financing.offer_equity) ?? 0,
    interestPeriodYears: interestYears(financing.offer_interest_period_years),
    repaymentRate,
    interestAdjustmentFactor,
  });
  return {
    loanAmount: computed.loanAmount,
    equity: num(financing.offer_equity) ?? 0,
    interestRate: num(financing.offer_interest_rate) ?? computed.interestRate,
    repaymentRate,
    fixedInterestPeriodYears: interestYears(financing.offer_interest_period_years),
  };
}

export function buildTakeoverPlan(snapshot: DetailCheckSnapshot, today: Date = new Date()): TakeoverPlan {
  const { propertyData: pd, acquisition, rental, financing, depreciation } = snapshot;
  const { street, houseNumber } = splitStreetAndHouseNumber(pd.street_house_number as string | null);
  const livingAreaM2 = positive(pd.living_area_m2);
  const yearOfConstruction = num(pd.year_of_construction);
  const energyEfficient = energyClass(pd.energy_efficiency);
  const parkingSpaces = num(pd.parking_spaces) ?? 0;

  const purchasePrice = positive(acquisition?.purchase_price);
  const brokerPercent = num(acquisition?.broker_percent);
  const notaryPercent = num(acquisition?.notary_percent);
  const landRegistryPercent = num(acquisition?.land_registry_percent);
  const transferTaxPercent = num(acquisition?.property_transfer_tax_percent);
  const percents = [brokerPercent, notaryPercent, landRegistryPercent, transferTaxPercent];

  const serviceChargesTotal = positive(rental?.service_charges_total)
    ?? (positive(rental?.service_charges_allocable) ?? 0) + (positive(rental?.service_charges_non_allocable) ?? 0);

  const selectedCases = snapshot.renovationCases.filter((item) => item.selected);

  return {
    property: {
      street,
      houseNumber,
      postalCode: (pd.postal_code as string | null) || null,
      city: String(pd.city ?? ''),
      squareMeters: livingAreaM2,
      yearOfConstruction,
      energyEfficient,
      propertyCategory: (pd.property_category as string | null) || null,
    },
    parkingSpaces,
    acquisitionCosts: purchasePrice == null ? null : {
      purchasePrice,
      pricePerSqm: num(acquisition?.purchase_price_per_m2),
      brokerPercent,
      brokerValue: num(acquisition?.broker_amount),
      notaryPercent,
      notaryValue: num(acquisition?.notary_amount),
      landRegistryPercent,
      landRegistryValue: num(acquisition?.land_registry_amount),
      transferTaxPercent,
      transferTaxValue: num(acquisition?.property_transfer_tax_amount),
      totalAncillaryPercent: percents.some((p) => p != null)
        ? Math.round(percents.reduce<number>((sum, p) => sum + (p ?? 0), 0) * 10000) / 10000
        : null,
      totalAncillaryValue: num(acquisition?.total_additional_costs),
      parkingPurchasePrice: positive(acquisition?.parking_purchase_price),
    },
    unit: {
      usageType: pd.property_category === 'GEWERBE' ? 'GEWERBEFLAECHE' : 'WOHNUNG',
      livingAreaM2,
      yearOfConstruction,
      energyEfficient,
      numberOfParkingSpaces: parkingSpaces,
      targetColdRent: positive(rental?.cold_rent),
      targetParkingRent: positive(rental?.parking_rent),
      targetAncillaryCosts: serviceChargesTotal > 0 ? serviceChargesTotal : null,
    },
    financials: financing ? financialsFrom(financing, acquisition) : null,
    rnd: depreciation ? {
      rndMode: String(depreciation.depreciation_mode ?? 'STANDARD'),
      modernizationRoof: (depreciation.modernization_roof as string | null) ?? null,
      modernizationWindows: (depreciation.modernization_windows as string | null) ?? null,
      modernizationLines: (depreciation.modernization_lines as string | null) ?? null,
      modernizationHeating: (depreciation.modernization_heating as string | null) ?? null,
      modernizationFacade: (depreciation.modernization_facade as string | null) ?? null,
      modernizationBathrooms: (depreciation.modernization_bathrooms as string | null) ?? null,
      modernizationInterior: (depreciation.modernization_interior as string | null) ?? null,
      remainingUsefulLifeYears: num(depreciation.remaining_useful_life_years),
      afaPercent: num(depreciation.afa_percent),
    } : null,
    priceSplit: depreciation ? {
      splitMode: String(depreciation.price_split_mode ?? 'STANDARD'),
      plotAreaM2: num(depreciation.plot_area_m2),
      landReferenceValue: num(depreciation.land_reference_value),
      coOwnershipNumerator: num(depreciation.co_ownership_numerator),
      coOwnershipDenominator: num(depreciation.co_ownership_denominator),
    } : null,
    measures: selectedCases.map((item) => ({
      title: item.massnahme,
      category: item.kategorie,
      description: [item.beschreibung?.trim(), item.zeitpunkt === 'SOFORT' ? 'Zeitpunkt: sofort' : null]
        .filter(Boolean).join('\n\n') || null,
      estimatedCost: typeof item.cost_selected === 'number' ? item.cost_selected : null,
      budgetMin: item.ai?.price_min ?? null,
      budgetMax: item.ai?.price_max ?? null,
      published: item.publish_order === true,
    })),
    settlementPeriod: settlementPeriodFor(rental?.valuation_date as string | Date | null, today),
  };
}

/** Readable summary of what was taken over, for the success message. */
export function describeTakeover(plan: TakeoverPlan): string[] {
  return [
    'Objektdaten',
    plan.acquisitionCosts && 'Kaufkosten',
    (plan.unit.targetColdRent || plan.unit.targetAncillaryCosts) && 'Soll-Mieten',
    plan.financials && 'Finanzierung',
    plan.rnd && 'Restnutzungsdauer',
    plan.measures.length > 0 && `${plan.measures.length} ${plan.measures.length === 1 ? 'Maßnahme' : 'Maßnahmen'} (${[...new Set(plan.measures.map((m) => categoryLabel(m.category)))].join(', ')})`,
  ].filter((item): item is string => Boolean(item));
}
