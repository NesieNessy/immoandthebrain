import { describe, expect, it } from 'vitest';
import {
  acquisitionCostErrors,
  computeAcquisitionCosts,
  formatDecimalInput,
  parseDecimalInput,
  resolveStateFromPostalCode,
  roundCurrency,
} from './acquisitionCosts';

describe('parseDecimalInput', () => {
  it('reads German decimal commas and thousands dots', () => {
    expect(parseDecimalInput('1.234,56')).toBe(1234.56);
    expect(parseDecimalInput('72,5')).toBe(72.5);
    expect(parseDecimalInput('300.000')).toBe(300000);
    expect(parseDecimalInput('1.234.567')).toBe(1234567);
  });

  it('keeps a plain dot as decimal separator when it is not thousands grouping', () => {
    expect(parseDecimalInput('3.57')).toBe(3.57);
    expect(parseDecimalInput('10.5')).toBe(10.5);
  });

  it('ignores spaces and falls back to 0 for anything unparsable', () => {
    expect(parseDecimalInput(' 1 200 ')).toBe(1200);
    expect(parseDecimalInput('abc')).toBe(0);
    expect(parseDecimalInput('')).toBe(0);
  });
});

describe('formatDecimalInput', () => {
  it('formats German-style with up to two decimals', () => {
    expect(formatDecimalInput('300000')).toBe('300.000');
    expect(formatDecimalInput('1234,5')).toBe('1.234,5');
    expect(formatDecimalInput('3.574')).toBe('3.574');
  });

  it('leaves an empty input empty', () => {
    expect(formatDecimalInput('  ')).toBe('');
  });
});

describe('roundCurrency', () => {
  it('rounds to cents, including the classic floating-point half cases', () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(10710.004)).toBe(10710);
  });
});

describe('resolveStateFromPostalCode', () => {
  it.each([
    ['80331', 'BY'], ['10115', 'BE'], ['20095', 'HH'], ['28195', 'HB'],
    ['24103', 'SH'], ['30159', 'NI'], ['40213', 'NW'], ['60311', 'HE'],
    ['39104', 'ST'], ['55116', 'RP'], ['66111', 'SL'], ['70173', 'BW'],
    ['99084', 'TH'], ['01067', 'SN'],
  ])('%s → %s', (postalCode, state) => {
    expect(resolveStateFromPostalCode(postalCode)).toBe(state);
  });

  it('resolves Mecklenburg-Vorpommern (17–19), not Brandenburg', () => {
    expect(resolveStateFromPostalCode('18055')).toBe('MV'); // Rostock
    expect(resolveStateFromPostalCode('19053')).toBe('MV'); // Schwerin
    expect(resolveStateFromPostalCode('17489')).toBe('MV'); // Greifswald
  });

  it('resolves the Brandenburg zones outside Berlin (03, 15, 16)', () => {
    expect(resolveStateFromPostalCode('03046')).toBe('BB'); // Cottbus
    expect(resolveStateFromPostalCode('15230')).toBe('BB'); // Frankfurt (Oder)
    expect(resolveStateFromPostalCode('16225')).toBe('BB'); // Eberswalde
  });

  it('resolves the eastern single-digit zones', () => {
    expect(resolveStateFromPostalCode('06108')).toBe('ST'); // Halle
    expect(resolveStateFromPostalCode('07743')).toBe('TH'); // Jena
    expect(resolveStateFromPostalCode('09111')).toBe('SN'); // Chemnitz
    expect(resolveStateFromPostalCode('04109')).toBe('SN'); // Leipzig
  });

  it('returns null for anything that is not a 5-digit postal code', () => {
    expect(resolveStateFromPostalCode('8033')).toBeNull();
    expect(resolveStateFromPostalCode('abcde')).toBeNull();
    expect(resolveStateFromPostalCode(null)).toBeNull();
    expect(resolveStateFromPostalCode(undefined)).toBeNull();
  });
});

describe('acquisitionCostErrors (Kaufkosten input rules, shared by page and API)', () => {
  const valid = { purchasePrice: 300000, parkingPurchasePrice: 0, brokerPercent: 3.57 };

  it('accepts a positive price, no parking and the default broker fee', () => {
    expect(acquisitionCostErrors(valid)).toEqual({});
  });

  it('requires a purchase price above 0 — a detail check without Ersteinschätzung has none to take over', () => {
    expect(acquisitionCostErrors({ ...valid, purchasePrice: 0 }).purchasePrice).toBeDefined();
    expect(acquisitionCostErrors({ ...valid, purchasePrice: -1 }).purchasePrice).toBeDefined();
    expect(acquisitionCostErrors({ ...valid, purchasePrice: Number.NaN }).purchasePrice).toBeDefined();
    expect(acquisitionCostErrors({ ...valid, purchasePrice: 0.01 }).purchasePrice).toBeUndefined();
  });

  it('caps prices at 1.000.000.000 €', () => {
    expect(acquisitionCostErrors({ ...valid, purchasePrice: 1_000_000_001 }).purchasePrice).toBeDefined();
    expect(acquisitionCostErrors({ ...valid, parkingPurchasePrice: 1_000_000_001 }).parkingPurchasePrice).toBeDefined();
  });

  it('allows a parking price of 0 but not below', () => {
    expect(acquisitionCostErrors({ ...valid, parkingPurchasePrice: 0 }).parkingPurchasePrice).toBeUndefined();
    expect(acquisitionCostErrors({ ...valid, parkingPurchasePrice: -1 }).parkingPurchasePrice).toBeDefined();
  });

  it('keeps the broker fee between 0 and 20 %', () => {
    expect(acquisitionCostErrors({ ...valid, brokerPercent: 0 }).brokerPercent).toBeUndefined();
    expect(acquisitionCostErrors({ ...valid, brokerPercent: 20 }).brokerPercent).toBeUndefined();
    expect(acquisitionCostErrors({ ...valid, brokerPercent: 20.01 }).brokerPercent).toBeDefined();
    expect(acquisitionCostErrors({ ...valid, brokerPercent: -0.5 }).brokerPercent).toBeDefined();
  });
});

describe('computeAcquisitionCosts (Kaufkosten)', () => {
  const bavaria = { brokerPercent: 3.57, notaryPercent: 1.5, landRegistryPercent: 0.5, propertyTransferTaxPercent: 3.5 };

  it('computes every Kaufnebenkosten position as a share of the purchase price', () => {
    const result = computeAcquisitionCosts({ purchasePrice: 300000, parkingPurchasePrice: 0, livingAreaM2: 75, ...bavaria });
    expect(result).toEqual({
      purchasePricePerM2: 4000,
      brokerAmount: 10710,
      notaryAmount: 4500,
      landRegistryAmount: 1500,
      propertyTransferTaxAmount: 10500,
      totalAdditionalCosts: 27210,
      totalCosts: 327210,
    });
  });

  it('includes the parking space price in the base, but not in the price per m²', () => {
    const result = computeAcquisitionCosts({ purchasePrice: 300000, parkingPurchasePrice: 20000, livingAreaM2: 75, ...bavaria });
    expect(result.purchasePricePerM2).toBe(4000);
    expect(result.brokerAmount).toBe(11424); // 3,57 % of 320.000
    expect(result.totalCosts).toBe(320000 + result.totalAdditionalCosts);
  });

  it('treats a missing Grunderwerbsteuer rate (unknown state) as 0 %', () => {
    const result = computeAcquisitionCosts({ ...bavaria, purchasePrice: 100000, parkingPurchasePrice: 0, propertyTransferTaxPercent: null });
    expect(result.propertyTransferTaxAmount).toBe(0);
  });

  it('has no price per m² without a living area', () => {
    expect(computeAcquisitionCosts({ ...bavaria, purchasePrice: 100000, parkingPurchasePrice: 0 }).purchasePricePerM2).toBeNull();
    expect(computeAcquisitionCosts({ ...bavaria, purchasePrice: 100000, parkingPurchasePrice: 0, livingAreaM2: 0 }).purchasePricePerM2).toBeNull();
  });

  it('never works with negative prices', () => {
    const result = computeAcquisitionCosts({ ...bavaria, purchasePrice: -5, parkingPurchasePrice: -5 });
    expect(result.totalCosts).toBe(0);
    expect(result.totalAdditionalCosts).toBe(0);
  });
});
