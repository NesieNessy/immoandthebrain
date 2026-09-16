'use client';

import { Button, Icons, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase/client.supabase';
import Link from 'next/link';
import { useState } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      setConfirmed(true);
    }
  };

  if (confirmed) {
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold text-foreground">Fast geschafft!</h1>
        <p className="text-sm text-muted-foreground">
          Wir haben eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet.
          Bitte bestätigen Sie Ihre E-Mail-Adresse, um sich anmelden zu können.
        </p>
        <Link href="/login">
          <Button className="w-full">Zur Anmeldung</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Konto erstellen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verwalten Sie Ihr Immobilienportfolio mit ImmoAndTheBrain
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
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

        <TextField
          label="Passwort"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort erstellen"
          icon={<Icons.Lock />}
          autoComplete="new-password"
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

        <TextField
          label="Passwort bestätigen"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Passwort wiederholen"
          icon={<Icons.Lock />}
          autoComplete="new-password"
          required
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Registrieren...' : 'Registrieren'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Bereits ein Konto?{' '}
        <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
          Anmelden
        </Link>
      </p>
    </div>
  );
}
