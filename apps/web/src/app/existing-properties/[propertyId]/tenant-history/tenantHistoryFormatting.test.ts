import { describe, expect, it } from 'vitest';
import { formatDuration, personName } from './tenantHistoryFormatting';
import type { TenancyPerson } from '@immoandthebrain/types';

function person(overrides: Partial<TenancyPerson> = {}): TenancyPerson {
    return {
        tenancyPersonId: 1,
        tenancyId: 1,
        lastName: 'Müller',
        firstName: 'Hans',
        taxId: null,
        isPrimary: true,
        sortOrder: 0,
        moveInDate: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('personName', () => {
    it('formats as "Nachname, Vorname"', () => {
        expect(personName(person())).toBe('Müller, Hans');
    });

    it('returns "–" for undefined', () => {
        expect(personName(undefined)).toBe('–');
    });

    it('trims a trailing comma when the last name is missing', () => {
        expect(personName(person({ lastName: null }))).toBe(', Hans');
    });
});

describe('formatDuration', () => {
    it('returns "–" when either date is missing', () => {
        expect(formatDuration(null, '2026-01-01')).toBe('–');
        expect(formatDuration('2026-01-01', null)).toBe('–');
        expect(formatDuration(null, null)).toBe('–');
    });

    it('returns "–" for an inverted range (end before start)', () => {
        expect(formatDuration('2026-06-01', '2026-01-01')).toBe('–');
    });

    it('shows months only for a duration under a year', () => {
        expect(formatDuration('2026-01-01', '2026-07-01')).toBe('6 Mo.');
    });

    it('shows years and months once a year has passed', () => {
        expect(formatDuration('2024-01-01', '2026-04-01')).toBe('2 J. 3 Mo.');
    });

    it('shows "0 Mo." for the same calendar month', () => {
        expect(formatDuration('2026-01-01', '2026-01-15')).toBe('0 Mo.');
    });

    it('omits years when the duration is an exact multiple of 12 months but under 2 years, showing years with 0 months', () => {
        expect(formatDuration('2025-01-01', '2026-01-01')).toBe('1 J. 0 Mo.');
    });
});
