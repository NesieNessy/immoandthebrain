import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  indicatePriceRange,
  isCatalogMeasure,
  midpoint,
  normalizeRenovationCategory,
  RENOVATION_CATEGORIES,
  RENOVATION_MEASURES,
} from './catalog';

describe('renovation catalog', () => {
  it('has a base price for every catalog measure (none silently falls back)', () => {
    for (const { value: category } of RENOVATION_CATEGORIES) {
      for (const measure of RENOVATION_MEASURES[category]) {
        expect(isCatalogMeasure(measure), measure).toBe(true);
        const range = indicatePriceRange(category, measure);
        expect(range.min).toBeGreaterThan(0);
        expect(range.max).toBeGreaterThanOrEqual(range.min);
      }
    }
  });
});

describe('indicatePriceRange', () => {
  it('applies the regional factor', () => {
    expect(indicatePriceRange('SANITAER', 'Badsanierung komplett', { regionFactor: 1.2 }))
      .toEqual({ min: 14400, max: 33600 });
  });

  it('scales area-dependent categories by living area, clamped to 0.8–1.45', () => {
    expect(indicatePriceRange('AUSSEN', 'Fassadenanstrich', { livingAreaM2: 160 }))
      .toEqual({ min: 8700, max: 29000 });
    expect(indicatePriceRange('AUSSEN', 'Fassadenanstrich', { livingAreaM2: 20 }))
      .toEqual({ min: 4800, max: 16000 });
  });

  it('does not scale other categories by living area', () => {
    expect(indicatePriceRange('SANITAER', 'Badsanierung komplett', { livingAreaM2: 160 }))
      .toEqual({ min: 12000, max: 28000 });
  });

  it('treats a missing or non-positive factor as neutral', () => {
    const neutral = indicatePriceRange('SANITAER', 'Badsanierung komplett');
    expect(indicatePriceRange('SANITAER', 'Badsanierung komplett', { regionFactor: 0 })).toEqual(neutral);
    expect(indicatePriceRange('SANITAER', 'Badsanierung komplett', { regionFactor: null })).toEqual(neutral);
  });

  it('prices legacy Handwerkerleistungen categories like their catalog counterpart', () => {
    expect(indicatePriceRange('Fassade', 'Fassadenanstrich', { livingAreaM2: 160 }))
      .toEqual(indicatePriceRange('AUSSEN', 'Fassadenanstrich', { livingAreaM2: 160 }));
  });
});

describe('category helpers', () => {
  it('maps legacy labels onto catalog categories', () => {
    expect(normalizeRenovationCategory('Badezimmer')).toBe('SANITAER');
    expect(normalizeRenovationCategory('SANITAER')).toBe('SANITAER');
    expect(normalizeRenovationCategory('Unbekannt')).toBeNull();
    expect(normalizeRenovationCategory(null)).toBeNull();
  });

  it('labels catalog codes and legacy values, and shows unknown values as-is', () => {
    expect(categoryLabel('SANITAER')).toBe('Sanitär');
    expect(categoryLabel('Badezimmer')).toBe('Sanitär');
    expect(categoryLabel('Unbekannt')).toBe('Unbekannt');
    expect(categoryLabel(null)).toBe('');
  });

  it('midpoint is the rounded centre of a range', () => {
    expect(midpoint({ min: 4500, max: 12000 })).toBe(8250);
  });
});
