// Pure status/calculation logic shared by the Handwerkerleistungen list page
// (Contractors.tsx / useRenovationMeasuresData.ts) and the per-measure detail
// page (MeasureDetail.tsx / useMeasureDetailData.ts) — kept JSX-free so it's
// importable from .test.ts files and so both pages can't drift apart on what
// these rules actually are.

import type { RenovationMeasure } from '@immoandthebrain/types';

/** Once a quote is accepted, the measure's core fields become read-only —
 *  mirrors renovation_measure.quote_accepted's DB comment, and exactly the
 *  field set enforced server-side (lockedColumns on the renovation-measures
 *  resource in /api/property-resources/[resource]/route.ts). */
export function isLocked(measure: Pick<RenovationMeasure, 'quoteAccepted'>): boolean {
    return measure.quoteAccepted;
}

/** "Kunde bestätigt" is only togglable once the contractor's completion has
 *  been confirmed AND the owner has actually entered a completion date —
 *  matches the DB comment on customer_confirmed_completed ("only settable
 *  once actual_completion_date is set"). */
export function canConfirmCustomerCompletion(
    measure: Pick<RenovationMeasure, 'craftsmanConfirmedCompleted' | 'actualCompletionDate'>,
): boolean {
    return measure.craftsmanConfirmedCompleted && measure.actualCompletionDate != null;
}

export interface MeasuresSummary {
    totalEstimated: number;
    quotedCount: number;
    totalQuoted: number;
    /** Sum of (quotedCost - estimatedCost) across every measure that has a
     *  quotedCost — a measure with a quote but no estimate to compare
     *  against contributes its full quotedCost here (no baseline = treated
     *  as 0 estimated), which can read as a larger "over budget" figure than
     *  a per-measure comparison would suggest. */
    deviation: number;
}

export function summarizeMeasures(measures: RenovationMeasure[]): MeasuresSummary {
    const totalEstimated = measures.reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0);
    const quotedMeasures = measures.filter((m) => m.quotedCost != null);
    const totalQuoted = quotedMeasures.reduce((sum, m) => sum + (m.quotedCost ?? 0), 0);
    const deviation = quotedMeasures.reduce((sum, m) => sum + ((m.quotedCost ?? 0) - (m.estimatedCost ?? 0)), 0);
    return { totalEstimated, quotedCount: quotedMeasures.length, totalQuoted, deviation };
}
