import { roundCurrency } from '@/lib/detailCheck/acquisitionCosts';

/**
 * The renovation catalog — categories, their standard measures, and the
 * rule-of-thumb price indication for each. Single source for both the
 * Detailbewertung's Sanierungskosten step and the Handwerkerleistungen of an
 * existing property, so a measure is named, categorised and priced the same
 * way in both places.
 */

export type RenovationCategory =
  | 'ENERGETISCH'
  | 'SANITAER'
  | 'WOHNWERT'
  | 'BARRIEREFREIHEIT'
  | 'TECHNIK_SICHERHEIT'
  | 'AUSSEN'
  | 'SONSTIGES';

export const RENOVATION_CATEGORIES: { value: RenovationCategory; label: string }[] = [
  { value: 'ENERGETISCH', label: 'Energetisch' },
  { value: 'SANITAER', label: 'Sanitär' },
  { value: 'WOHNWERT', label: 'Wohnraum' },
  { value: 'BARRIEREFREIHEIT', label: 'Barrierefreiheit' },
  { value: 'TECHNIK_SICHERHEIT', label: 'Technik / Sicherheit' },
  { value: 'AUSSEN', label: 'Außen' },
  { value: 'SONSTIGES', label: 'Sonstiges' },
];

/** Maßnahme option that switches to a free-text title (RenovationMeasurePicker's `allowCustom`). */
export const CUSTOM_MEASURE = '__custom__';

export const RENOVATION_MEASURES: Record<RenovationCategory, string[]> = {
  ENERGETISCH: [
    'Fassadendämmung',
    'Dachdämmung',
    'Fenster erneuern (3-fach-Verglasung)',
    'Türen abdichten / Austausch Eingangstür',
    'Heizungsmodernisierung / Wärmepumpe',
    'Solar- / PV-Anlage',
    'Dämmung Kellerdecke',
    'Thermostatventile / Smart Heating',
    'Dämmung Heizkörpernischen',
  ],
  SANITAER: [
    'Neue Wasserleitungen (Verbundrohr)',
    'Zentrale Warmwasserversorgung',
    'Austausch Durchlauferhitzer',
    'Wassersparende Armaturen',
    'Badsanierung komplett',
  ],
  WOHNWERT: [
    'Küchensanierung (Installationen, Fliesen, Anschlüsse)',
    'Neue Bodenbeläge (Parkett/Vinyl)',
    'Neue Innentüren',
    'Abgehängte Decke + Spots',
    'Neue Elektroverteilung / FI-Schalter',
    'Mehr Steckdosen / Stromkreise',
    'LAN / Glasfaser / Medienanschluss',
    'Video-Gegensprechanlage',
    'Smart-Home-Systeme',
    'Wohnungseingangstür (Sicherheitsklasse)',
    'Fußbodenheizung einbauen',
  ],
  BARRIEREFREIHEIT: [
    'Ebenerdige Dusche statt Wanne',
    'Türverbreiterung',
    'Schwellenfreie Übergänge',
    'Halte- und Stützgriffe',
    'Treppenlift / Aufzug',
  ],
  TECHNIK_SICHERHEIT: [
    'Rauchmelder / CO-Melder',
    'Alarmanlage / Einbruchschutz',
    'Sicherheitsbeschläge / Panzerriegel',
  ],
  AUSSEN: [
    'Balkonsanierung',
    'Neuer Balkon / Anbau',
    'Fassadenanstrich',
    'Dachsanierung',
    'Treppenhausmodernisierung',
    'Kellerabdichtung',
    'Garten- / Hofgestaltung',
    'Neuer Müllplatz / Fahrradraum',
  ],
  SONSTIGES: [
    'Schallschutzfenster',
    'Wintergarten / Loggiaausbau',
    'Kellerdämmung / Abdichtung',
    'Neue Dachfenster / Belichtung',
    'Hausanschluss Glasfaser / Breitband',
  ],
};

const BASE_PRICES: Record<string, { min: number; max: number }> = {
  'Fassadendämmung': { min: 18000, max: 42000 },
  'Dachdämmung': { min: 9000, max: 26000 },
  'Fenster erneuern (3-fach-Verglasung)': { min: 8000, max: 18000 },
  'Türen abdichten / Austausch Eingangstür': { min: 1500, max: 6500 },
  'Heizungsmodernisierung / Wärmepumpe': { min: 18000, max: 42000 },
  'Solar- / PV-Anlage': { min: 12000, max: 28000 },
  'Dämmung Kellerdecke': { min: 3500, max: 9500 },
  'Thermostatventile / Smart Heating': { min: 600, max: 2200 },
  'Dämmung Heizkörpernischen': { min: 800, max: 2800 },
  'Neue Wasserleitungen (Verbundrohr)': { min: 4500, max: 12000 },
  'Zentrale Warmwasserversorgung': { min: 3500, max: 11000 },
  'Austausch Durchlauferhitzer': { min: 700, max: 2500 },
  'Wassersparende Armaturen': { min: 300, max: 1500 },
  'Badsanierung komplett': { min: 12000, max: 28000 },
  'Küchensanierung (Installationen, Fliesen, Anschlüsse)': { min: 5000, max: 18000 },
  'Neue Bodenbeläge (Parkett/Vinyl)': { min: 4500, max: 14500 },
  'Neue Innentüren': { min: 1800, max: 7000 },
  'Abgehängte Decke + Spots': { min: 2500, max: 9000 },
  'Neue Elektroverteilung / FI-Schalter': { min: 3500, max: 12000 },
  'Mehr Steckdosen / Stromkreise': { min: 1200, max: 5000 },
  'LAN / Glasfaser / Medienanschluss': { min: 900, max: 4500 },
  'Video-Gegensprechanlage': { min: 600, max: 2800 },
  'Smart-Home-Systeme': { min: 1500, max: 8500 },
  'Wohnungseingangstür (Sicherheitsklasse)': { min: 1800, max: 6000 },
  'Fußbodenheizung einbauen': { min: 9000, max: 25000 },
  'Ebenerdige Dusche statt Wanne': { min: 4500, max: 13000 },
  'Türverbreiterung': { min: 1200, max: 6000 },
  'Schwellenfreie Übergänge': { min: 900, max: 4500 },
  'Halte- und Stützgriffe': { min: 250, max: 1200 },
  'Treppenlift / Aufzug': { min: 7000, max: 35000 },
  'Rauchmelder / CO-Melder': { min: 150, max: 900 },
  'Alarmanlage / Einbruchschutz': { min: 1200, max: 7000 },
  'Sicherheitsbeschläge / Panzerriegel': { min: 500, max: 2800 },
  'Balkonsanierung': { min: 6000, max: 22000 },
  'Neuer Balkon / Anbau': { min: 18000, max: 55000 },
  'Fassadenanstrich': { min: 6000, max: 20000 },
  'Dachsanierung': { min: 18000, max: 60000 },
  'Treppenhausmodernisierung': { min: 6000, max: 24000 },
  'Kellerabdichtung': { min: 8000, max: 28000 },
  'Garten- / Hofgestaltung': { min: 2500, max: 18000 },
  'Neuer Müllplatz / Fahrradraum': { min: 2500, max: 12000 },
  'Schallschutzfenster': { min: 9000, max: 22000 },
  'Wintergarten / Loggiaausbau': { min: 18000, max: 50000 },
  'Kellerdämmung / Abdichtung': { min: 6000, max: 24000 },
  'Neue Dachfenster / Belichtung': { min: 3000, max: 12000 },
  'Hausanschluss Glasfaser / Breitband': { min: 800, max: 4500 },
};

/** Range used for a measure that isn't in the catalog (e.g. a free-text one). */
const FALLBACK_PRICE = { min: 2500, max: 12000 };

/**
 * Handwerkerleistungen used their own category list before sharing this
 * catalog; rows saved back then still carry those labels. They map onto the
 * nearest catalog category so they keep a label and a price indication.
 */
const LEGACY_CATEGORIES: Record<string, RenovationCategory> = {
  Badezimmer: 'SANITAER',
  Fenster: 'ENERGETISCH',
  Fußboden: 'WOHNWERT',
  Elektrik: 'WOHNWERT',
  Dach: 'AUSSEN',
  Heizung: 'ENERGETISCH',
  Fassade: 'AUSSEN',
  Küche: 'WOHNWERT',
  Sonstige: 'SONSTIGES',
};

function isRenovationCategory(value: string): value is RenovationCategory {
  return RENOVATION_CATEGORIES.some((item) => item.value === value);
}

/** A catalog category for a stored value (catalog code or legacy label), or null. */
export function normalizeRenovationCategory(value: string | null | undefined): RenovationCategory | null {
  if (!value) return null;
  if (isRenovationCategory(value)) return value;
  return LEGACY_CATEGORIES[value] ?? null;
}

/** Display label for a stored category; unknown values are shown as-is. */
export function categoryLabel(value: string | null | undefined): string {
  if (!value) return '';
  const category = normalizeRenovationCategory(value);
  return RENOVATION_CATEGORIES.find((item) => item.value === category)?.label ?? value;
}

export function isCatalogMeasure(measure: string): boolean {
  return measure in BASE_PRICES;
}

export interface PriceIndicationContext {
  /** Resolved from `renovation_region_factor` (see lib/server/renovationRegionFactor.ts). */
  regionFactor?: number | null;
  livingAreaM2?: number | null;
}

/**
 * Rule-of-thumb cost range for one measure: its base price, scaled by the
 * PLZ regional factor and — for measures whose cost grows with the flat
 * (energetic, exterior, living-space work) — by the living area. Pure, so it
 * runs in the browser too, where there is no database to ask.
 */
export function indicatePriceRange(
  category: string | null | undefined,
  measure: string,
  context: PriceIndicationContext = {},
): { min: number; max: number } {
  const factor = context.regionFactor && context.regionFactor > 0 ? context.regionFactor : 1;
  const areaFactor = context.livingAreaM2 && context.livingAreaM2 > 0
    ? Math.max(0.8, Math.min(1.45, context.livingAreaM2 / 80))
    : 1;
  const normalized = normalizeRenovationCategory(category);
  const scale = normalized === 'ENERGETISCH' || normalized === 'AUSSEN' || normalized === 'WOHNWERT'
    ? areaFactor
    : 1;
  const base = BASE_PRICES[measure] ?? FALLBACK_PRICE;
  const min = roundCurrency(base.min * factor * scale);
  const max = roundCurrency(base.max * factor * scale);
  return { min, max: Math.max(min, max) };
}

export function midpoint(range: { min: number; max: number }): number {
  return roundCurrency((range.min + range.max) / 2);
}
