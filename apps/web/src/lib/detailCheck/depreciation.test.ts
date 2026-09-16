import { describe, expect, it } from 'vitest';
import {
  computePriceSplitIndividual,
  computePriceSplitStandard,
  computeRemainingUsefulLife,
  modernizationPoints,
  usefulLifeByCategory,
  type ModernizationSelections,
} from './depreciation';

const EMPTY_MODERNIZATION: ModernizationSelections = {
  modernizationRoof: '',
  modernizationWindows: '',
  modernizationLines: '',
  modernizationHeating: '',
  modernizationFacade: '',
  modernizationBathrooms: '',
  modernizationInterior: '',
};

describe('usefulLifeByCategory', () => {
  it('gives Holzbauweise a shorter total useful life (50 years)', () => {
    expect(usefulLifeByCategory('HOLZBAUWEISE')).toBe(50);
  });

  it('gives Denkmalgeschützt a longer total useful life (100 years)', () => {
    expect(usefulLifeByCategory('DENKMALGESCHUETZT')).toBe(100);
  });

  it('defaults every other category (incl. Eigentumswohnung) to 80 years', () => {
    expect(usefulLifeByCategory('EIGENTUMSWOHNUNG')).toBe(80);
    expect(usefulLifeByCategory(null)).toBe(80);
    expect(usefulLifeByCategory(undefined)).toBe(80);
  });
});

describe('modernizationPoints', () => {
  it('sums each field\'s points, treating unrecognized/empty values as 0', () => {
    const selections: ModernizationSelections = {
      modernizationRoof: '0_5', // 3
      modernizationWindows: '5_10', // 2
      modernizationLines: '10_15', // 1.5
      modernizationHeating: '15_20', // 1
      modernizationFacade: 'GT_20', // 0
      modernizationBathrooms: '', // 0 (not modernized)
      modernizationInterior: '0_5', // 3
    };
    expect(modernizationPoints(selections)).toBe(10.5);
  });

  it('is 0 when nothing has been modernized', () => {
    expect(modernizationPoints(EMPTY_MODERNIZATION)).toBe(0);
  });

  it('maxes out at 21 when every field was modernized within the last 5 years', () => {
    const allRecent: ModernizationSelections = {
      modernizationRoof: '0_5',
      modernizationWindows: '0_5',
      modernizationLines: '0_5',
      modernizationHeating: '0_5',
      modernizationFacade: '0_5',
      modernizationBathrooms: '0_5',
      modernizationInterior: '0_5',
    };
    expect(modernizationPoints(allRecent)).toBe(21);
  });
});

describe('computeRemainingUsefulLife', () => {
  it('clamps RND to the category\'s total useful life for a brand-new, unmodernized building', () => {
    const result = computeRemainingUsefulLife({
      category: null,
      yearOfConstruction: 2020,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    expect(result.gnd).toBe(80);
    expect(result.age).toBe(0);
    expect(result.modernizationPoints).toBe(0);
    expect(result.remainingUsefulLifeYears).toBe(80);
    expect(result.afaPercent).toBe(1.25);
  });

  it('derives a low RND for an old, unmodernized building', () => {
    // age === gnd (80), no modernization credit at all.
    const result = computeRemainingUsefulLife({
      category: null,
      yearOfConstruction: 1940,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    expect(result.gnd).toBe(80);
    expect(result.age).toBe(80);
    expect(result.remainingUsefulLifeYears).toBe(12);
    expect(result.afaPercent).toBe(8.33);
  });

  it('extends RND when every modernization measure was done recently', () => {
    const allRecent: ModernizationSelections = {
      modernizationRoof: '0_5',
      modernizationWindows: '0_5',
      modernizationLines: '0_5',
      modernizationHeating: '0_5',
      modernizationFacade: '0_5',
      modernizationBathrooms: '0_5',
      modernizationInterior: '0_5',
    };
    const result = computeRemainingUsefulLife({
      category: null,
      yearOfConstruction: 1970,
      selections: allRecent,
      currentYear: 2020,
    });
    expect(result.age).toBe(50);
    expect(result.modernizationPoints).toBe(21);
    expect(result.remainingUsefulLifeYears).toBe(59.61);
    expect(result.afaPercent).toBe(1.68);
  });

  it('never returns an RND above the category\'s total useful life, however old the building', () => {
    const result = computeRemainingUsefulLife({
      category: null,
      yearOfConstruction: 1820,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    expect(result.remainingUsefulLifeYears).toBeLessThanOrEqual(result.gnd);
    expect(result.remainingUsefulLifeYears).toBe(80);
  });

  it('never returns an RND below 1 year, however unfavourable the inputs', () => {
    const result = computeRemainingUsefulLife({
      category: 'HOLZBAUWEISE',
      yearOfConstruction: 1000,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    expect(result.remainingUsefulLifeYears).toBeGreaterThanOrEqual(1);
  });

  it('shortens the total useful life for Holzbauweise vs. Denkmalgeschützt for the same age/modernization', () => {
    const holzbauweise = computeRemainingUsefulLife({
      category: 'HOLZBAUWEISE',
      yearOfConstruction: 2000,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    const denkmal = computeRemainingUsefulLife({
      category: 'DENKMALGESCHUETZT',
      yearOfConstruction: 2000,
      selections: EMPTY_MODERNIZATION,
      currentYear: 2020,
    });
    expect(holzbauweise.gnd).toBe(50);
    expect(denkmal.gnd).toBe(100);
    expect(holzbauweise.remainingUsefulLifeYears).toBeLessThan(denkmal.remainingUsefulLifeYears);
  });
});

describe('computePriceSplitStandard', () => {
  it('splits 65/35 by default', () => {
    const result = computePriceSplitStandard(300000);
    expect(result).toEqual({
      buildingValue: 195000,
      buildingSharePercent: 65,
      landValue: 105000,
      landSharePercent: 35,
    });
  });

  it('honours a custom (city-specific) building share', () => {
    const result = computePriceSplitStandard(400000, 70);
    expect(result).toEqual({
      buildingValue: 280000,
      buildingSharePercent: 70,
      landValue: 120000,
      landSharePercent: 30,
    });
  });

  it('always adds back up to the purchase price / 100%', () => {
    const result = computePriceSplitStandard(123456, 42);
    expect(result.buildingValue + result.landValue).toBe(123456);
    expect(result.buildingSharePercent + result.landSharePercent).toBe(100);
  });
});

describe('computePriceSplitIndividual', () => {
  it('derives the land value from Bodenrichtwert × Grundstücksfläche × Miteigentumsanteil', () => {
    const result = computePriceSplitIndividual({
      purchasePrice: 300000,
      landReferenceValue: 800,
      plotAreaM2: 500,
      coOwnershipNumerator: 250,
      coOwnershipDenominator: 1000,
    });
    expect(result).toEqual({
      buildingValue: 200000,
      buildingSharePercent: 66.67,
      landValue: 100000,
      landSharePercent: 33.33,
    });
  });

  it('treats a zero co-ownership denominator as no land share (avoids dividing by zero)', () => {
    const result = computePriceSplitIndividual({
      purchasePrice: 300000,
      landReferenceValue: 800,
      plotAreaM2: 500,
      coOwnershipNumerator: 250,
      coOwnershipDenominator: 0,
    });
    expect(result).toEqual({
      buildingValue: 300000,
      buildingSharePercent: 100,
      landValue: 0,
      landSharePercent: 0,
    });
  });

  it('caps the land value at the purchase price so the split still sums to 100%, even with bad Bodenrichtwert/Grundstücksfläche input', () => {
    const result = computePriceSplitIndividual({
      purchasePrice: 300000,
      landReferenceValue: 10000,
      plotAreaM2: 100,
      coOwnershipNumerator: 1,
      coOwnershipDenominator: 1,
    });
    expect(result.landValue).toBe(300000);
    expect(result.buildingValue).toBe(0);
    expect(result.buildingSharePercent + result.landSharePercent).toBe(100);
  });

  it('never lets building/land values go negative', () => {
    const result = computePriceSplitIndividual({
      purchasePrice: 0,
      landReferenceValue: 800,
      plotAreaM2: 500,
      coOwnershipNumerator: 1,
      coOwnershipDenominator: 1,
    });
    expect(result.buildingValue).toBeGreaterThanOrEqual(0);
    expect(result.landValue).toBeGreaterThanOrEqual(0);
  });
});
