import { NETWORK_ERROR_MESSAGE } from '@/lib/api/apiError';

/** Supabase auth error texts (English) → what the user can do about it. */
const KNOWN_AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-Mail-Adresse oder Passwort ist falsch.'],
  [/email not confirmed/i, 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.'],
  [/user already registered|already been registered/i, 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück.'],
  [/password should be at least (\d+)/i, 'Das Passwort ist zu kurz – bitte mindestens $1 Zeichen verwenden.'],
  [/password.*(weak|pwned|leaked)|weak password/i, 'Dieses Passwort ist zu unsicher. Bitte wähle ein anderes.'],
  [/new password should be different/i, 'Das neue Passwort muss sich vom bisherigen unterscheiden.'],
  [/invalid.*email|email.*invalid|unable to validate email/i, 'Bitte gib eine gültige E-Mail-Adresse ein.'],
  [/signups? not allowed|signup.*disabled/i, 'Neue Registrierungen sind derzeit nicht möglich.'],
  [/you can only request this after (\d+) seconds/i, 'Bitte warte $1 Sekunden, bevor du es erneut versuchst.'],
  [/rate limit|too many requests/i, 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.'],
  [/invalid (totp|mfa|otp)|code.*(invalid|expired)|(invalid|expired).*code/i, 'Der Code ist ungültig oder abgelaufen. Bitte gib den aktuellen Code aus deiner Authenticator-App ein.'],
  [/(session|jwt).*(expired|missing|not found)|auth session missing/i, 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.'],
  [/failed to fetch|network|load failed/i, NETWORK_ERROR_MESSAGE],
];

/**
 * A Supabase auth error in German. Unknown errors get `fallback`, which says
 * what failed — never the raw English library text.
 */
export function authErrorMessage(error: { message?: string } | null | undefined, fallback: string): string {
  const message = error?.message ?? '';
  for (const [pattern, text] of KNOWN_AUTH_ERRORS) {
    const match = pattern.exec(message);
    if (match) return text.replace('$1', match[1] ?? '');
  }
  return fallback;
}
