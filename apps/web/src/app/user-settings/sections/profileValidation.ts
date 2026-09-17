// Profil form validation — kept as a plain, JSX-free module (like
// property-data/validation.ts) so it's importable from .test.ts files under
// the project's node-environment vitest config.

export interface ProfileFormFields {
    firstName: string;
    lastName: string;
    emailAddress: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    taxIdentificationNumber: string;
}

/** Mirrors /api/personal-data's PUT `required` list — every field that
 *  route rejects a save over when blank. phoneNumber isn't here because it's
 *  optional there too. */
export function isProfileFormValid(fields: ProfileFormFields): boolean {
    return (
        fields.firstName.trim() !== '' &&
        fields.lastName.trim() !== '' &&
        fields.emailAddress.trim() !== '' &&
        fields.street.trim() !== '' &&
        fields.houseNumber.trim() !== '' &&
        fields.postalCode.trim() !== '' &&
        fields.city.trim() !== '' &&
        fields.taxIdentificationNumber.trim() !== ''
    );
}
