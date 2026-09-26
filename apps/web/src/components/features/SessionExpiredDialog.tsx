"use client";

import { Button, Icons, Modal } from '@/components/ui';
import { SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE } from '@/lib/api/apiError';
import { clearLoginTime } from '@/lib/auth/sessionTimeout';
import { supabase } from '@/lib/supabase/client.supabase';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Pages reachable without a session — a 401 there is expected, not "expired". */
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password'];

/**
 * Shown once, app-wide, as soon as any API call answers 401 (authFetch fires
 * SESSION_EXPIRED_EVENT). The page underneath still shows its own error for
 * the action that failed; this dialog explains *why* and offers the way out.
 * "Schließen" keeps the user on the page, so unsaved input can still be
 * copied before signing in again.
 */
export function SessionExpiredDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      if (PUBLIC_PATHS.some((path) => window.location.pathname.startsWith(path))) return;
      setOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Navigating away (e.g. after signing in again) closes it.
  useEffect(() => setOpen(false), [pathname]);

  const signInAgain = async () => {
    setIsSigningOut(true);
    const next = `${window.location.pathname}${window.location.search}`;
    try {
      clearLoginTime();
      await supabase.auth.signOut();
    } finally {
      setIsSigningOut(false);
      setOpen(false);
      router.push(`/login?next=${encodeURIComponent(next)}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Sitzung abgelaufen"
      icon={<Icons.Lock className="h-5 w-5" />}
      footer={
        <>
          <Button label="Schließen" variant="outline" onClick={() => setOpen(false)} />
          <Button
            label="Erneut anmelden"
            icon={isSigningOut ? <Icons.Loader2 className="animate-spin" /> : <Icons.LogOut />}
            disabled={isSigningOut}
            onClick={() => void signInAgain()}
          />
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {SESSION_EXPIRED_MESSAGE} Du kommst danach wieder auf diese Seite zurück — noch nicht gespeicherte Eingaben
        auf dieser Seite gehen dabei verloren.
      </p>
    </Modal>
  );
}
