import { isValidListingUrl, LISTING_URL_ERROR } from '@/lib/listingUrl';
import { parseDecimalInput } from './acquisitionCosts';

/** The Objektdaten form fields that are validated (all as typed, i.e. strings). */
export interface PropertyDataForm {
  propertyCategory: string;
  tenancyType: string;
  sourceUrl: string;
  streetHouseNumber: string;
  postalCode: string;
  city: string;
  yearOfConstruction: string;
  livingAreaM2: string;
}

export type PropertyDataErrors = Partial<Record<keyof PropertyDataForm, string>>;

const MAX_TEXT_LENGTH = 100;
const MIN_YEAR = 1000;
const MAX_LIVING_AREA_M2 = 10_000;

function yearError(value: string, currentYear: number): string | null {
  const year = Number(value);
  return !Number.isInteger(year) || year < MIN_YEAR || year > currentYear
    ? `Baujahr muss zwischen ${MIN_YEAR} und ${currentYear} liegen.`
    : null;
}

function livingAreaError(value: string): string | null {
  const livingArea = parseDecimalInput(value);
  return livingArea <= 0 || livingArea > MAX_LIVING_AREA_M2
    ? 'Wohnfläche muss größer als 0 und maximal 10.000 sein.'
    : null;
}

/**
 * Errors shown while typing — only for fields that already hold a value, so
 * an untouched form isn't covered in red before the user has entered anything.
 */
export function livePropertyDataErrors(form: PropertyDataForm, currentYear: number): PropertyDataErrors {
  const errors: PropertyDataErrors = {};
  if (form.streetHouseNumber.length > MAX_TEXT_LENGTH) errors.streetHouseNumber = 'Maximal 100 Zeichen.';
  if (form.postalCode && !/^\d{4,5}$/.test(form.postalCode)) errors.postalCode = 'Bitte 4 bis 5 Ziffern eingeben.';
  if (form.city.length > MAX_TEXT_LENGTH) errors.city = 'Maximal 100 Zeichen.';
  if (form.yearOfConstruction) {
    const error = yearError(form.yearOfConstruction, currentYear);
    if (error) errors.yearOfConstruction = error;
  }
  if (form.livingAreaM2) {
    const error = livingAreaError(form.livingAreaM2);
    if (error) errors.livingAreaM2 = error;
  }
  return errors;
}

/** Everything that blocks saving: the live checks plus the mandatory fields. */
export function propertyDataErrors(form: PropertyDataForm, currentYear: number): PropertyDataErrors {
  const errors = livePropertyDataErrors(form, currentYear);
  if (!form.propertyCategory) errors.propertyCategory = 'Bitte wählen Sie eine Objektkategorie.';
  if (!form.tenancyType) errors.tenancyType = 'Bitte wählen Sie eine Miet-/Nutzungsart.';
  // Same rule as the Ersteinschätzung's Portal-URL: a link typed without
  // "https://" counts as valid (SCRUM-102).
  if (form.sourceUrl.trim() && !isValidListingUrl(form.sourceUrl)) errors.sourceUrl = LISTING_URL_ERROR;
  if (!form.city.trim()) errors.city = 'Ort ist ein Pflichtfeld.';
  const year = yearError(form.yearOfConstruction, currentYear);
  if (year) errors.yearOfConstruction = year;
  const livingArea = livingAreaError(form.livingAreaM2);
  if (livingArea) errors.livingAreaM2 = livingArea;
  return errors;
}

export function isPropertyDataValid(form: PropertyDataForm, currentYear: number): boolean {
  return Object.keys(propertyDataErrors(form, currentYear)).length === 0;
}
