import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { postalCodePrefixes, resolveRegionFactor, type RegionFactorEntry } from './regionFactor';

describe('postalCodePrefixes', () => {
  it('lists the lookup order: 5, 4, 3, then 2 digits', () => {
    expect(postalCodePrefixes('80801')).toEqual(['80801', '8080', '808', '80']);
  });

  it('keeps the leading zero of East German postal codes', () => {
    expect(postalCodePrefixes('01067')).toEqual(['01067', '0106', '010', '01']);
  });

  it('ignores surrounding whitespace', () => {
    expect(postalCodePrefixes(' 80801 ')).toEqual(['80801', '8080', '808', '80']);
  });

  it.each([null, undefined, '', '8080', '808011', 'abcde', '80 801'])(
    'returns nothing for an invalid postal code (%s)',
    (value) => {
      expect(postalCodePrefixes(value)).toEqual([]);
    },
  );
});

describe('resolveRegionFactor', () => {
  const entries: RegionFactorEntry[] = [
    { plzPrefix: '14', factor: 0.85 },
    { plzPrefix: '140', factor: 1.12 },
    { plzPrefix: '1446', factor: 0.95 },
    { plzPrefix: '14467', factor: 0.97 },
  ];

  it('prefers the longest matching prefix', () => {
    expect(resolveRegionFactor('14467', entries)).toBe(0.97);
    expect(resolveRegionFactor('14469', entries)).toBe(0.95);
    expect(resolveRegionFactor('14052', entries)).toBe(1.12);
    expect(resolveRegionFactor('14532', entries)).toBe(0.85);
  });

  it('does not depend on the order the rows arrive in', () => {
    expect(resolveRegionFactor('14469', [...entries].reverse())).toBe(0.95);
  });

  it('falls back to 1 when nothing matches', () => {
    expect(resolveRegionFactor('30159', entries)).toBe(1);
  });

  it('falls back to 1 for an invalid postal code, even if a row would match its digits', () => {
    expect(resolveRegionFactor('14', entries)).toBe(1);
    expect(resolveRegionFactor(null, entries)).toBe(1);
  });

  it('skips unusable factors and keeps searching shorter prefixes', () => {
    const broken: RegionFactorEntry[] = [
      { plzPrefix: '14', factor: 0.85 },
      { plzPrefix: '1446', factor: 0 },
      { plzPrefix: '144', factor: Number.NaN },
    ];
    expect(resolveRegionFactor('14469', broken)).toBe(0.85);
  });
});

/**
 * Checks the rows that actually ship in the migration, not a copy of them —
 * a wrong prefix in the seed data would otherwise only surface as a wrong
 * price in front of a customer.
 */
describe('seed data in 20260922000001_renovation_region_factor.sql', () => {
  const migration = readFileSync(
    fileURLToPath(new URL(
      '../../../../../supabase/migrations/20260922000001_renovation_region_factor.sql',
      import.meta.url,
    )),
    'utf8',
  );
  const seed: RegionFactorEntry[] = [...migration.matchAll(/\('(\d{2,5})',\s*([\d.]+),/g)]
    .map((match) => ({ plzPrefix: match[1], factor: Number(match[2]) }));

  it('contains no duplicate prefixes', () => {
    const prefixes = seed.map((entry) => entry.plzPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it.each([
    // unchanged metropolitan values
    ['München', '80801', 1.12],
    ['Frankfurt am Main', '60311', 1.12],
    ['Köln', '50667', 1.06],
    ['Stuttgart', '70173', 1.06],
    // gaps closed
    ['Berlin-Neukölln', '12043', 1.12],
    ['Berlin-Spandau', '13581', 1.12],
    ['Berlin-Charlottenburg (140xx)', '14050', 1.12],
    ['Berlin-Zehlendorf (141xx)', '14163', 1.12],
    ['Hamburg-Bergedorf', '21029', 1.12],
    ['Hamburg-Harburg', '21073', 1.12],
    ['Lüneburg (21xxx, not Hamburg)', '21335', 1],
    // East German cities
    ['Dresden', '01067', 0.95],
    ['Leipzig', '04109', 0.95],
    ['Potsdam', '14467', 0.95],
    ['Rostock', '18055', 0.95],
    ['Rostock-Warnemünde', '18119', 0.95],
    ['Erfurt', '99084', 0.95],
    ['Jena', '07743', 0.95],
    // rest of East Germany
    ['Görlitz', '02826', 0.85],
    ['Chemnitz', '09111', 0.85],
    ['Magdeburg', '39104', 0.85],
    ['Kleinmachnow (Brandenburg)', '14532', 0.85],
    ['Graal-Müritz (Landkreis Rostock)', '18181', 0.85],
    ['Weimar', '99423', 0.85],
    // everything else
    ['Hannover', '30159', 1],
    ['Nürnberg', '90402', 1],
  ])('%s (%s) → %s', (_label, postalCode, factor) => {
    expect(resolveRegionFactor(postalCode, seed)).toBe(factor);
  });
});
