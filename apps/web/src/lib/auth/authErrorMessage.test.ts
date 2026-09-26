import { describe, expect, it } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '@/lib/api/apiError';
import { authErrorMessage } from './authErrorMessage';

describe('authErrorMessage', () => {
  it.each([
    ['Invalid login credentials', 'E-Mail-Adresse oder Passwort ist falsch.'],
    ['Email not confirmed', 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.'],
    ['User already registered', 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück.'],
    ['Password should be at least 8 characters.', 'Das Passwort ist zu kurz – bitte mindestens 8 Zeichen verwenden.'],
    ['New password should be different from the old password.', 'Das neue Passwort muss sich vom bisherigen unterscheiden.'],
    ['For security purposes, you can only request this after 42 seconds.', 'Bitte warte 42 Sekunden, bevor du es erneut versuchst.'],
    ['Invalid TOTP code entered', 'Der Code ist ungültig oder abgelaufen. Bitte gib den aktuellen Code aus deiner Authenticator-App ein.'],
    ['Failed to fetch', NETWORK_ERROR_MESSAGE],
  ])('%s', (message, expected) => {
    expect(authErrorMessage({ message }, 'Fallback.')).toBe(expected);
  });

  it('never shows an unknown library text — the fallback says what failed', () => {
    expect(authErrorMessage({ message: 'AuthApiError: unexpected_failure' }, 'Die Anmeldung ist fehlgeschlagen.')).toBe('Die Anmeldung ist fehlgeschlagen.');
    expect(authErrorMessage(null, 'Fehlgeschlagen.')).toBe('Fehlgeschlagen.');
  });
});
