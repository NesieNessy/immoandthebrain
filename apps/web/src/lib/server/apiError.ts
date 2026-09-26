import { NextResponse } from 'next/server';

/**
 * The one error shape every API route answers with: `{ error: string }` plus
 * optional extras (e.g. `fieldErrors`), under a meaningful HTTP status.
 * `error` is shown to the user as is (see lib/api/apiError.ts) — write it in
 * German, as a sentence the user can act on.
 *
 * Return it, never throw it: Next.js turns a thrown Response into a 500.
 */
export function apiError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return NextResponse.json({ error: message, ...extra }, { status });
}
