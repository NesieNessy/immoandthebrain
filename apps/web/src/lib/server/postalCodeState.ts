import { resolveStateFromPostalCode, type StateCode } from '@/lib/detailCheck/acquisitionCosts';
import { db } from './db';

/** Postgres "undefined_table" — the migration has not been applied to this database yet. */
const UNDEFINED_TABLE = '42P01';

/**
 * Federal state of a postal code, from the `postal_code_state` table (every
 * German PLZ, see supabase/migrations/20260926000001_postal_code_state.sql).
 * Falls back to the two-digit-prefix approximation for a postal code the table
 * doesn't list (e.g. a Großkunden-PLZ) or when the table isn't there yet.
 */
export async function loadStateForPostalCode(postalCode?: string | null): Promise<StateCode | null> {
  if (!postalCode || !/^\d{5}$/.test(postalCode)) return null;
  try {
    const { rows } = await db.query('SELECT state FROM postal_code_state WHERE postal_code = $1', [postalCode]);
    if (rows[0]) return String(rows[0].state).trim() as StateCode;
  } catch (error) {
    if ((error as { code?: string }).code !== UNDEFINED_TABLE) throw error;
    // Code and database are deployed separately — don't fail the Kaufkosten
    // step over a missing table, but make the degraded lookup visible.
    console.error('postal_code_state fehlt – Migration 20260926000001_postal_code_state.sql ist nicht eingespielt. PLZ-Präfix-Näherung wird verwendet.');
  }
  return resolveStateFromPostalCode(postalCode);
}
