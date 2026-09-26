/**
 * Where to go after signing in: the `next` parameter (set by the session-
 * expired dialog), but only a same-site path. An absolute URL, a protocol-
 * relative one ("//evil.example") or a backslash variant browsers normalise
 * into one would turn the login page into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
