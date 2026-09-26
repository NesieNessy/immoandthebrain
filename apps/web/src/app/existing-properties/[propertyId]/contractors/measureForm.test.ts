import { CUSTOM_MEASURE, RENOVATION_MEASURES } from '@/lib/renovation/catalog';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { describe, expect, it } from 'vitest';
import {
    distributeEstimates,
    EMPTY_NEW_MEASURE,
    formFromMeasure,
    measurePriceRange,
    newMeasurePriceRange,
    newMeasureTitle,
    planSlider,
    toDateValue,
} from './measureForm';

const catalogMeasure = RENOVATION_MEASURES.SANITAER[0];

function measure(overrides: Partial<RenovationMeasure> = {}): RenovationMeasure {
    return {
        renovationMeasureId: 1,
        propertyId: 1,
        sortOrder: 0,
        title: catalogMeasure,
        category: 'SANITAER',
        description: 'Fliesen gerissen',
        estimatedCost: 12000,
        quotedCost: null,
        budgetMin: null,
        budgetMax: null,
        preferredStartDate: '2026-10-01',
        quotedStartDate: null,
        actualCompletionDate: null,
        published: false,
        publishedAt: null,
        quoteAccepted: false,
        craftsmanConfirmedCompleted: false,
        customerConfirmedCompleted: false,
        craftsmanNotes: null,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    } as RenovationMeasure;
}

describe('formFromMeasure ("Bearbeiten")', () => {
    it('picks a catalog measure in the Maßnahme list and carries what the measure is over', () => {
        // Costs and dates are not part of the form — they're edited in "Kosten & Termine".
        expect(formFromMeasure(measure())).toEqual({
            category: 'SANITAER',
            measure: catalogMeasure,
            customTitle: '',
            description: 'Fliesen gerissen',
        });
        expect(newMeasureTitle(formFromMeasure(measure()))).toBe(catalogMeasure);
    });

    it('shows a title the catalog does not list as "Andere Maßnahme…" with its Bezeichnung', () => {
        const form = formFromMeasure(measure({ title: 'Treppenhaus streichen', category: 'SONSTIGES' }));
        expect(form.measure).toBe(CUSTOM_MEASURE);
        expect(form.customTitle).toBe('Treppenhaus streichen');
        expect(newMeasureTitle(form)).toBe('Treppenhaus streichen');
    });

    it('keeps a measure without category editable by its title', () => {
        const form = formFromMeasure(measure({ title: 'Altbau-Maßnahme', category: null }));
        expect(form.category).toBe('');
        expect(form.customTitle).toBe('Altbau-Maßnahme');
    });
});

describe('price ranges', () => {
    it('a saved measure keeps the range stored when it was added', () => {
        expect(measurePriceRange(measure({ budgetMin: 5000, budgetMax: 9000 }), null)).toEqual({ min: 5000, max: 9000 });
    });

    it('an older measure without stored range is priced from the catalog; a custom one has none', () => {
        expect(measurePriceRange(measure(), null)).toEqual(newMeasurePriceRange({ ...EMPTY_NEW_MEASURE, category: 'SANITAER', measure: catalogMeasure }, null));
        expect(measurePriceRange(measure({ category: null }), null)).toBeNull();
        expect(newMeasurePriceRange({ ...EMPTY_NEW_MEASURE, category: 'SONSTIGES', measure: CUSTOM_MEASURE, customTitle: 'X' }, null)).toBeNull();
    });
});

describe('plan-wide price slider ("Mit welchem Preis möchtest du weiterrechnen?")', () => {
    const ranges: Record<number, { min: number; max: number } | null> = { 1: { min: 1000, max: 3000 }, 2: { min: 4000, max: 8000 }, 3: null, 4: { min: 500, max: 900 } };
    const rangeOf = (m: RenovationMeasure) => ranges[m.renovationMeasureId];
    const plan = [
        measure({ renovationMeasureId: 1, estimatedCost: 2500 }),
        measure({ renovationMeasureId: 2, estimatedCost: null }),
        measure({ renovationMeasureId: 3, estimatedCost: 700 }), // free text: no range
        measure({ renovationMeasureId: 4, estimatedCost: 900, quoteAccepted: true }), // commissioned: locked
    ];

    it('spans the summed ranges of the priced, not yet commissioned measures', () => {
        // 2.500 + midpoint 6.000 (no estimate yet)
        expect(planSlider(plan, rangeOf)).toEqual({ min: 5000, max: 11000, value: 8500, measureIds: [1, 2] });
    });

    it('moves each of them to the same point of its own range', () => {
        expect(distributeEstimates(plan, rangeOf, 5000)).toEqual(new Map([[1, 1000], [2, 4000]]));
        expect(distributeEstimates(plan, rangeOf, 11000)).toEqual(new Map([[1, 3000], [2, 8000]]));
        // halfway: 2.000 + 6.000 = 8.000
        expect(distributeEstimates(plan, rangeOf, 8000)).toEqual(new Map([[1, 2000], [2, 6000]]));
        // out of range is clamped
        expect(distributeEstimates(plan, rangeOf, 99999)).toEqual(new Map([[1, 3000], [2, 8000]]));
    });

    it('is not offered when no measure can be moved', () => {
        expect(planSlider([plan[2], plan[3]], rangeOf)).toBeNull();
        expect(distributeEstimates([plan[2], plan[3]], rangeOf, 1000).size).toBe(0);
    });
});

describe('toDateValue', () => {
    it('stores the picked calendar day, not the UTC day', () => {
        expect(toDateValue(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01');
        expect(toDateValue(undefined)).toBeNull();
    });
});
