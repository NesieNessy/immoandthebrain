export interface PrimaryPersonInput {
    id: number | null;
    lastName: string;
    firstName: string;
    taxId: string;
    moveInDate: Date | undefined;
}

export interface PrimaryPersonFieldErrors {
    lastName?: string;
    firstName?: string;
    taxId?: string;
    moveInDate?: string;
}

export interface PrimaryPersonValidation {
    /** Whether handleSave's persons loop will actually write this row — an
     *  existing row (id set) is always updated; a new one only created once
     *  a name has been typed. Mirrors that condition exactly. */
    willBeSaved: boolean;
    fieldErrors: PrimaryPersonFieldErrors | null;
    isValid: boolean;
}

const REQUIRED_MESSAGE = 'Pflichtfeld für den Hauptmieter.';

/**
 * Nachname/Vorname/Steuer-ID/Einzugsdatum are required for the Hauptmieter
 * once that row will actually be written — mirrors the DB's
 * tenancy_person_primary_*_required CHECK constraints so the form catches a
 * violation before the save round-trip fails. A row that won't be saved this
 * round (blank draft) is never flagged: an empty form is a valid "no tenant
 * yet" state.
 */
export function validatePrimaryPerson(primaryPerson: PrimaryPersonInput | null): PrimaryPersonValidation {
    const willBeSaved = Boolean(
        primaryPerson && (primaryPerson.id != null || primaryPerson.lastName.trim() !== '' || primaryPerson.firstName.trim() !== '')
    );
    if (!willBeSaved || !primaryPerson) {
        return { willBeSaved: false, fieldErrors: null, isValid: true };
    }

    const fieldErrors: PrimaryPersonFieldErrors = {
        lastName: primaryPerson.lastName.trim() === '' ? REQUIRED_MESSAGE : undefined,
        firstName: primaryPerson.firstName.trim() === '' ? REQUIRED_MESSAGE : undefined,
        taxId: primaryPerson.taxId.trim() === '' ? REQUIRED_MESSAGE : undefined,
        moveInDate: !primaryPerson.moveInDate ? REQUIRED_MESSAGE : undefined,
    };
    const isValid = Object.values(fieldErrors).every((message) => !message);
    return { willBeSaved: true, fieldErrors, isValid };
}
