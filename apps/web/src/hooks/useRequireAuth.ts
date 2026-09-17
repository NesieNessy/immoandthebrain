'use client';

import { clearLoginTime, isSessionExpired, msUntilExpiry } from '@/lib/auth/sessionTimeout';
import { authBypassUser, isAuthBypassEnabled } from '@/lib/auth/authBypass';
import { supabase } from '@/lib/supabase/client.supabase';
import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ONBOARDING_PATH = '/user-settings';
const REACTIVATE_PATH = '/account-reactivate';

/**
 * Redirects to /login if no authenticated user is found.
 * Automatically signs out and redirects to / after 2 hours.
 * Use this in any protected page component.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthBypassEnabled()) {
      setUser(authBypassUser);
      setIsLoading(false);
      return;
    }

    async function signOutAndRedirect() {
      clearLoginTime();
      await supabase.auth.signOut();
      router.replace('/');
    }

    // Every business table (quick_check, property, ...) has a FK to
    // personal_data(user_id), not auth.users(id) directly — a signed-up
    // user with no personal_data row yet would hit cryptic foreign-key
    // errors the moment they try to save anything. Route them to
    // /user-settings to complete onboarding first, unless they're
    // already there (that page has its own auth check, not this hook).
    async function requirePersonalData(authUser: User) {
      if (pathname?.startsWith(ONBOARDING_PATH) || pathname?.startsWith(REACTIVATE_PATH)) {
        setUser(authUser);
        setIsLoading(false);
        return;
      }
      const personalData = await getPersonalData(authUser.id);
      if (!personalData) {
        router.replace(`${ONBOARDING_PATH}?onboarding=1`);
        return;
      }
      // Self-deactivated via Einstellungen > Konto & Daten — blocks the
      // whole app until the user reactivates. Not a Supabase Auth ban (a
      // banned user could never log back in to undo it themselves).
      if (personalData.deactivatedAt) {
        router.replace(REACTIVATE_PATH);
        return;
      }
      setUser(authUser);
      setIsLoading(false);
    }

    // Check session age immediately on mount
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login');
        return;
      }
      if (isSessionExpired()) {
        signOutAndRedirect();
        return;
      }
      void requirePersonalData(data.user);
    });

    // Schedule automatic logout at the exact expiry time
    const ms = msUntilExpiry();
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    if (ms > 0) {
      expiryTimer = setTimeout(() => {
        signOutAndRedirect();
      }, ms);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace('/login');
      } else {
        void requirePersonalData(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [router, pathname]);

  return { user, isLoading };
}
