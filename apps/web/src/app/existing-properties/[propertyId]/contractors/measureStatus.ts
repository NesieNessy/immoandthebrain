// Pure status/calculation logic shared by the list page and detail page,
// kept JSX-free so both can't drift apart on these rules.

import type { RenovationMeasure } from '@immoandthebrain/types';

/** Once a quote is accepted, core fields become read-only — mirrors the
 *  server-side lockedColumns enforcement for this resource. */
export function isLocked(measure: Pick<RenovationMeasure, 'quoteAccepted'>): boolean {
    return measure.quoteAccepted;
}

/** "Kunde bestätigt" togglable only once craftsman confirmed AND a
 *  completion date is set — matches the DB constraint. */
export function canConfirmCustomerCompletion(
    measure: Pick<RenovationMeasure, 'craftsmanConfirmedCompleted' | 'actualCompletionDate'>,
): boolean {
    return measure.craftsmanConfirmedCompleted && measure.actualCompletionDate != null;
}

export interface MeasuresSummary {
    totalEstimated: number;
    quotedCount: number;
    totalQuoted: number;
    /** Sum of (quotedCost - estimatedCost) over quoted measures; a quote with
     *  no estimate counts its full cost (missing baseline treated as 0). */
    deviation: number;
}

export function summarizeMeasures(measures: RenovationMeasure[]): MeasuresSummary {
    const totalEstimated = measures.reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0);
    const quotedMeasures = measures.filter((m) => m.quotedCost != null);
    const totalQuoted = quotedMeasures.reduce((sum, m) => sum + (m.quotedCost ?? 0), 0);
    const deviation = quotedMeasures.reduce((sum, m) => sum + ((m.quotedCost ?? 0) - (m.estimatedCost ?? 0)), 0);
    return { totalEstimated, quotedCount: quotedMeasures.length, totalQuoted, deviation };
}
