import { authFetch } from '@/lib/api/authFetch';
import type { Subscription } from '@immoandthebrain/types';

function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    subscriptionId: row.subscription_id as number,
    userId: row.user_id as string,
    subscriptionModel: row.subscription_model as Subscription['subscriptionModel'],
    startDate: row.start_date as string,
    endDate: row.end_date as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Null means no subscription row exists yet (e.g. a brand-new account) —
 *  callers show a Free default rather than treating this as an error. */
export async function getMySubscription(): Promise<Subscription | null> {
  const response = await authFetch('/api/subscription', { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json() as Record<string, unknown> | null;
  return data ? toSubscription(data) : null;
}
