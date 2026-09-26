import { describe, expect, it } from 'vitest';
import {
  isPropertyDataValid,
  livePropertyDataErrors,
  propertyDataErrors,
  type PropertyDataForm,
} from './propertyDataValidation';

const YEAR = 2026;

function form(overrides: Partial<PropertyDataForm> = {}): PropertyDataForm {
  return {
    propertyCategory: 'EIGENTUMSWOHNUNG',
    tenancyType: 'STANDARD',
    sourceUrl: '',
    streetHouseNumber: 'Teststraße 1',
    postalCode: '80331',
    city: 'München',
    yearOfConstruction: '1995',
    livingAreaM2: '75',
    ...overrides,
  };
}

describe('propertyDataErrors (Objektdaten)', () => {
  it('accepts a complete, plausible form', () => {
    expect(propertyDataErrors(form(), YEAR)).toEqual({});
    expect(isPropertyDataValid(form(), YEAR)).toBe(true);
  });

  it('requires the city', () => {
    expect(propertyDataErrors(form({ city: '  ' }), YEAR).city).toBe('Ort ist ein Pflichtfeld.');
  });

  it('requires category and tenancy type', () => {
    const errors = propertyDataErrors(form({ propertyCategory: '', tenancyType: '' }), YEAR);
    expect(errors.propertyCategory).toBeDefined();
    expect(errors.tenancyType).toBeDefined();
  });

  it('bounds the construction year between 1000 and the current year', () => {
    expect(propertyDataErrors(form({ yearOfConstruction: '999' }), YEAR).yearOfConstruction).toBeDefined();
    expect(propertyDataErrors(form({ yearOfConstruction: '2027' }), YEAR).yearOfConstruction).toBeDefined();
    expect(propertyDataErrors(form({ yearOfConstruction: '1995,5' }), YEAR).yearOfConstruction).toBeDefined();
    expect(propertyDataErrors(form({ yearOfConstruction: '2026' }), YEAR).yearOfConstruction).toBeUndefined();
  });

  it('requires a living area above 0 and at most 10.000 m² (German decimal input)', () => {
    expect(propertyDataErrors(form({ livingAreaM2: '0' }), YEAR).livingAreaM2).toBeDefined();
    expect(propertyDataErrors(form({ livingAreaM2: '10.001' }), YEAR).livingAreaM2).toBeDefined();
    expect(propertyDataErrors(form({ livingAreaM2: '10.000' }), YEAR).livingAreaM2).toBeUndefined();
    expect(propertyDataErrors(form({ livingAreaM2: '72,5' }), YEAR).livingAreaM2).toBeUndefined();
  });

  it('rejects a malformed postal code but allows it to be empty', () => {
    expect(propertyDataErrors(form({ postalCode: '8033' }), YEAR).postalCode).toBeUndefined();
    expect(propertyDataErrors(form({ postalCode: '8033a' }), YEAR).postalCode).toBeDefined();
    expect(propertyDataErrors(form({ postalCode: '' }), YEAR).postalCode).toBeUndefined();
  });

  it('limits street and city to 100 characters', () => {
    const long = 'x'.repeat(101);
    expect(propertyDataErrors(form({ streetHouseNumber: long }), YEAR).streetHouseNumber).toBeDefined();
    expect(propertyDataErrors(form({ city: long }), YEAR).city).toBeDefined();
  });

  it('validates a portal link only when one is entered', () => {
    expect(propertyDataErrors(form({ sourceUrl: 'kein link' }), YEAR).sourceUrl).toBeDefined();
    expect(propertyDataErrors(form({ sourceUrl: 'www.immobilienscout24.de/expose/123' }), YEAR).sourceUrl).toBeUndefined();
  });

  it('treats every live error as blocking too, so "Weiter" is never enabled for a save that would fail', () => {
    const withBadPostalCode = form({ postalCode: '12a45' });
    expect(Object.keys(livePropertyDataErrors(withBadPostalCode, YEAR))).toContain('postalCode');
    expect(isPropertyDataValid(withBadPostalCode, YEAR)).toBe(false);
  });
});

describe('livePropertyDataErrors', () => {
  it('stays quiet about empty fields — a fresh form is not shown as wrong', () => {
    expect(livePropertyDataErrors(form({ city: '', yearOfConstruction: '', livingAreaM2: '', postalCode: '' }), YEAR)).toEqual({});
  });
});
