import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDecimalInput } from './acquisitionCosts';
import {
  applyServiceChargeSuggestion,
  currentMonthDate,
  monthFromDate,
  normalizeMonthInput,
  serviceChargesMismatch,
} from './rental';
import { estimateRentIndexPerM2 } from './rentIndex';

describe('valuation month helpers (Vermietung)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26));
  });
  afterEach(() => vi.useRealTimers());

  it('uses the first day of the current month as default', () => {
    expect(currentMonthDate()).toBe('2026-09-01');
    expect(normalizeMonthInput('')).toBe('2026-09-01');
  });

  it('turns a month input into the stored first-of-month date and back', () => {
    expect(normalizeMonthInput('2027-03')).toBe('2027-03-01');
    expect(monthFromDate('2027-03-01')).toBe('2027-03');
  });
});

describe('serviceChargesMismatch', () => {
  it('is false when umlagefähig + nicht umlagefähig equal the total', () => {
    expect(serviceChargesMismatch(150, 50, 200)).toBe(false);
    expect(serviceChargesMismatch(0.1, 0.2, 0.3)).toBe(false); // floating point sum
  });

  it('is true once the parts and the total differ by more than a cent', () => {
    expect(serviceChargesMismatch(150, 50, 210)).toBe(true);
    expect(serviceChargesMismatch(150, 50, 200.02)).toBe(true);
  });
});

describe('applyServiceChargeSuggestion', () => {
  const empty = { allocable: '', nonAllocable: '', total: '' };

  it('keeps the total in sync when one of the parts changes', () => {
    const next = applyServiceChargeSuggestion({ ...empty, allocable: '150', nonAllocable: '50,5' }, 'nonAllocable', parseDecimalInput);
    expect(next.total).toBe('200,5');
  });

  it('clears the total when both parts are emptied', () => {
    const next = applyServiceChargeSuggestion({ allocable: '', nonAllocable: '', total: '200' }, 'allocable', parseDecimalInput);
    expect(next.total).toBe('');
  });

  it('splits a total entered on its own 60/40 into the parts', () => {
    const next = applyServiceChargeSuggestion({ ...empty, total: '250' }, 'total', parseDecimalInput);
    expect(next).toEqual({ total: '250', allocable: '150', nonAllocable: '100' });
  });

  it('does not overwrite parts that were already entered when the total changes', () => {
    const values = { allocable: '100', nonAllocable: '20', total: '300' };
    expect(applyServiceChargeSuggestion(values, 'total', parseDecimalInput)).toEqual(values);
  });
});

describe('estimateRentIndexPerM2', () => {
  it('reads the rent index from the construction-year band and living-area class', () => {
    expect(estimateRentIndexPerM2(1930, 25)).toBe(12);
    expect(estimateRentIndexPerM2(1995, 75)).toBe(19);
    expect(estimateRentIndexPerM2(2020, 120)).toBe(24.5);
  });

  it('switches bands exactly at the band borders', () => {
    expect(estimateRentIndexPerM2(1948, 50)).toBe(13.5);
    expect(estimateRentIndexPerM2(1949, 50)).toBe(15.5);
    expect(estimateRentIndexPerM2(2015, 50)).toBe(19.5);
    expect(estimateRentIndexPerM2(2016, 50)).toBe(21.5);
  });

  it('switches area classes at 30, 60 and 90 m²', () => {
    expect(estimateRentIndexPerM2(2000, 29.9)).toBe(18);
    expect(estimateRentIndexPerM2(2000, 30)).toBe(19.5);
    expect(estimateRentIndexPerM2(2000, 60)).toBe(21);
    expect(estimateRentIndexPerM2(2000, 90)).toBe(22.5);
  });

  it('has no estimate without a usable year or area', () => {
    expect(estimateRentIndexPerM2(Number.NaN, 50)).toBeNull();
    expect(estimateRentIndexPerM2(2000, 0)).toBeNull();
  });
});
