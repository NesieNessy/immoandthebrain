export interface RentalDataGuardInput {
    coldRent: string;
    miscRent: string;
    parkingSpaceRent: string;
    houseMoney: string;
    tenancyEndDate: Date | undefined;
    nextRentAdjustmentDate: Date | undefined;
    nextRentAdjustmentAmount: string;
    renovationAdjustmentStartDate: Date | undefined;
    renovationAdjustmentEndDate: Date | undefined;
    renovationAdjustmentAmount: string;
    persons: { moveInDate: Date | undefined; taxId: string }[];
}

/**
 * True when rental-terms data was typed in but nothing will persist it: no
 * tenancy exists yet and no person has a name (the Mietvertrag tab has no
 * name field of its own). Without this check, handleSave silently dropped
 * that data while still showing "Mieterdaten gespeichert."; this drives a
 * clear error instead. Must cover every field on this tab, including
 * Mietanpassung/Sanierungsanpassung.
 */
export function hasOrphanedRentalData(input: RentalDataGuardInput): boolean {
    return input.coldRent !== ''
        || input.miscRent !== ''
        || input.parkingSpaceRent !== ''
        || input.houseMoney !== ''
        || input.tenancyEndDate != null
        || input.nextRentAdjustmentDate != null
        || input.nextRentAdjustmentAmount !== ''
        || input.renovationAdjustmentStartDate != null
        || input.renovationAdjustmentEndDate != null
        || input.renovationAdjustmentAmount !== ''
        || input.persons.some((p) => p.moveInDate != null || p.taxId.trim() !== '');
}
