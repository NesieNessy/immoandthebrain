const SESSION_KEY = 'immoandthebrain_login_time';
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export function recordLoginTime(): void {
  localStorage.setItem(SESSION_KEY, Date.now().toString());
}

export function clearLoginTime(): void {
  localStorage.removeItem(SESSION_KEY);
}

/** Returns true if the session has expired (> 2 hours since login). */
export function isSessionExpired(): boolean {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return true; // No timestamp recorded → treat as expired
  const loginTime = parseInt(raw, 10);
  return Date.now() - loginTime > SESSION_DURATION_MS;
}

/** Milliseconds remaining in the session, or 0 if already expired. */
export function msUntilExpiry(): number {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return 0;
  const loginTime = parseInt(raw, 10);
  const remaining = SESSION_DURATION_MS - (Date.now() - loginTime);
  return Math.max(0, remaining);
}
