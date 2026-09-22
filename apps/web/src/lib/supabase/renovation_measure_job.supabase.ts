import { authFetch } from '@/lib/api/authFetch';
import type { RenovationMeasureJobListing } from '@immoandthebrain/types';

function toJobListing(row: Record<string, unknown>): RenovationMeasureJobListing {
  return {
    renovationMeasureId: row.renovation_measure_id as number,
    propertyId: row.property_id as number,
    sortOrder: row.sort_order as number,
    title: row.title as string,
    category: row.category as string | null,
    description: row.description as string | null,
    estimatedCost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    quotedCost: row.quoted_cost == null ? null : Number(row.quoted_cost),
    budgetMin: row.budget_min == null ? null : Number(row.budget_min),
    budgetMax: row.budget_max == null ? null : Number(row.budget_max),
    preferredStartDate: row.preferred_start_date as string | null,
    quotedStartDate: row.quoted_start_date as string | null,
    actualCompletionDate: row.actual_completion_date as string | null,
    published: row.published as boolean,
    publishedAt: row.published_at as string | null,
    quoteAccepted: row.quote_accepted as boolean,
    craftsmanConfirmedCompleted: row.craftsman_confirmed_completed as boolean,
    customerConfirmedCompleted: row.customer_confirmed_completed as boolean,
    craftsmanNotes: row.craftsman_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    city: row.city as string,
    street: row.street as string,
  };
}

/** Every published, not-yet-commissioned job across every user's
 *  properties — Netzwerk > Handwerker. */
export async function getOpenJobs(): Promise<RenovationMeasureJobListing[]> {
  const response = await authFetch('/api/network/jobs', { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toJobListing);
}

export interface CreateJobPayload {
  propertyId: number;
  title: string;
  category: string | null;
  description: string | null;
  estimatedCost: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredStartDate: string | null;
}

export async function createAndPublishJob(payload: CreateJobPayload): Promise<RenovationMeasureJobListing | null> {
  const response = await authFetch('/api/network/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      property_id: payload.propertyId,
      title: payload.title,
      category: payload.category,
      description: payload.description,
      estimated_cost: payload.estimatedCost,
      budget_min: payload.budgetMin,
      budget_max: payload.budgetMax,
      preferred_start_date: payload.preferredStartDate,
    }),
  });
  if (!response.ok) return null;
  return toJobListing(await response.json());
}
