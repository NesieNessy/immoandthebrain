import { describe, expect, it } from 'vitest';
import { validatePrimaryPerson, type PrimaryPersonInput } from './primaryPersonValidation';

/**
 * Regression coverage: required Hauptmieter fields were shown but nothing
 * blocked Save, so a DB CHECK-constraint violation was silently dropped and
 * still reported as "Mieterdaten gespeichert.". This now gates Save and
 * drives the inline field errors.
 */

const complete: PrimaryPersonInput = {
    id: 1,
    lastName: 'Müller',
    firstName: 'Hans',
    taxId: '12 345 678 901',
    moveInDate: new Date(2026, 0, 1),
};

describe('validatePrimaryPerson', () => {
    it('is valid and skips validation for a null primary person', () => {
        const result = validatePrimaryPerson(null);
        expect(result).toEqual({ willBeSaved: false, fieldErrors: null, isValid: true });
    });

    it('is valid and skips validation for a brand-new, entirely blank draft row', () => {
        // handleSave never calls create/update for an unsaved, unnamed row —
        // an empty Mieterdaten form is a legitimate "no tenant yet" save.
        const draft: PrimaryPersonInput = { id: null, lastName: '', firstName: '', taxId: '', moveInDate: undefined };
        const result = validatePrimaryPerson(draft);
        expect(result).toEqual({ willBeSaved: false, fieldErrors: null, isValid: true });
    });

    it('is fully valid once every required field is filled', () => {
        const result = validatePrimaryPerson(complete);
        expect(result.willBeSaved).toBe(true);
        expect(result.isValid).toBe(true);
        expect(result.fieldErrors).toEqual({
            lastName: undefined,
            firstName: undefined,
            taxId: undefined,
            moveInDate: undefined,
        });
    });

    it('flags all four fields once a name is typed for a new (id === null) row', () => {
        const draftWithName: PrimaryPersonInput = { id: null, lastName: '', firstName: 'Hans', taxId: '', moveInDate: undefined };
        const result = validatePrimaryPerson(draftWithName);
        expect(result.willBeSaved).toBe(true);
        expect(result.isValid).toBe(false);
        expect(result.fieldErrors?.lastName).toBeTruthy();
        expect(result.fieldErrors?.firstName).toBeUndefined();
        expect(result.fieldErrors?.taxId).toBeTruthy();
        expect(result.fieldErrors?.moveInDate).toBeTruthy();
    });

    it('flags a blank Steuer-ID/Einzugsdatum on an existing (id set) row even with no name change', () => {
        // An existing row is always updated regardless of blank name fields —
        // the exact shape the DB CHECK constraints guard.
        const existingIncomplete: PrimaryPersonInput = { id: 42, lastName: 'Müller', firstName: 'Hans', taxId: '', moveInDate: undefined };
        const result = validatePrimaryPerson(existingIncomplete);
        expect(result.willBeSaved).toBe(true);
        expect(result.isValid).toBe(false);
        expect(result.fieldErrors?.taxId).toBeTruthy();
        expect(result.fieldErrors?.moveInDate).toBeTruthy();
        expect(result.fieldErrors?.lastName).toBeUndefined();
        expect(result.fieldErrors?.firstName).toBeUndefined();
    });

    it('treats a whitespace-only value as blank, not as filled', () => {
        const whitespacePadded: PrimaryPersonInput = { ...complete, id: null, taxId: '   ' };
        const result = validatePrimaryPerson(whitespacePadded);
        expect(result.isValid).toBe(false);
        expect(result.fieldErrors?.taxId).toBeTruthy();
    });

    it('never requires anything for a non-primary person (caller passes null when there is none selected)', () => {
        // Caller passes null for "no primary person"; must never block saving.
        expect(validatePrimaryPerson(null).isValid).toBe(true);
    });
});
