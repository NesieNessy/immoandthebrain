/**
 * Turning failures into messages the user can read — the client half of the
 * error handling (server half: lib/server/apiError.ts; guide:
 * docs/error-handling.md).
 *
 *   const res = await authFetch(url);
 *   if (!res.ok) throw await readApiError(res);
 *   …
 *   } catch (err) {
 *     setError(errorMessage(err, 'Kaufkosten konnten nicht gespeichert werden.'));
 *   }
 *
 * The user never sees raw response bodies, JSON, HTML error pages or English
 * library messages — only the API's own `error` text (written for users) or a
 * German default for the situation.
 */

/** Fired by authFetch on every 401 — SessionExpiredDialog listens for it. */
export const SESSION_EXPIRED_EVENT = 'app:session-expired';

export const SESSION_EXPIRED_MESSAGE = 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
export const NETWORK_ERROR_MESSAGE = 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.';
const SERVER_ERROR_MESSAGE = 'Auf dem Server ist ein Fehler aufgetreten. Bitte versuche es später erneut.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Die Eingaben konnten nicht verarbeitet werden. Bitte prüfe sie und versuche es erneut.',
  401: SESSION_EXPIRED_MESSAGE,
  403: 'Dafür fehlt dir die Berechtigung.',
  404: 'Der Eintrag wurde nicht gefunden – eventuell wurde er inzwischen gelöscht.',
  409: 'Der Eintrag wurde inzwischen geändert oder ist gesperrt. Bitte lade die Seite neu.',
  413: 'Die Datei ist zu groß.',
  429: 'Zu viele Anfragen – bitte warte einen Moment und versuche es erneut.',
};

/** A failed API call, carrying a message that is safe to show as is. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Per-field messages, when the API validated a form (e.g. Objektdaten). */
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function defaultMessage(status: number): string {
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return STATUS_MESSAGES[status] ?? 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.';
}

/**
 * The ApiError for a non-OK response. The API's `error` text is used for
 * client errors (4xx) — it is written for users. Sessions (401) and server
 * errors (5xx) always get the standard German message: a 500's body is a
 * stack-trace-ish internal detail, and "Unauthorized" helps nobody.
 */
export async function readApiError(response: Response): Promise<ApiError> {
  let serverMessage: string | undefined;
  let fieldErrors: Record<string, string> | undefined;
  try {
    const body = await response.clone().json() as { error?: unknown; fieldErrors?: unknown };
    if (typeof body?.error === 'string' && body.error.trim()) serverMessage = body.error.trim();
    if (body?.fieldErrors && typeof body.fieldErrors === 'object') fieldErrors = body.fieldErrors as Record<string, string>;
  } catch {
    // Not JSON (an HTML error page, an empty body) — the default below applies.
  }

  const useServerMessage = serverMessage && response.status >= 400 && response.status < 500 && response.status !== 401;
  return new ApiError(useServerMessage ? serverMessage! : defaultMessage(response.status), response.status, fieldErrors);
}

/**
 * An error whose message is written for the user — a rule the client checks
 * itself ("Der Mietzeitraum überschneidet sich mit …"). errorMessage shows it
 * as is; a plain Error is treated as internal and replaced by the fallback.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** A failed fetch() itself (offline, DNS, CORS) rejects with a TypeError. */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/**
 * The message to show for anything caught around an API call. ApiError and
 * UserFacingError messages are shown as is; every other Error (a thrown
 * internal code, a library message) gets the caller's `fallback`, which
 * describes what failed.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof UserFacingError) return error.message;
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return fallback;
}
