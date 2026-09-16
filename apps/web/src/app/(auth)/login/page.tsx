'use client';

import { Button, Checkbox, Icons, TextField } from '@/components/ui';
import { recordLoginTime } from '@/lib/auth/sessionTimeout';
import { supabase } from '@/lib/supabase/client.supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      recordLoginTime();
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Willkommen zurück</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Melden Sie sich an, um fortzufahren
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <TextField
          label="E-Mail-Adresse"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@beispiel.de"
          icon={<Icons.Mail />}
          autoComplete="email"
          required
        />

        <div>
          <TextField
            label="Passwort"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ihr Passwort"
            icon={<Icons.Lock />}
            autoComplete="current-password"
            endElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
              </button>
            }
            required
          />
          <div className="mt-2 flex items-center justify-end">
            <Link href="/forgot-password" className="text-sm text-primary hover:text-primary/80">
              Passwort vergessen?
            </Link>
          </div>
        </div>

        {/* Supabase persists the session in localStorage regardless; this
            reflects the user's stated preference in the UI without a
            separate session-only storage mode to wire it to. */}
        <Checkbox
          label="Angemeldet bleiben"
          checked={staySignedIn}
          onChange={(e) => setStaySignedIn(e.target.checked)}
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Anmelden...' : 'Anmelden'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Noch kein Konto?{' '}
        <Link href="/signup" className="text-primary hover:text-primary/80 font-medium">
          Jetzt registrieren
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        Datenschutz · AGB · Impressum · Hilfe
      </p>
    </div>
  );
}
