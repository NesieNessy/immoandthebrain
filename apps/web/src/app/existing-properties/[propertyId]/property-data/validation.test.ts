import { describe, expect, it } from 'vitest';
import { isPropertyDataFormValid, normalizeNumberOfRooms, type PropertyDataFormFields } from './validation';

const CURRENT_YEAR = 2026;

const validFields: PropertyDataFormFields = {
  objektkategorie: 'EIGENTUMSWOHNUNG',
  strasseHausnummer: 'Musterstraße 1',
  plz: '80331',
  ort: 'München',
  baujahr: '1990',
  wohnflaeche: '85.5',
  stellplaetze: '0',
  kaufpreis: '450000',
};

describe('isPropertyDataFormValid', () => {
  it('accepts a fully filled-in form', () => {
    expect(isPropertyDataFormValid(validFields, CURRENT_YEAR)).toBe(true);
  });

  it('rejects a missing Objektkategorie', () => {
    expect(isPropertyDataFormValid({ ...validFields, objektkategorie: '' }, CURRENT_YEAR)).toBe(false);
  });

  it('rejects a blank or whitespace-only street', () => {
    expect(isPropertyDataFormValid({ ...validFields, strasseHausnummer: '' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, strasseHausnummer: '   ' }, CURRENT_YEAR)).toBe(false);
  });

  it('requires exactly 5 digits for the postal code', () => {
    expect(isPropertyDataFormValid({ ...validFields, plz: '8033' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, plz: '80331a' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, plz: '80331' }, CURRENT_YEAR)).toBe(true);
  });

  it('rejects a blank city', () => {
    expect(isPropertyDataFormValid({ ...validFields, ort: '' }, CURRENT_YEAR)).toBe(false);
  });

  it('requires a 4-digit construction year within 1800..currentYear', () => {
    expect(isPropertyDataFormValid({ ...validFields, baujahr: '180' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, baujahr: '1799' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, baujahr: '1800' }, CURRENT_YEAR)).toBe(true);
    expect(isPropertyDataFormValid({ ...validFields, baujahr: String(CURRENT_YEAR) }, CURRENT_YEAR)).toBe(true);
    expect(isPropertyDataFormValid({ ...validFields, baujahr: String(CURRENT_YEAR + 1) }, CURRENT_YEAR)).toBe(false);
  });

  it('requires living area (Wohnfläche) to be greater than 0', () => {
    expect(isPropertyDataFormValid({ ...validFields, wohnflaeche: '0' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, wohnflaeche: '-10' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, wohnflaeche: '1' }, CURRENT_YEAR)).toBe(true);
  });

  it('requires Stellplätze to be present, 0 being a valid value', () => {
    expect(isPropertyDataFormValid({ ...validFields, stellplaetze: '' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, stellplaetze: '0' }, CURRENT_YEAR)).toBe(true);
    expect(isPropertyDataFormValid({ ...validFields, stellplaetze: '-1' }, CURRENT_YEAR)).toBe(false);
  });

  it('requires Kaufpreis to be present and greater than 0', () => {
    expect(isPropertyDataFormValid({ ...validFields, kaufpreis: '' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, kaufpreis: '0' }, CURRENT_YEAR)).toBe(false);
    expect(isPropertyDataFormValid({ ...validFields, kaufpreis: '-500' }, CURRENT_YEAR)).toBe(false);
  });
});

describe('normalizeNumberOfRooms', () => {
  it('parses a positive value as-is', () => {
    expect(normalizeNumberOfRooms('3')).toBe(3);
  });

  it('treats blank as not specified (null)', () => {
    expect(normalizeNumberOfRooms('')).toBeNull();
  });

  it('treats 0 as not specified (null) — the DB rejects a literal 0', () => {
    expect(normalizeNumberOfRooms('0')).toBeNull();
  });

  it('treats a negative value as not specified (null)', () => {
    expect(normalizeNumberOfRooms('-2')).toBeNull();
  });
});
