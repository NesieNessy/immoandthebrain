import type { User } from '@supabase/supabase-js';
import { LOCAL_BYPASS_EMAIL, LOCAL_BYPASS_USER_ID } from './localBypass';

export function isAuthBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_BYPASS === 'true';
}

export const authBypassUser = {
  id: LOCAL_BYPASS_USER_ID,
  email: LOCAL_BYPASS_EMAIL,
  user_metadata: {
    full_name: 'ImmoAndTheBrain Dev User',
  },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date(0).toISOString(),
} as User;
