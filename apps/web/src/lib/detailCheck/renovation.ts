import { roundCurrency } from './acquisitionCosts';

export type RenovationCategory =
  | 'ENERGETISCH'
  | 'SANITAER'
  | 'WOHNWERT'
  | 'BARRIEREFREIHEIT'
  | 'TECHNIK_SICHERHEIT'
  | 'AUSSEN'
  | 'SONSTIGES';

export type RenovationTiming = 'SOFORT' | 'FLEXIBEL';
export type RenovationFinancingMode = 'FREMD' | 'EIGEN' | 'TEILWEISE';

export type RenovationCase = {
  id: string;
  kategorie: RenovationCategory;
  massnahme: string;
  beschreibung?: string;
  uploads?: string[];
  ai?: {
    summary: string;
    price_min: number;
    price_max: number;
    confidence: number;
    source: 'AI' | 'FALLBACK';
  };
  selected: boolean;
  zeitpunkt: RenovationTiming;
  cost_selected?: number;
  calculator_effective_yyyymm?: string;
  publish_order: boolean;
};

export const RENOVATION_CATEGORIES: { value: RenovationCategory; label: string }[] = [
  { value: 'ENERGETISCH', label: 'Energetisch' },
  { value: 'SANITAER', label: 'Sanitär' },
  { value: 'WOHNWERT', label: 'Wohnraum' },
  { value: 'BARRIEREFREIHEIT', label: 'Barrierefreiheit' },
  { value: 'TECHNIK_SICHERHEIT', label: 'Technik / Sicherheit' },
  { value: 'AUSSEN', label: 'Außen' },
  { value: 'SONSTIGES', label: 'Sonstiges' },
];

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

export function categoryLabel(category: RenovationCategory): string {
  return RENOVATION_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

/**
 * `regionFactor` is resolved by the caller from the `renovation_region_factor`
 * table (see lib/server/renovationRegionFactor.ts) and passed in as a plain
 * number. That keeps this function pure: it also runs in the browser when a
 * measure is added, where there is no database to ask.
 */
export function evaluateRenovationCases(args: {
  cases: RenovationCase[];
  regionFactor?: number | null;
  livingAreaM2?: number | null;
}) {
  const factor = args.regionFactor && args.regionFactor > 0 ? args.regionFactor : 1;
  const areaFactor = args.livingAreaM2 && args.livingAreaM2 > 0
    ? Math.max(0.8, Math.min(1.45, args.livingAreaM2 / 80))
    : 1;

  return args.cases.map((item) => {
    const base = BASE_PRICES[item.massnahme] ?? { min: 2500, max: 12000 };
    const scale = item.kategorie === 'ENERGETISCH' || item.kategorie === 'AUSSEN' || item.kategorie === 'WOHNWERT'
      ? areaFactor
      : 1;
    const priceMin = roundCurrency(base.min * factor * scale);
    const priceMax = roundCurrency(base.max * factor * scale);

    return {
      ...item,
      selected: item.selected ?? true,
      zeitpunkt: item.zeitpunkt ?? 'SOFORT',
      publish_order: item.publish_order ?? false,
      ai: {
        summary: `${item.massnahme}: erste Kostenspanne auf Basis von Kategorie, Wohnfläche und PLZ-Regionalfaktor.`,
        price_min: priceMin,
        price_max: Math.max(priceMin, priceMax),
        confidence: 0.62,
        source: 'FALLBACK' as const,
      },
    };
  });
}

export function aggregateRenovationPricing(cases: RenovationCase[]) {
  const selected = cases.filter((item) => item.selected && item.ai);
  const sumMin = roundCurrency(selected.reduce((sum, item) => sum + (item.ai?.price_min ?? 0), 0));
  const sumMax = roundCurrency(selected.reduce((sum, item) => sum + (item.ai?.price_max ?? 0), 0));
  return {
    sum_min: sumMin,
    sum_max: sumMax,
    sum_mid: roundCurrency((sumMin + sumMax) / 2),
  };
}

/**
 * Gives every priced case a `cost_selected`, defaulting to the midpoint of its
 * indicated range. `cost_selected` is the single source of truth for what a
 * measure costs — the total is derived from it, never the other way round.
 *
 * Cases that are currently unselected keep their amount instead of being reset
 * to 0: unticking a measure means "leave it out of the total for now", not
 * "throw away the price I entered". Re-ticking it must restore what the user
 * had, which is what previously got lost.
 */
export function withDefaultSelectedCosts(cases: RenovationCase[]): RenovationCase[] {
  return cases.map((item) => {
    if (!item.ai || typeof item.cost_selected === 'number') return item;
    return { ...item, cost_selected: roundCurrency((item.ai.price_min + item.ai.price_max) / 2) };
  });
}

/** Total of the ticked measures — the figure the financing and the calculator use. */
export function sumSelectedCosts(cases: RenovationCase[]): number {
  return roundCurrency(
    cases
      .filter((item) => item.selected && item.ai)
      .reduce((sum, item) => sum + costForCase(item), 0),
  );
}

/**
 * Moves the whole plan to a common point in each measure's own indicated band,
 * so the slider endpoints land exactly on the aggregate minimum and maximum:
 * t=0 puts every measure at its `price_min`, t=1 at its `price_max`.
 *
 * This deliberately overwrites individually entered amounts — dragging the
 * overall slider is a statement about the plan as a whole. Editing a single
 * amount afterwards refines it again; the two controls are complementary, and
 * whichever was used last wins.
 */
export function distributeTotalAcrossCases(
  cases: RenovationCase[],
  targetTotal: number,
): RenovationCase[] {
  const selected = cases.filter((item) => item.selected && item.ai);
  const sumMin = selected.reduce((sum, item) => sum + (item.ai?.price_min ?? 0), 0);
  const sumMax = selected.reduce((sum, item) => sum + (item.ai?.price_max ?? 0), 0);
  const span = sumMax - sumMin;
  const ratio = span <= 0 ? 0 : Math.max(0, Math.min(1, (targetTotal - sumMin) / span));

  return cases.map((item) => {
    if (!item.selected || !item.ai) return item;
    return {
      ...item,
      cost_selected: roundCurrency(item.ai.price_min + (item.ai.price_max - item.ai.price_min) * ratio),
    };
  });
}

export function costForCase(item: RenovationCase): number {
  if (typeof item.cost_selected === 'number') return roundCurrency(item.cost_selected);
  if (!item.ai) return 0;
  return roundCurrency((item.ai.price_min + item.ai.price_max) / 2);
}
