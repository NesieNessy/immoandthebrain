import { CUSTOM_MEASURE, RENOVATION_MEASURES } from '@/lib/renovation/catalog';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { describe, expect, it } from 'vitest';
import { EMPTY_NEW_MEASURE, formFromMeasure, measurePriceRange, newMeasurePriceRange, newMeasureTitle, toDateValue } from './measureForm';

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
    it('picks a catalog measure in the Maßnahme list and carries every field over', () => {
        const form = formFromMeasure(measure());
        expect(form).toMatchObject({
            category: 'SANITAER',
            measure: catalogMeasure,
            customTitle: '',
            description: 'Fliesen gerissen',
            estimatedCost: '12000',
            quotedCost: '',
        });
        expect(toDateValue(form.preferredStartDate)).toBe('2026-10-01');
        expect(form.quotedStartDate).toBeUndefined();
        expect(newMeasureTitle(form)).toBe(catalogMeasure);
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

describe('toDateValue', () => {
    it('stores the picked calendar day, not the UTC day', () => {
        expect(toDateValue(new Date(2026, 5, 1, 0, 30))).toBe('2026-06-01');
        expect(toDateValue(undefined)).toBeNull();
    });
});
