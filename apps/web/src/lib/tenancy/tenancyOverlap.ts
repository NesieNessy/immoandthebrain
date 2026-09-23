export interface TenancyPeriod {
    tenancyId: number;
    tenancyStartDate: string;
    tenancyEndDate: string | null;
}

// Dates may arrive as a bare 'yyyy-MM-dd' or as a full ISO timestamp
// ('yyyy-MM-ddT00:00:00.000Z', once a Postgres DATE column round-trips
// through JSON) — comparing the two forms directly as strings is unsafe
// (a bare date is lexicographically "less than" the same calendar day
// written as a timestamp, since it's a strict prefix of it), so every date
// is normalized to just its first 10 characters before comparing.
function toDateOnly(value: string): string {
    return value.slice(0, 10);
}

/**
 * Finds an existing tenancy for the same unit whose period overlaps
 * [candidateStart, candidateEnd], excluding `excludeTenancyId` (the
 * tenancy being edited or reactivated, if any). A unit can only have one
 * tenant at a time, so any two tenancies whose date ranges genuinely
 * overlap are always a data error — one tenancy ending the same day
 * another starts (the ordinary move-out/move-in handoff) is NOT an
 * overlap, only ranges that share at least one full day are. A null end
 * date means "ongoing" (unbounded).
 */
export function findOverlappingTenancy<T extends TenancyPeriod>(
    tenancies: T[],
    candidateStart: string,
    candidateEnd: string | null,
    excludeTenancyId?: number | null,
): T | null {
    const candidateStartValue = toDateOnly(candidateStart);
    const candidateEndValue = candidateEnd ? toDateOnly(candidateEnd) : '9999-12-31';
    for (const t of tenancies) {
        if (excludeTenancyId != null && t.tenancyId === excludeTenancyId) continue;
        const existingStartValue = toDateOnly(t.tenancyStartDate);
        const existingEndValue = t.tenancyEndDate ? toDateOnly(t.tenancyEndDate) : '9999-12-31';
        if (candidateStartValue < existingEndValue && existingStartValue < candidateEndValue) {
            return t;
        }
    }
    return null;
}
