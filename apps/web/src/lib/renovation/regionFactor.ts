/**
 * Regional price factor for the renovation cost indication.
 *
 * The factors live in the `renovation_region_factor` table
 * (supabase/migrations/20260922000001_renovation_region_factor.sql), keyed by
 * postal-code prefix. This module only holds the lookup rule, so it can run
 * anywhere and be tested without a database: the server loads the candidate
 * rows (see lib/server/renovationRegionFactor.ts) and passes them in.
 */

export type RegionFactorEntry = { plzPrefix: string; factor: number };

/**
 * The prefixes to look up, most specific first: the full 5-digit postal code,
 * then its first 4, 3 and 2 digits. Empty for anything that is not a 5-digit
 * German postal code, which leads to the neutral factor 1.
 */
export function postalCodePrefixes(postalCode?: string | null): string[] {
  const plz = (postalCode ?? '').trim();
  if (!/^\d{5}$/.test(plz)) return [];
  return [plz, plz.slice(0, 4), plz.slice(0, 3), plz.slice(0, 2)];
}

/**
 * Factor of the longest prefix that matches, or 1 when none does. A longer
 * prefix overrides a shorter one, so a city can sit inside a broader area with
 * its own value (14 = Brandenburg, 140 = Berlin, 1446 = Potsdam).
 *
 * Rows with a factor that is not a positive number are skipped rather than
 * trusted, and the search moves on to the next shorter prefix.
 */
export function resolveRegionFactor(
  postalCode: string | null | undefined,
  entries: RegionFactorEntry[],
): number {
  const byPrefix = new Map(
    entries
      .filter((entry) => Number.isFinite(entry.factor) && entry.factor > 0)
      .map((entry) => [entry.plzPrefix, entry.factor]),
  );
  for (const prefix of postalCodePrefixes(postalCode)) {
    const factor = byPrefix.get(prefix);
    if (factor !== undefined) return factor;
  }
  return 1;
}
