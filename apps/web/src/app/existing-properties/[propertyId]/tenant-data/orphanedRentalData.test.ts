import { describe, expect, it } from 'vitest';
import { hasOrphanedRentalData, type RentalDataGuardInput } from './orphanedRentalData';

/**
 * Regression coverage: entering rent/dates on the Mietvertrag tab with no
 * tenancy and no named tenant used to be silently discarded by handleSave
 * while still showing "Mieterdaten gespeichert.". This guard now errors instead.
 */

const empty: RentalDataGuardInput = {
    coldRent: '',
    miscRent: '',
    parkingSpaceRent: '',
    houseMoney: '',
    tenancyEndDate: undefined,
    nextRentAdjustmentDate: undefined,
    nextRentAdjustmentAmount: '',
    renovationAdjustmentStartDate: undefined,
    renovationAdjustmentEndDate: undefined,
    renovationAdjustmentAmount: '',
    persons: [{ moveInDate: undefined, taxId: '' }],
};

describe('hasOrphanedRentalData', () => {
    it('is false when nothing has been entered', () => {
        expect(hasOrphanedRentalData(empty)).toBe(false);
    });

    it('is true once a rent figure is typed', () => {
        expect(hasOrphanedRentalData({ ...empty, coldRent: '950' })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, miscRent: '150' })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, parkingSpaceRent: '40' })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, houseMoney: '200' })).toBe(true);
    });

    it('is true once a move-out date is set', () => {
        expect(hasOrphanedRentalData({ ...empty, tenancyEndDate: new Date(2027, 0, 1) })).toBe(true);
    });

    it('is true once a Mietanpassung field is filled in on its own', () => {
        expect(hasOrphanedRentalData({ ...empty, nextRentAdjustmentDate: new Date(2027, 0, 1) })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, nextRentAdjustmentAmount: '50' })).toBe(true);
    });

    it('is true once a Sanierungsanpassung field is filled in on its own', () => {
        expect(hasOrphanedRentalData({ ...empty, renovationAdjustmentStartDate: new Date(2027, 0, 1) })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, renovationAdjustmentEndDate: new Date(2027, 5, 1) })).toBe(true);
        expect(hasOrphanedRentalData({ ...empty, renovationAdjustmentAmount: '2500' })).toBe(true);
    });

    it('is true once any person has a move-in date, even with no name', () => {
        expect(hasOrphanedRentalData({ ...empty, persons: [{ moveInDate: new Date(2026, 0, 1), taxId: '' }] })).toBe(true);
    });

    it('is true once any person has a Steuer-ID, even with no name', () => {
        expect(hasOrphanedRentalData({ ...empty, persons: [{ moveInDate: undefined, taxId: '12 345 678 901' }] })).toBe(true);
    });

    it('checks every person in the list, not just the first', () => {
        const withSecondPerson: RentalDataGuardInput = {
            ...empty,
            persons: [
                { moveInDate: undefined, taxId: '' },
                { moveInDate: new Date(2026, 5, 1), taxId: '' },
            ],
        };
        expect(hasOrphanedRentalData(withSecondPerson)).toBe(true);
    });

    it('is false for an empty persons list', () => {
        expect(hasOrphanedRentalData({ ...empty, persons: [] })).toBe(false);
    });
});
