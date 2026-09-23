import { describe, expect, it } from 'vitest';
import { findOverlappingTenancy } from './tenancyOverlap';

const t = (tenancyId: number, tenancyStartDate: string, tenancyEndDate: string | null) => ({ tenancyId, tenancyStartDate, tenancyEndDate });

describe('findOverlappingTenancy', () => {
    it('finds a genuine overlap between two ranges', () => {
        const existing = [t(1, '2026-01-01', '2026-09-22')];
        expect(findOverlappingTenancy(existing, '2026-08-02', '2026-12-31')?.tenancyId).toBe(1);
    });

    it('does not flag a same-day move-out/move-in handoff as an overlap', () => {
        const existing = [t(1, '2026-01-01', '2026-08-02')];
        expect(findOverlappingTenancy(existing, '2026-08-02', '2026-12-31')).toBeNull();
    });

    it('excludes the tenancy being edited itself', () => {
        const existing = [t(1, '2026-01-01', '2026-12-31')];
        expect(findOverlappingTenancy(existing, '2026-06-01', '2026-12-31', 1)).toBeNull();
    });

    it('treats a null end date as ongoing/unbounded', () => {
        const existing = [t(1, '2024-01-01', null)];
        expect(findOverlappingTenancy(existing, '2026-01-01', '2026-12-31')?.tenancyId).toBe(1);
    });

    it('a candidate with no end date (ongoing) overlaps any later-starting tenancy', () => {
        const existing = [t(1, '2026-08-02', '2026-12-31')];
        expect(findOverlappingTenancy(existing, '2026-01-01', null)?.tenancyId).toBe(1);
    });

    it('handles mixed bare-date and full-ISO-timestamp formats without a false boundary mismatch', () => {
        const existing = [t(1, '2026-01-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')];
        expect(findOverlappingTenancy(existing, '2026-08-02', '2026-12-31')).toBeNull();
        expect(findOverlappingTenancy(existing, '2026-08-01', '2026-12-31')?.tenancyId).toBe(1);
    });

    it('returns null when no tenancies overlap', () => {
        const existing = [t(1, '2020-01-01', '2020-12-31'), t(2, '2021-01-01', '2021-12-31')];
        expect(findOverlappingTenancy(existing, '2026-01-01', '2026-12-31')).toBeNull();
    });
});
