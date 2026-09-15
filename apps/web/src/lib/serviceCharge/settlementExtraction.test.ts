import { describe, expect, it } from 'vitest';
import { mergeExtractedCostItems, normalizeLabel, type ExtractedCostItem } from './settlementExtraction';

describe('normalizeLabel', () => {
    it('lowercases and trims', () => {
        expect(normalizeLabel('  Wasserversorgung  ')).toBe('wasserversorgung');
    });

    it('collapses punctuation and whitespace into single spaces', () => {
        expect(normalizeLabel('Müllabfuhr / Entsorgung')).toBe('müllabfuhr entsorgung');
    });

    it('collapses repeated whitespace', () => {
        expect(normalizeLabel('Grundsteuer   B')).toBe('grundsteuer b');
    });

    it('preserves German umlauts and ß', () => {
        expect(normalizeLabel('Straßenreinigung')).toBe('straßenreinigung');
        expect(normalizeLabel('Wärmeversorgung')).toBe('wärmeversorgung');
    });

    it('treats differently-punctuated near-duplicates as equal', () => {
        expect(normalizeLabel('Wasser')).not.toBe(normalizeLabel('Wasserversorgung'));
        expect(normalizeLabel('Sach- und Haftpflichtversicherung')).toBe(normalizeLabel('Sach- Und Haftpflichtversicherung  '));
    });
});

interface Row {
    id: number | null;
    label: string;
    allocable: boolean;
    actualAmount: string;
    budgetAmount: string;
}

function makeNew(item: ExtractedCostItem): Row {
    return { id: null, label: item.label, allocable: item.allocable, actualAmount: item.actualAmount != null ? String(item.actualAmount) : '', budgetAmount: item.budgetAmount != null ? String(item.budgetAmount) : '' };
}

describe('mergeExtractedCostItems', () => {
    it('updates a matching row in place by normalized label, preserving its id', () => {
        const current: Row[] = [{ id: 7, label: 'Wasserversorgung', allocable: true, actualAmount: '100', budgetAmount: '110' }];
        const extracted: ExtractedCostItem[] = [{ label: 'wasserversorgung', allocable: true, actualAmount: 250, budgetAmount: 260 }];
        const result = mergeExtractedCostItems(current, extracted, makeNew);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(7);
        expect(result[0].actualAmount).toBe('250');
        expect(result[0].budgetAmount).toBe('260');
    });

    it('matches despite punctuation/casing differences between the document and the stored label', () => {
        const current: Row[] = [{ id: 1, label: 'Müllabfuhr / Entsorgung', allocable: true, actualAmount: '', budgetAmount: '' }];
        const extracted: ExtractedCostItem[] = [{ label: 'Müllabfuhr Entsorgung', allocable: true, actualAmount: 50, budgetAmount: null }];
        const result = mergeExtractedCostItems(current, extracted, makeNew);
        expect(result).toHaveLength(1);
        expect(result[0].actualAmount).toBe('50');
    });

    it('appends an unmatched extracted item as a new row instead of overwriting anything', () => {
        const current: Row[] = [{ id: 1, label: 'Wasserversorgung', allocable: true, actualAmount: '100', budgetAmount: '' }];
        const extracted: ExtractedCostItem[] = [{ label: 'Gartenpflege', allocable: true, actualAmount: 80, budgetAmount: null }];
        const result = mergeExtractedCostItems(current, extracted, makeNew);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(current[0]);
        expect(result[1]).toMatchObject({ id: null, label: 'Gartenpflege', actualAmount: '80' });
    });

    it('keeps the existing form value when the extracted amount is null, instead of blanking it out', () => {
        const current: Row[] = [{ id: 3, label: 'Grundsteuer', allocable: true, actualAmount: '400', budgetAmount: '420' }];
        const extracted: ExtractedCostItem[] = [{ label: 'Grundsteuer', allocable: true, actualAmount: null, budgetAmount: null }];
        const result = mergeExtractedCostItems(current, extracted, makeNew);
        expect(result[0].actualAmount).toBe('400');
        expect(result[0].budgetAmount).toBe('420');
    });

    it('always overwrites allocable from the extracted item, even when amounts are null', () => {
        const current: Row[] = [{ id: 3, label: 'Verwaltungskosten', allocable: true, actualAmount: '', budgetAmount: '' }];
        const extracted: ExtractedCostItem[] = [{ label: 'Verwaltungskosten', allocable: false, actualAmount: null, budgetAmount: null }];
        const result = mergeExtractedCostItems(current, extracted, makeNew);
        expect(result[0].allocable).toBe(false);
    });

    it('leaves rows with no matching extracted item completely untouched', () => {
        const current: Row[] = [
            { id: 1, label: 'Wasserversorgung', allocable: true, actualAmount: '100', budgetAmount: '' },
            { id: 2, label: 'Hausreinigung', allocable: true, actualAmount: '', budgetAmount: '' },
        ];
        const result = mergeExtractedCostItems(current, [], makeNew);
        expect(result).toEqual(current);
    });
});
