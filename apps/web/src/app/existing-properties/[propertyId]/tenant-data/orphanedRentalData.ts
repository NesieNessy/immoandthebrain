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
 * True when rental-terms data has been typed in but nothing will actually
 * persist it: no tenancy exists yet and no person has a name — handleSave's
 * own condition for skipping both the "create tenancy" and "update tenancy"
 * branches (the Mietvertrag tab has no name field of its own; that's on the
 * Mieterdaten tab). Without this check that data was silently discarded
 * while the page still showed "Mieterdaten gespeichert." — this drives a
 * clear error instead. Must cover every field this tab can fill in,
 * including the Mietanpassung/Sanierungsanpassung ones (previously missing
 * here, which meant filling in only those still hit the same silent-loss
 * bug this guard exists to catch).
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
