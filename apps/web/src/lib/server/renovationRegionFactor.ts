import { postalCodePrefixes, resolveRegionFactor } from '@/lib/renovation/regionFactor';
import { db } from './db';

/** Postgres "undefined_table" — the migration has not been applied to this database yet. */
const UNDEFINED_TABLE = '42P01';

/**
 * Regional factor for a postal code, read from `renovation_region_factor`.
 * One query fetches every candidate prefix (5, 4, 3 and 2 digits); which of
 * them wins is decided by `resolveRegionFactor`.
 */
export async function loadRenovationRegionFactor(postalCode?: string | null): Promise<number> {
  const prefixes = postalCodePrefixes(postalCode);
  if (prefixes.length === 0) return 1;
  try {
    const { rows } = await db.query(
      'SELECT plz_prefix, factor FROM renovation_region_factor WHERE plz_prefix = ANY($1::text[])',
      [prefixes],
    );
    return resolveRegionFactor(
      postalCode,
      rows.map((row) => ({ plzPrefix: String(row.plz_prefix), factor: Number(row.factor) })),
    );
  } catch (error) {
    // Code and database are deployed separately. If this code reaches a
    // database that does not have the table yet, the renovation step would
    // otherwise fail outright. Neutral pricing is the lesser harm — but it
    // must not happen silently, so it is logged every time.
    if ((error as { code?: string }).code === UNDEFINED_TABLE) {
      console.error(
        'renovation_region_factor fehlt – Migration 20260922000001_renovation_region_factor.sql ist nicht eingespielt. Regionalfaktor 1,0 wird verwendet.',
      );
      return 1;
    }
    throw error;
  }
}
