import { authFetch } from '@/lib/api/authFetch';
import type { WegInsert, WegReview, WegReviewInsert, WegWithRating } from '@immoandthebrain/types';

function toWeg(row: Record<string, unknown>): WegWithRating {
  return {
    wegId: row.weg_id as number,
    createdByUserId: row.created_by_user_id as string,
    name: row.name as string,
    foundedYear: row.founded_year as number | null,
    city: row.city as string,
    unitCount: row.unit_count as number | null,
    serviceTier: row.service_tier as string,
    annualFeePerUnit: row.annual_fee_per_unit == null ? null : Number(row.annual_fee_per_unit),
    responseTimeHours: row.response_time_hours as number | null,
    reachability: row.reachability as string | null,
    website: row.website as string | null,
    phone: row.phone as string | null,
    email: row.email as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    averageRating: row.average_rating == null ? null : Number(row.average_rating),
    reviewCount: Number(row.review_count ?? 0),
  };
}

function toWegReview(row: Record<string, unknown>): WegReview & { reviewerName: string } {
  return {
    wegReviewId: row.weg_review_id as number,
    wegId: row.weg_id as number,
    userId: row.user_id as string,
    rating: row.rating as number,
    comment: row.comment as string | null,
    createdAt: row.created_at as string,
    reviewerName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Anonym',
  };
}

export async function getWegs(): Promise<WegWithRating[]> {
  const response = await authFetch('/api/network/wegs', { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toWeg);
}

export async function createWeg(weg: WegInsert): Promise<WegWithRating | null> {
  const response = await authFetch('/api/network/wegs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: weg.name,
      founded_year: weg.foundedYear,
      city: weg.city,
      unit_count: weg.unitCount,
      service_tier: weg.serviceTier,
      annual_fee_per_unit: weg.annualFeePerUnit,
      response_time_hours: weg.responseTimeHours,
      reachability: weg.reachability,
      website: weg.website,
      phone: weg.phone,
      email: weg.email,
    }),
  });
  if (!response.ok) return null;
  return toWeg(await response.json());
}

export async function getWegReviews(wegId: number): Promise<(WegReview & { reviewerName: string })[]> {
  const response = await authFetch(`/api/network/wegs/${wegId}/reviews`, { cache: 'no-store' });
  if (!response.ok) return [];
  const data = await response.json() as Record<string, unknown>[];
  return data.map(toWegReview);
}

/** Submitting again replaces this user's existing review for the same WEG
 *  (ON CONFLICT upsert server-side) rather than adding a second one. */
export async function submitWegReview(wegId: number, review: Pick<WegReviewInsert, 'rating' | 'comment'>): Promise<boolean> {
  const response = await authFetch(`/api/network/wegs/${wegId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: review.rating, comment: review.comment }),
  });
  return response.ok;
}
