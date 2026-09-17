'use client';

import { Button, Icons, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase/client.supabase';
import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold text-foreground">E-Mail gesendet</h1>
        <p className="text-sm text-muted-foreground">
          Wir haben einen Link zum Zurücksetzen des Passworts an <strong>{email}</strong> gesendet.
          Bitte überprüfen Sie Ihren Posteingang.
        </p>
        <Link href="/login">
          <Button className="w-full">Zurück zur Anmeldung</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Passwort zurücksetzen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Reset-Link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Senden...' : 'Reset-Link senden'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Passwort wieder erinnerlich?{' '}
        <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
          Anmelden
        </Link>
      </p>
    </div>
  );
}

