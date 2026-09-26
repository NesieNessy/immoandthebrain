import { indicatePriceRange, type PriceIndicationContext, type RenovationCategory } from '@/lib/renovation/catalog';
import { roundCurrency } from './acquisitionCosts';

// The catalog (categories, measures, price indication) lives in
// lib/renovation/catalog.ts, shared with the Handwerkerleistungen; this file
// holds the Detailbewertung's own case model on top of it.

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

/**
 * `regionFactor` is resolved by the caller from the `renovation_region_factor`
 * table (see lib/server/renovationRegionFactor.ts) and passed in as a plain
 * number. That keeps this function pure: it also runs in the browser when a
 * measure is added, where there is no database to ask.
 */
export function evaluateRenovationCases(args: { cases: RenovationCase[] } & PriceIndicationContext) {
  return args.cases.map((item) => {
    const range = indicatePriceRange(item.kategorie, item.massnahme, args);

    return {
      ...item,
      selected: item.selected ?? true,
      zeitpunkt: item.zeitpunkt ?? 'SOFORT',
      publish_order: item.publish_order ?? false,
      ai: {
        summary: `${item.massnahme}: erste Kostenspanne auf Basis von Kategorie, Wohnfläche und PLZ-Regionalfaktor.`,
        price_min: range.min,
        price_max: range.max,
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
