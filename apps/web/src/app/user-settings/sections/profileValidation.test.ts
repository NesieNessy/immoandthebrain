import { describe, expect, it } from 'vitest';
import { isProfileFormValid, type ProfileFormFields } from './profileValidation';

const validFields: ProfileFormFields = {
    firstName: 'Vanessa',
    lastName: 'Musterfrau',
    emailAddress: 'vanessa@example.com',
    street: 'Musterstraße',
    houseNumber: '1',
    postalCode: '80331',
    city: 'München',
    taxIdentificationNumber: '12345678901',
};

describe('isProfileFormValid', () => {
    it('accepts a fully filled-in form', () => {
        expect(isProfileFormValid(validFields)).toBe(true);
    });

    it('rejects a blank or whitespace-only required field', () => {
        expect(isProfileFormValid({ ...validFields, firstName: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, lastName: '   ' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, emailAddress: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, street: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, houseNumber: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, postalCode: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, city: '' })).toBe(false);
        expect(isProfileFormValid({ ...validFields, taxIdentificationNumber: '' })).toBe(false);
    });
});
