import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for server-only Storage operations. Storage
 * objects are private and RLS-gated on auth.uid() matching the object's
 * folder — a real requirement in production, but one AUTH_BYPASS mode can't
 * satisfy (it never establishes a real Supabase Auth session). Every other
 * table already sidesteps this the same way: the server holds elevated
 * access (here, the service role; elsewhere, the `db` pool) and ownership is
 * checked explicitly in the route instead of relying on RLS. This is that
 * same pattern applied to Storage.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_ADMIN_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Response(JSON.stringify({ error: 'Supabase admin configuration is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
