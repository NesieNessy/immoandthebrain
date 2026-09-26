// The add/edit form of Handwerkerleistungen as pure logic (no React, no I/O),
// so it can be unit-tested: form values ↔ a saved measure, and its price range.

import type { PropertyPricingContext } from '@/lib/api/renovationPricing';
import { CUSTOM_MEASURE, indicatePriceRange, normalizeRenovationCategory, RENOVATION_MEASURES, type RenovationCategory } from '@/lib/renovation/catalog';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { format, parseISO } from 'date-fns';

/** The add/edit form's fields ("Neue Maßnahme" / "Maßnahme bearbeiten"). */
export interface NewMeasureForm {
    category: RenovationCategory | '';
    /** A catalog measure, or CUSTOM_MEASURE for a free-text `customTitle`. */
    measure: string;
    customTitle: string;
    description: string;
    estimatedCost: string;
    quotedCost: string;
    preferredStartDate: Date | undefined;
    quotedStartDate: Date | undefined;
    actualCompletionDate: Date | undefined;
}

export const EMPTY_NEW_MEASURE: NewMeasureForm = { category: '', measure: '', customTitle: '', description: '', estimatedCost: '', quotedCost: '', preferredStartDate: undefined, quotedStartDate: undefined, actualCompletionDate: undefined };

/** The title the measure will be saved under ('' while none is chosen yet). */
export function newMeasureTitle(form: NewMeasureForm): string {
    return (form.measure === CUSTOM_MEASURE ? form.customTitle : form.measure).trim();
}

/** A date field's value as stored (local calendar day — toISOString() would
 *  shift a date picked after midnight back a day east of UTC). */
export function toDateValue(date: Date | undefined): string | null {
    return date ? format(date, 'yyyy-MM-dd') : null;
}

function toDate(value: string | null): Date | undefined {
    return value ? parseISO(value) : undefined;
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
        estimatedCost: measure.estimatedCost != null ? String(measure.estimatedCost) : '',
        quotedCost: measure.quotedCost != null ? String(measure.quotedCost) : '',
        preferredStartDate: toDate(measure.preferredStartDate),
        quotedStartDate: toDate(measure.quotedStartDate),
        actualCompletionDate: toDate(measure.actualCompletionDate),
    };
}

/** The price range a measure's slider spans: the one stored when it was
 *  added, else the catalog's for its category (older measures). */
export function measurePriceRange(measure: RenovationMeasure, context: PropertyPricingContext | null) {
    if (measure.budgetMin != null && measure.budgetMax != null) return { min: measure.budgetMin, max: measure.budgetMax };
    const category = normalizeRenovationCategory(measure.category);
    return category ? indicatePriceRange(category, measure.title, context ?? {}) : null;
}
