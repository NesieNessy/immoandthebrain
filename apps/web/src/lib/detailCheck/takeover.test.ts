import { describe, expect, it } from 'vitest';
import { computeFinancing } from './financing';
import type { RenovationCase } from './renovation';
import {
  buildTakeoverPlan,
  settlementPeriodFor,
  splitStreetAndHouseNumber,
  takeoverBlockers,
  type DetailCheckSnapshot,
} from './takeover';

const today = new Date('2026-09-26T12:00:00Z');

function snapshot(overrides: Partial<DetailCheckSnapshot> = {}): DetailCheckSnapshot {
  return {
    propertyData: {
      street_house_number: 'Musterstraße 12a',
      postal_code: '80331',
      city: 'München',
      year_of_construction: 1995,
      living_area_m2: 75,
      parking_spaces: 1,
      energy_efficiency: 'C',
      property_category: 'WOHNUNG',
    },
    acquisition: {
      purchase_price: 300000,
      parking_purchase_price: 15000,
      broker_percent: 3.57,
      notary_percent: 1.5,
      land_registry_percent: 0.5,
      property_transfer_tax_percent: 3.5,
      purchase_price_per_m2: 4000,
      broker_amount: 11245.5,
      notary_amount: 4725,
      land_registry_amount: 1575,
      property_transfer_tax_amount: 11025,
      total_additional_costs: 28570.5,
      total_costs: 343570.5,
    },
    rental: {
      valuation_date: '2026-03-01',
      cold_rent: 1100,
      parking_rent: 60,
      service_charges_allocable: 180,
      service_charges_non_allocable: 40,
      service_charges_total: 220,
    },
    financing: {
      selected_variant: 'OFFER',
      offer_renovation_costs: 20000,
      offer_equity: 60000,
      offer_interest_period_years: 15,
      offer_interest_rate: 3.9,
      repayment_rate: 2.5,
      interest_adjustment_factor: 1,
    },
    depreciation: {
      depreciation_mode: 'INDIVIDUAL',
      price_split_mode: 'STANDARD',
      modernization_roof: 'LAST_10_YEARS',
      remaining_useful_life_years: 45,
      afa_percent: 2,
      plot_area_m2: 0,
      land_reference_value: 0,
      co_ownership_numerator: 0,
      co_ownership_denominator: 0,
    },
    renovationCases: [],
    ...overrides,
  };
}

function renovationCase(overrides: Partial<RenovationCase>): RenovationCase {
  return {
    id: 'c1',
    kategorie: 'SANITAER',
    massnahme: 'Bad sanieren',
    selected: true,
    zeitpunkt: 'FLEXIBEL',
    publish_order: false,
    ...overrides,
  };
}

describe('splitStreetAndHouseNumber', () => {
  it.each([
    ['Musterstraße 12a', 'Musterstraße', '12a'],
    ['Am Hang 3', 'Am Hang', '3'],
    ['Teststraße 1–5'.replace('–', '-'), 'Teststraße', '1-5'],
    ['Hauptstr. 7 b', 'Hauptstr.', '7b'],
    ['Lindenweg, 4', 'Lindenweg', '4'],
    ['Straße des 17. Juni 100', 'Straße des 17. Juni', '100'],
  ])('%s → %s + %s', (input, street, houseNumber) => {
    expect(splitStreetAndHouseNumber(input)).toEqual({ street, houseNumber });
  });

  it('keeps an address without a number in the street', () => {
    expect(splitStreetAndHouseNumber('Marktplatz')).toEqual({ street: 'Marktplatz', houseNumber: null });
    expect(splitStreetAndHouseNumber(null)).toEqual({ street: '', houseNumber: null });
  });
});

describe('settlementPeriodFor', () => {
  it('is the calendar year before the valuation date', () => {
    expect(settlementPeriodFor('2026-03-01', today)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(settlementPeriodFor(new Date('2024-12-31T00:00:00'), today)).toEqual({ start: '2023-01-01', end: '2023-12-31' });
  });

  it('falls back to today without a valuation date', () => {
    expect(settlementPeriodFor(null, today)).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });
});

describe('buildTakeoverPlan', () => {
  it('maps Objektdaten, Kaufkosten and Vermietung completely', () => {
    const plan = buildTakeoverPlan(snapshot(), today);

    expect(plan.property).toEqual({
      street: 'Musterstraße',
      houseNumber: '12a',
      postalCode: '80331',
      city: 'München',
      squareMeters: 75,
      yearOfConstruction: 1995,
      energyEfficient: 'C',
      propertyCategory: 'WOHNUNG',
    });
    expect(plan.parkingSpaces).toBe(1);
    expect(plan.acquisitionCosts).toEqual({
      purchasePrice: 300000,
      pricePerSqm: 4000,
      brokerPercent: 3.57,
      brokerValue: 11245.5,
      notaryPercent: 1.5,
      notaryValue: 4725,
      landRegistryPercent: 0.5,
      landRegistryValue: 1575,
      transferTaxPercent: 3.5,
      transferTaxValue: 11025,
      totalAncillaryPercent: 9.07,
      totalAncillaryValue: 28570.5,
      parkingPurchasePrice: 15000,
    });
    expect(plan.unit).toMatchObject({
      usageType: 'WOHNUNG',
      livingAreaM2: 75,
      numberOfParkingSpaces: 1,
      targetColdRent: 1100,
      targetParkingRent: 60,
      targetAncillaryCosts: 220,
    });
    expect(plan.settlementPeriod).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('takes the offer variant of the Finanzierung with the loan the step shows', () => {
    const plan = buildTakeoverPlan(snapshot(), today);
    const expectedLoan = computeFinancing({
      purchasePrice: 300000,
      parkingPrice: 15000,
      additionalCosts: 28570.5,
      renovationCosts: 20000,
      equity: 60000,
      interestPeriodYears: 15,
      repaymentRate: 2.5,
    }).loanAmount;

    expect(plan.financials).toEqual({
      loanAmount: expectedLoan,
      equity: 60000,
      interestRate: 3.9,
      repaymentRate: 2.5,
      fixedInterestPeriodYears: 15,
    });
    expect(expectedLoan).toBe(303570.5);
  });

  it('takes the individual variant when that was chosen', () => {
    const plan = buildTakeoverPlan(snapshot({
      financing: {
        selected_variant: 'INDIVIDUAL',
        individual_purchase_price: 280000,
        individual_parking_price: 0,
        individual_renovation_costs: 0,
        individual_equity: 80000,
        individual_interest_period_years: 20,
        individual_interest_rate: 4.1,
        repayment_rate: 2,
      },
    }), today);

    expect(plan.financials).toMatchObject({ equity: 80000, interestRate: 4.1, fixedInterestPeriodYears: 20, repaymentRate: 2 });
    // 280.000 + 9,07 % Nebenkosten − 80.000 Eigenkapital
    expect(plan.financials?.loanAmount).toBe(225396);
  });

  it('carries RND and Kaufpreisaufteilung over', () => {
    const plan = buildTakeoverPlan(snapshot(), today);
    expect(plan.rnd).toMatchObject({ rndMode: 'INDIVIDUAL', modernizationRoof: 'LAST_10_YEARS', remainingUsefulLifeYears: 45, afaPercent: 2 });
    expect(plan.priceSplit).toMatchObject({ splitMode: 'STANDARD' });
  });

  it('turns only the selected Sanierung cases into Maßnahmen', () => {
    const plan = buildTakeoverPlan(snapshot({
      renovationCases: [
        renovationCase({
          massnahme: 'Bad sanieren',
          beschreibung: 'Wanne raus, Dusche rein',
          cost_selected: 18000,
          ai: { summary: '', price_min: 15000, price_max: 22000, confidence: 0.8, source: 'AI' },
          zeitpunkt: 'SOFORT',
          publish_order: true,
        }),
        renovationCase({ id: 'c2', massnahme: 'Fenster tauschen', selected: false }),
      ],
    }), today);

    expect(plan.measures).toEqual([{
      title: 'Bad sanieren',
      category: 'SANITAER',
      description: 'Wanne raus, Dusche rein\n\nZeitpunkt: sofort',
      estimatedCost: 18000,
      budgetMin: 15000,
      budgetMax: 22000,
      published: true,
    }]);
  });

  it('leaves out steps that were never saved (detail check without all steps)', () => {
    const plan = buildTakeoverPlan(snapshot({ acquisition: null, rental: null, financing: null, depreciation: null }), today);
    expect(plan.acquisitionCosts).toBeNull();
    expect(plan.financials).toBeNull();
    expect(plan.rnd).toBeNull();
    expect(plan.priceSplit).toBeNull();
    expect(plan.unit.targetColdRent).toBeNull();
    expect(plan.unit.targetAncillaryCosts).toBeNull();
  });

  it('drops an energy class the Bestandsobjekt does not know and maps Gewerbe', () => {
    const plan = buildTakeoverPlan(snapshot({
      propertyData: { ...snapshot().propertyData, energy_efficiency: 'A++', property_category: 'GEWERBE' },
    }), today);
    expect(plan.property.energyEfficient).toBeNull();
    expect(plan.unit.usageType).toBe('GEWERBEFLAECHE');
  });
});

describe('takeoverBlockers', () => {
  it('is empty for a complete detail check', () => {
    expect(takeoverBlockers(buildTakeoverPlan(snapshot(), today), today)).toEqual([]);
  });

  it('names what a Bestandsobjekt needs but the detail check lacks', () => {
    const plan = buildTakeoverPlan(snapshot({
      propertyData: { ...snapshot().propertyData, street_house_number: null, postal_code: null, year_of_construction: 2028 },
    }), today);
    expect(takeoverBlockers(plan, today)).toEqual(['Straße', 'PLZ (5 Ziffern)', 'Baujahr (1800 bis heute)']);
  });
});
