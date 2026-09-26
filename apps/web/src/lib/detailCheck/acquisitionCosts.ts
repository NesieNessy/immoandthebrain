export type StateCode =
  | 'BY' | 'BE' | 'HH' | 'HB' | 'SH' | 'MV' | 'BB' | 'ST'
  | 'TH' | 'SN' | 'NI' | 'NW' | 'HE' | 'RP' | 'SL' | 'BW';

/** Full state names, as a Bestandsobjekt stores its Bundesland. */
export const STATE_NAMES: Record<StateCode, string> = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg',
  HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland',
  SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

export interface AcquisitionCostInput {
  purchasePrice: number;
  parkingPurchasePrice: number;
  brokerPercent: number;
  livingAreaM2?: number | null;
  postalCode?: string | null;
  notaryPercent: number;
  landRegistryPercent: number;
  propertyTransferTaxPercent?: number | null;
}

export interface AcquisitionCostComputed {
  purchasePricePerM2: number | null;
  brokerAmount: number;
  notaryAmount: number;
  landRegistryAmount: number;
  propertyTransferTaxAmount: number;
  totalAdditionalCosts: number;
  totalCosts: number;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseDecimalInput(value: string): number {
  const trimmed = value.trim().replace(/\s/g, '');
  let normalized: string;

  if (trimmed.includes(',')) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    const dotParts = trimmed.split('.');
    const hasGermanThousandsGrouping = dotParts.length > 1
      && dotParts.slice(1).every((part) => /^\d{3}$/.test(part));
    normalized = hasGermanThousandsGrouping ? dotParts.join('') : trimmed;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDecimalInput(value: string, maximumFractionDigits = 2): string {
  if (!value.trim()) return '';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(parseDecimalInput(value));
}

/**
 * Approximate federal state from the postal code's first two digits. The
 * exact lookup is the `postal_code_state` table (lib/server/postalCodeState.ts);
 * this is only its fallback for a postal code the table doesn't list. PLZ
 * zones don't follow state borders exactly, so zones that straddle one
 * (14, 21, 27, 28, …) resolve to their predominant state here.
 */
export function resolveStateFromPostalCode(postalCode?: string | null): StateCode | null {
  if (!postalCode || !/^\d{5}$/.test(postalCode)) return null;
  const prefix = Number(postalCode.slice(0, 2));

  if (prefix >= 10 && prefix <= 14) return 'BE';
  if (prefix >= 20 && prefix <= 22) return 'HH';
  if (prefix === 27 || prefix === 28) return 'HB';
  if (prefix === 3 || prefix === 15 || prefix === 16) return 'BB';
  // 17–19 is Mecklenburg-Vorpommern. It used to be unreachable: the BB branch
  // above also claimed 17–19, so MV postal codes got Brandenburg's tax rate.
  if (prefix >= 17 && prefix <= 19) return 'MV';
  if (prefix >= 23 && prefix <= 25) return 'SH';
  if (prefix >= 26 && prefix <= 31) return 'NI';
  if (prefix >= 32 && prefix <= 33) return 'NW';
  if (prefix >= 34 && prefix <= 37) return 'HE';
  if (prefix >= 38 && prefix <= 39) return 'ST';
  if (prefix >= 40 && prefix <= 53) return 'NW';
  if (prefix >= 54 && prefix <= 56) return 'RP';
  if (prefix >= 57 && prefix <= 59) return 'NW';
  if (prefix >= 60 && prefix <= 65) return 'HE';
  if (prefix >= 66 && prefix <= 66) return 'SL';
  if (prefix >= 67 && prefix <= 69) return 'RP';
  if (prefix >= 70 && prefix <= 79) return 'BW';
  if (prefix >= 80 && prefix <= 97) return 'BY';
  if (prefix >= 98 && prefix <= 99) return 'TH';
  if (prefix === 6) return 'ST';
  if (prefix === 7) return 'TH';
  if (prefix === 1 || prefix === 2 || prefix === 4 || prefix === 8 || prefix === 9) return 'SN';

  return null;
}

const MAX_PRICE = 1_000_000_000;
const MAX_BROKER_PERCENT = 20;

export interface AcquisitionCostErrors {
  purchasePrice?: string;
  parkingPurchasePrice?: string;
  brokerPercent?: string;
}

/**
 * The Kaufkosten step's input rules — shared by the page (field messages,
 * "Weiter") and the API (rejecting a save), so both always agree. A purchase
 * price is required: a detail check started without an Ersteinschätzung has
 * none to take over, and every later step computes from it.
 */
export function acquisitionCostErrors(input: {
  purchasePrice: number;
  parkingPurchasePrice: number;
  brokerPercent: number;
}): AcquisitionCostErrors {
  const errors: AcquisitionCostErrors = {};
  if (!(input.purchasePrice > 0) || input.purchasePrice > MAX_PRICE) {
    errors.purchasePrice = 'Bitte einen Kaufpreis größer als 0 € eingeben (höchstens 1.000.000.000 €).';
  }
  if (!(input.parkingPurchasePrice >= 0) || input.parkingPurchasePrice > MAX_PRICE) {
    errors.parkingPurchasePrice = 'Bitte einen Betrag zwischen 0 und 1.000.000.000 eingeben.';
  }
  if (!(input.brokerPercent >= 0) || input.brokerPercent > MAX_BROKER_PERCENT) {
    errors.brokerPercent = 'Bitte einen Prozentsatz zwischen 0 und 20 eingeben.';
  }
  return errors;
}

export function computeAcquisitionCosts(input: AcquisitionCostInput): AcquisitionCostComputed {
  const purchasePrice = Math.max(0, input.purchasePrice || 0);
  const parkingPurchasePrice = Math.max(0, input.parkingPurchasePrice || 0);
  const base = purchasePrice + parkingPurchasePrice;
  const propertyTransferTaxPercent = input.propertyTransferTaxPercent ?? 0;

  const brokerAmount = roundCurrency(base * ((input.brokerPercent || 0) / 100));
  const notaryAmount = roundCurrency(base * ((input.notaryPercent || 0) / 100));
  const landRegistryAmount = roundCurrency(base * ((input.landRegistryPercent || 0) / 100));
  const propertyTransferTaxAmount = roundCurrency(base * (propertyTransferTaxPercent / 100));
  const totalAdditionalCosts = roundCurrency(
    brokerAmount + notaryAmount + landRegistryAmount + propertyTransferTaxAmount,
  );

  return {
    purchasePricePerM2:
      input.livingAreaM2 && input.livingAreaM2 > 0
        ? roundCurrency(purchasePrice / input.livingAreaM2)
        : null,
    brokerAmount,
    notaryAmount,
    landRegistryAmount,
    propertyTransferTaxAmount,
    totalAdditionalCosts,
    totalCosts: roundCurrency(base + totalAdditionalCosts),
  };
}
