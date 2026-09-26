import { SESSION_EXPIRED_EVENT } from '@/lib/api/apiError';
import { getSupabaseClient } from '@/lib/supabase/client.supabase';

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // An expired or revoked session is handled once, app-wide
  // (SessionExpiredDialog), rather than by every page on its own — each page
  // still gets the 401 back and shows its own error for the failed action.
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }

  return response;
}
