import { createClient } from '@supabase/supabase-js';
import { isAuthBypassEnabled } from '@/lib/auth/authBypass';
import { LOCAL_BYPASS_USER_ID } from '@/lib/auth/localBypass';
import { workflowIdForRequest } from '@/lib/detailCheck/workflow';
import { apiError } from './apiError';

/**
 * The detail-check workflow of a request — or a 400 response to return as is
 * when the quickCheckId/workflowId is malformed (see workflowIdForRequest):
 *
 *   const workflowId = resolveWorkflowId(userId, quickCheckId, requested);
 *   if (workflowId instanceof Response) return workflowId;
 */
export function resolveWorkflowId(
  userId: string,
  quickCheckId: string | null,
  requestedWorkflowId: string | null = null,
): string | Response {
  const workflowId = workflowIdForRequest(userId, quickCheckId, requestedWorkflowId);
  if (workflowId) return workflowId;
  return apiError(400, 'Ungültige Detailbewertung – der Link ist unvollständig oder beschädigt.');
}

/**
 * The signed-in user's id — or the error response to return as is:
 *
 *   const userId = await requireUserId(request);
 *   if (userId instanceof Response) return userId;
 *
 * It used to *throw* its 401, which Next.js turned into a 500 — so an expired
 * session looked like a server crash to every page, and nothing could react
 * to it as "please sign in again". The client now shows a session-expired
 * dialog on any 401 (see lib/api/authFetch.ts). routeAuthCoverage.test.ts
 * checks that every handler has the guard line.
 */
export async function requireUserId(request: Request): Promise<string | Response> {
  if (isAuthBypassEnabled()) return LOCAL_BYPASS_USER_ID;

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token) return apiError(401, 'Bitte melde dich an.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('requireUserId: NEXT_PUBLIC_SUPABASE_URL or a Supabase key is not configured.');
    return apiError(500, 'Der Server ist nicht richtig konfiguriert. Bitte später erneut versuchen.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return apiError(401, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');

  return data.user.id;
}
