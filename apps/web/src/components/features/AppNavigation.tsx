"use client";

import { NavigationBar } from '@/components/ui/NavigationBar';
import { authBypassUser, isAuthBypassEnabled } from '@/lib/auth/authBypass';
import { clearLoginTime } from '@/lib/auth/sessionTimeout';
import { supabase } from '@/lib/supabase/client.supabase';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Public, unauthenticated pages — the signed-in app chrome (property/document
// links, search, user menu) makes no sense here and showed up incorrectly on
// /login before this fix, pushing the page's own content down behind it.
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (isAuthBypassEnabled()) {
      setUser(authBypassUser);
      return;
    }

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    clearLoginTime();
    if (isAuthBypassEnabled()) {
      router.push('/');
      return;
    }
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (pathname && PUBLIC_ROUTES.includes(pathname)) return null;

  // Determine which item should be active based on the current path
  const isPropertyValuationActive = pathname?.startsWith('/property-valuation');
  const isExistingPropertiesActive = pathname?.startsWith('/existing-properties');
  const isDocumentsActive = pathname === '/documents';
  const isNetworkActive = pathname === '/network';
  const isUserSettingsActive = pathname === '/user-settings';

  return (
    <>
      {/* NavigationBar is fixed (see NavigationBar) — this spacer reserves
          its h-16 height in normal flow so content doesn't start underneath
          it. Lives here (not the root layout) so it disappears together with
          the bar itself on public/unauthenticated routes. */}
      <div className="h-16" aria-hidden="true" />
      <NavigationBar
        logo={{
          iconName: 'home',
          href: '/'
        }}
        items={[
          {
            label: 'Objektbewertung',
            iconName: 'propertyValuation',
            active: isPropertyValuationActive,
            subItems: [
              { label: 'Ersteinschätzung', href: '/property-valuation/quick-check', iconName: 'quickCheck' },
              { label: 'Detailbewertung', href: '/property-valuation/detail-check', iconName: 'detailCheck' },
            ]
          },
          { label: 'Bestandsobjekte', href: '/existing-properties', iconName: 'existingProperties', active: isExistingPropertiesActive },
          { label: 'Dokumente', href: '/documents', iconName: 'documents', active: isDocumentsActive },
          { label: 'Netzwerk', href: '/network', iconName: 'network', active: isNetworkActive },
        ]}
        actions={[
          {
            iconName: 'search',
            ariaLabel: 'Search'
          },
          {
            iconName: 'user',
            ariaLabel: 'User settings',
            href: '/user-settings',
            active: isUserSettingsActive
          },
          ...(user ? [{
            iconName: 'logout' as const,
            ariaLabel: 'Abmelden',
            onClick: handleLogout,
            separator: true,
          }] : []),
        ]}
      />
    </>
  );
}
