'use client';

import { Button, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase/client.supabase';
import Link from 'next/link';
import { useState } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        <h1 className="text-3xl font-bold text-gray-900">Fast geschafft!</h1>
        <p className="text-sm text-gray-600">
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
        <h1 className="text-3xl font-bold text-gray-900">Konto erstellen</h1>
        <p className="mt-2 text-sm text-gray-600">
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
          label="E-Mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ihre@email.de"
          required
        />

        <TextField
          label="Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passwort erstellen"
          required
        />

        <TextField
          label="Passwort bestätigen"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Passwort wiederholen"
          required
        />

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Registrieren...' : 'Registrieren'}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-600">
        Bereits ein Konto?{' '}
        <Link href="/login" className="text-primary hover:text-primary/80">
          Anmelden
        </Link>
      </p>
    </div>
  );
}
