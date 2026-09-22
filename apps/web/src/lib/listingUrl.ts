/**
 * The listing reference a user enters for a property — "Portal-URL" in the
 * Ersteinschätzung, "Inserats-URL" in the Detailbewertung. It is carried from
 * the first into the second, so both have to treat it the same way; this is
 * the one place that rule lives.
 *
 * The field is free text on purpose. Portal import is not implemented, so it
 * is a note about where the listing came from, and people fill it in three
 * ways: a full link, a link without "https://" ("immowelt.de/expose/…"), or
 * just the portal's name ("Kleinanzeigen"). All three are accepted.
 * Link-shaped input without a scheme gets "https://" so it can be opened;
 * anything else is kept as the text it is.
 */

const HAS_HTTP_SCHEME = /^https?:\/\//i;
const DOMAIN_LIKE = /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

/** The value to store: trimmed, with "https://" added to link-shaped input that lacks a scheme. */
export function normalizeListingReference(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || HAS_HTTP_SCHEME.test(trimmed)) return trimmed;
  return DOMAIN_LIKE.test(trimmed) ? `https://${trimmed}` : trimmed;
}

/** An http(s) link to open for this reference, or null if it is a plain-text note. */
export function listingLinkHref(value?: string | null): string | null {
  const normalized = normalizeListingReference(value);
  return HAS_HTTP_SCHEME.test(normalized) ? normalized : null;
}
