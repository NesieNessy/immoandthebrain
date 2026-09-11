import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { RenovationMeasure, RenovationMeasureInsert, RenovationMeasureUpdate } from '@immoandthebrain/types';

function toMeasure(row: Record<string, unknown>): RenovationMeasure {
    return {
        renovationMeasureId: row.renovation_measure_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        title: row.title as string,
        estimatedCost: row.estimated_cost == null ? null : Number(row.estimated_cost),
        quotedCost: row.quoted_cost == null ? null : Number(row.quoted_cost),
        preferredStartDate: row.preferred_start_date as string | null,
        quotedStartDate: row.quoted_start_date as string | null,
        actualCompletionDate: row.actual_completion_date as string | null,
        published: row.published as boolean,
        publishedAt: row.published_at as string | null,
        quoteAccepted: row.quote_accepted as boolean,
        customerConfirmedCompleted: row.customer_confirmed_completed as boolean,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getRenovationMeasuresByProperty(propertyId: number): Promise<RenovationMeasure[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('renovation-measures', {}, { propertyId });
    return data?.map(toMeasure) ?? [];
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createRenovationMeasure(payload: RenovationMeasureInsert): Promise<RenovationMeasure | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measures', jsonRequest('POST', { values: {
        property_id: payload.propertyId,
        sort_order: payload.sortOrder,
        title: payload.title,
        estimated_cost: payload.estimatedCost,
        quoted_cost: payload.quotedCost,
        preferred_start_date: payload.preferredStartDate,
        quoted_start_date: payload.quotedStartDate,
        actual_completion_date: payload.actualCompletionDate,
        published: payload.published,
        quote_accepted: payload.quoteAccepted,
        customer_confirmed_completed: payload.customerConfirmedCompleted,
    } }));
    if (!data) return null;
    return toMeasure(data);
}

export async function updateRenovationMeasure(
    renovationMeasureId: number,
    updates: RenovationMeasureUpdate,
): Promise<RenovationMeasure | null> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.estimatedCost !== undefined) dbUpdates.estimated_cost = updates.estimatedCost;
    if (updates.quotedCost !== undefined) dbUpdates.quoted_cost = updates.quotedCost;
    if (updates.preferredStartDate !== undefined) dbUpdates.preferred_start_date = updates.preferredStartDate;
    if (updates.quotedStartDate !== undefined) dbUpdates.quoted_start_date = updates.quotedStartDate;
    if (updates.actualCompletionDate !== undefined) dbUpdates.actual_completion_date = updates.actualCompletionDate;
    if (updates.published !== undefined) dbUpdates.published = updates.published;
    if (updates.publishedAt !== undefined) dbUpdates.published_at = updates.publishedAt;
    if (updates.quoteAccepted !== undefined) dbUpdates.quote_accepted = updates.quoteAccepted;
    if (updates.customerConfirmedCompleted !== undefined) dbUpdates.customer_confirmed_completed = updates.customerConfirmedCompleted;

    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measures', jsonRequest('PATCH', { id: renovationMeasureId, values: dbUpdates }));
    if (!data) return null;
    return toMeasure(data);
}

export async function deleteRenovationMeasure(renovationMeasureId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('renovation-measures', { method: 'DELETE' }, { id: renovationMeasureId }));
}
