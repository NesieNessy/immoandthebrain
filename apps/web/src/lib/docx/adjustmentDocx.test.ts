import { describe, expect, it } from 'vitest';
import { adjustmentOutcomeFor } from './adjustmentDocx';

describe('adjustmentOutcomeFor', () => {
    it('is a Nachzahlung when the cost share exceeds the prepayment', () => {
        expect(adjustmentOutcomeFor(150)).toBe('nachzahlung');
    });

    it('is an Erstattung when the prepayment exceeds the cost share', () => {
        expect(adjustmentOutcomeFor(-75)).toBe('erstattung');
    });

    it('is ausgeglichen when they match exactly', () => {
        expect(adjustmentOutcomeFor(0)).toBe('ausgeglichen');
    });
});
