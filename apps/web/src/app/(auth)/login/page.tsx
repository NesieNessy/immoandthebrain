'use client';

import { Button, TextField } from '@/components/ui';
import { recordLoginTime } from '@/lib/auth/sessionTimeout';
import { supabase } from '@/lib/supabase/client.supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <h1 className="text-3xl font-bold text-gray-900">Willkommen zurück</h1>
        <p className="mt-2 text-sm text-gray-600">
          Melden Sie sich bei Ihrem ImmoAndTheBrain-Konto an
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
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
          placeholder="Ihr Passwort"
          required
        />

        <div className="flex items-center justify-end">
          <Link href="/forgot-password" className="text-sm text-primary hover:text-primary/80">
            Passwort vergessen?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Anmelden...' : 'Anmelden'}
        </Button>
      </form>

      <p className="text-center text-sm text-gray-600">
        Noch kein Konto?{' '}
        <Link href="/signup" className="text-primary hover:text-primary/80">
          Registrieren
        </Link>
      </p>
    </div>
  );
}
