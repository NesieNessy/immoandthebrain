import { describe, expect, it } from 'vitest';
import { hasOrphanedRentalData, type RentalDataGuardInput } from './orphanedRentalData';

/**
 * Regression coverage for the bug found in review: entering rent/dates on
 * the Mietvertrag tab for a unit that has no tenancy yet and no named
 * tenant anywhere (this tab has no name field of its own) used to be
 * silently discarded by handleSave — neither the "create tenancy" nor the
 * "update tenancy" branch ran, yet the page still showed "Mieterdaten
 * gespeichert.". This function is what now drives a clear error instead.
 */

const empty: RentalDataGuardInput = {
    coldRent: '',
    miscRent: '',
    parkingSpaceRent: '',
    houseMoney: '',
    tenancyEndDate: undefined,
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
