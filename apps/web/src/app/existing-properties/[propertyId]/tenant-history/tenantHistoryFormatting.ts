import type { TenancyPerson } from '@immoandthebrain/types';
import { differenceInCalendarMonths } from 'date-fns';

export function personName(p: TenancyPerson | undefined): string {
    if (!p) return '–';
    return `${p.lastName ?? ''}, ${p.firstName ?? ''}`.trim();
}

/**
 * "1 J. 3 Mo." (years omitted once they're 0) for a completed tenancy;
 * "–" when either date is missing or the range is inverted (bad data —
 * chk_tenancy_dates should already prevent tenancy_end_date <= start, but
 * this is read-only history display, not a place to throw over it).
 */
export function formatDuration(start: string | null, end: string | null): string {
    if (!start || !end) return '–';
    const totalMonths = differenceInCalendarMonths(new Date(end), new Date(start));
    if (totalMonths < 0) return '–';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return years > 0 ? `${years} J. ${months} Mo.` : `${months} Mo.`;
}
