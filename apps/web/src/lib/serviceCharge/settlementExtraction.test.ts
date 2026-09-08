import { describe, expect, it } from 'vitest';
import { mergeExtractedCostItems, normalizeLabel } from './settlementExtraction';

interface Row {
    id: number | null;
    label: string;
    allocable: boolean;
    actualAmount: string;
    budgetAmount: string;
}

const makeNew = (item: { label: string; allocable: boolean; actualAmount: number | null; budgetAmount: number | null }): Row => ({
    id: null,
    label: item.label,
    allocable: item.allocable,
    actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
    budgetAmount: item.budgetAmount != null ? String(item.budgetAmount) : '',
});

describe('normalizeLabel', () => {
    it('collapses casing, punctuation and whitespace differences', () => {
        expect(normalizeLabel('Wasserversorgung')).toBe(normalizeLabel(' wasserversorgung ! '));
        expect(normalizeLabel('Sach- / Haftpflichtversicherung')).toBe(normalizeLabel('Sach / Haftpflichtversicherung'));
    });
});

describe('mergeExtractedCostItems', () => {
    it('updates an existing row in place when the label matches, preserving its id', () => {
        const current: Row[] = [
            { id: 5, label: 'Wasserversorgung', allocable: true, actualAmount: '', budgetAmount: '' },
        ];
        const merged = mergeExtractedCostItems(current, [
            { label: 'wasserversorgung', allocable: true, actualAmount: 380, budgetAmount: 400 },
        ], makeNew);

        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ id: 5, actualAmount: '380', budgetAmount: '400' });
    });

    it('appends a new row for an unmatched label', () => {
        const current: Row[] = [
            { id: 1, label: 'Grundsteuer', allocable: true, actualAmount: '', budgetAmount: '' },
        ];
        const merged = mergeExtractedCostItems(current, [
            { label: 'Kabelanschluss', allocable: true, actualAmount: 120, budgetAmount: null },
        ], makeNew);

        expect(merged).toHaveLength(2);
        expect(merged[1]).toMatchObject({ id: null, label: 'Kabelanschluss', actualAmount: '120', budgetAmount: '' });
    });

    it('keeps the existing amount when the extracted value is null', () => {
        const current: Row[] = [
            { id: 2, label: 'Heizung', allocable: true, actualAmount: '1450', budgetAmount: '1500' },
        ];
        const merged = mergeExtractedCostItems(current, [
            { label: 'Heizung', allocable: true, actualAmount: null, budgetAmount: null },
        ], makeNew);

        expect(merged[0]).toMatchObject({ actualAmount: '1450', budgetAmount: '1500' });
    });
});
