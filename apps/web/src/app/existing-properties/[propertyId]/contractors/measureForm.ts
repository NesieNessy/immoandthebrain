// The add/edit form of Handwerkerleistungen as pure logic (no React, no I/O),
// so it can be unit-tested: form values ↔ a saved measure, its price range,
// and the plan-wide price slider of "Kosten & Termine".

import type { PropertyPricingContext } from '@/lib/api/renovationPricing';
import { roundCurrency } from '@/lib/detailCheck/acquisitionCosts';
import { CUSTOM_MEASURE, indicatePriceRange, normalizeRenovationCategory, RENOVATION_MEASURES, type RenovationCategory } from '@/lib/renovation/catalog';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { format } from 'date-fns';

/**
 * The add/edit form's fields ("Neue Maßnahme" / "Maßnahme bearbeiten") — what
 * the measure is, like Sanierung's form. Costs and dates are entered in
 * "Kosten & Termine".
 */
export interface NewMeasureForm {
    category: RenovationCategory | '';
    /** A catalog measure, or CUSTOM_MEASURE for a free-text `customTitle`. */
    measure: string;
    customTitle: string;
    description: string;
}

export const EMPTY_NEW_MEASURE: NewMeasureForm = { category: '', measure: '', customTitle: '', description: '' };

/** The title the measure will be saved under ('' while none is chosen yet). */
export function newMeasureTitle(form: NewMeasureForm): string {
    return (form.measure === CUSTOM_MEASURE ? form.customTitle : form.measure).trim();
}

/** A date field's value as stored (local calendar day — toISOString() would
 *  shift a date picked after midnight back a day east of UTC). */
export function toDateValue(date: Date | undefined): string | null {
    return date ? format(date, 'yyyy-MM-dd') : null;
}

/** Catalog price range for the form's measure — null for a free-text one. */
export function newMeasurePriceRange(form: NewMeasureForm, context: PropertyPricingContext | null) {
    if (!form.category || !form.measure || form.measure === CUSTOM_MEASURE) return null;
    return indicatePriceRange(form.category, form.measure, context ?? {});
}

/** A saved measure as form values, for "Bearbeiten". A title the catalog
 *  doesn't list for its category is a free-text one. */
export function formFromMeasure(measure: RenovationMeasure): NewMeasureForm {
    const category = normalizeRenovationCategory(measure.category) ?? '';
    const inCatalog = category !== '' && RENOVATION_MEASURES[category].includes(measure.title);
    return {
        category,
        measure: inCatalog ? measure.title : category ? CUSTOM_MEASURE : '',
        customTitle: inCatalog ? '' : measure.title,
        description: measure.description ?? '',
    };
}

type PriceRange = { min: number; max: number };

/** The price range of a measure: the one stored when it was added, else the
 *  catalog's for its category (older measures); none for a free-text one. */
export function measurePriceRange(measure: RenovationMeasure, context: PropertyPricingContext | null): PriceRange | null {
    if (measure.budgetMin != null && measure.budgetMax != null) return { min: measure.budgetMin, max: measure.budgetMax };
    const category = normalizeRenovationCategory(measure.category);
    return category ? indicatePriceRange(category, measure.title, context ?? {}) : null;
}

export interface PlanSlider {
    min: number;
    max: number;
    /** Current total of "Kosten veranschlagt" over the measures the slider moves. */
    value: number;
    /** The measures it moves: priced ones that aren't commissioned (locked) yet. */
    measureIds: number[];
}

/**
 * "Mit welchem Preis möchtest du weiterrechnen?" over all measures — as in
 * Sanierung (distributeTotalAcrossCases): its ends are the summed minimum and
 * maximum of the price ranges. Null when no measure can be moved.
 */
export function planSlider(measures: RenovationMeasure[], rangeOf: (m: RenovationMeasure) => PriceRange | null): PlanSlider | null {
    const movable = measures.filter((m) => !m.quoteAccepted && rangeOf(m) != null);
    if (movable.length === 0) return null;
    const ranges = movable.map((m) => rangeOf(m)!);
    const min = roundCurrency(ranges.reduce((sum, r) => sum + r.min, 0));
    const max = roundCurrency(ranges.reduce((sum, r) => sum + r.max, 0));
    // A measure without an estimate yet counts with its range's midpoint.
    const value = roundCurrency(movable.reduce((sum, m, i) => sum + (m.estimatedCost ?? (ranges[i].min + ranges[i].max) / 2), 0));
    return { min, max, value, measureIds: movable.map((m) => m.renovationMeasureId) };
}

/**
 * Moves every movable measure to the same point of its own range, so the
 * total lands on `target`: at the minimum all are at their range minimum, at
 * the maximum all at their maximum. Returns the new "Kosten veranschlagt" per
 * measure id. Overwrites individually entered amounts on purpose — dragging
 * the slider is a statement about the plan as a whole (as in Sanierung).
 */
export function distributeEstimates(
    measures: RenovationMeasure[],
    rangeOf: (m: RenovationMeasure) => PriceRange | null,
    target: number,
): Map<number, number> {
    const slider = planSlider(measures, rangeOf);
    const result = new Map<number, number>();
    if (!slider) return result;
    const span = slider.max - slider.min;
    const ratio = span <= 0 ? 0 : Math.max(0, Math.min(1, (target - slider.min) / span));
    for (const m of measures) {
        if (!slider.measureIds.includes(m.renovationMeasureId)) continue;
        const range = rangeOf(m)!;
        result.set(m.renovationMeasureId, roundCurrency(range.min + (range.max - range.min) * ratio));
    }
    return result;
}
