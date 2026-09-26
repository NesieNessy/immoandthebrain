/**
 * Every step of a Detailbewertung stores its data under one workflow id:
 *  - "quick-check:<id>" when it was started from an Ersteinschätzung,
 *  - "detail-check:<uuid>" when it was started on its own (minted by the
 *    first Objektdaten save).
 * Client-safe (no server imports), so pages and API routes share the format.
 */

export function quickCheckWorkflowId(quickCheckId: string | number): string {
  return `quick-check:${quickCheckId}`;
}

/** The workflow id a step page is working on, from its URL parameters. */
export function detailCheckWorkflowId(quickCheckId: string | null, workflowId: string | null): string | null {
  if (quickCheckId) return quickCheckWorkflowId(quickCheckId);
  return workflowId || null;
}

/**
 * The workflow a detail-check request refers to, or null when what was asked
 * for is malformed. Without any id it is the user's draft workflow — a brand-
 * new detail check before its first save. A malformed id must *not* fall back
 * to that draft: the page would open blank and, worse, its saves would land in
 * the shared draft instead of the detail check the user is looking at.
 */
export function workflowIdForRequest(
  userId: string,
  quickCheckId: string | null,
  requestedWorkflowId: string | null,
): string | null {
  if (quickCheckId) return /^\d+$/.test(quickCheckId) ? quickCheckWorkflowId(quickCheckId) : null;
  const draft = `user:${userId}:draft`;
  if (!requestedWorkflowId) return draft;
  return isStandaloneWorkflowId(requestedWorkflowId) || requestedWorkflowId === draft ? requestedWorkflowId : null;
}

/** The quick check id inside a "quick-check:<id>" workflow id, otherwise null. */
export function quickCheckIdFromWorkflow(workflowId: string): number | null {
  const match = /^quick-check:(\d+)$/.exec(workflowId);
  return match ? Number(match[1]) : null;
}

/**
 * A standalone workflow id: "detail-check:" plus a safe id. The Objektdaten
 * save mints UUIDs, but it must not require one — detail checks created any
 * other way (e.g. seeded test data like "detail-check:test-5-complete") were
 * listed on the overview yet opened blank, because an id failing this check
 * silently falls back to the per-user draft workflow. Every query is scoped by
 * user_id, so a broader charset gives no access to anyone else's data.
 */
export function isStandaloneWorkflowId(workflowId: string): boolean {
  return /^detail-check:[A-Za-z0-9_-]{1,64}$/.test(workflowId);
}
