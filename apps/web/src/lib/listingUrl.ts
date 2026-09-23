/**
 * The listing URL a user enters for a property — "Portal-URL" in the
 * Ersteinschätzung, "Inserats-URL" in the Detailbewertung. It is carried from
 * the first into the second, so both apply the same rule; this is the one
 * place it lives. The portal dialog (components/features/PortalImportSection),
 * both forms and both API routes all check against it.
 *
 * Only real web links are accepted. A link typed without a scheme
 * ("immowelt.de/expose/…", "www.…") counts as valid and is stored with
 * "https://" added. Plain text such as "Kleinanzeigen" is not a link and is
 * rejected — older quick checks may still hold such text from before this
 * rule, which is why callers check validity instead of assuming it.
 */

const HAS_HTTP_SCHEME = /^https?:\/\//i;
const DOMAIN_LIKE = /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

export const LISTING_URL_ERROR = 'Bitte eine gültige URL eingeben, z. B. https://www.immobilienscout24.de/expose/…';

/** Trimmed, with "https://" added to link-shaped input that lacks a scheme. Other input is only trimmed. */
export function normalizeListingReference(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || HAS_HTTP_SCHEME.test(trimmed)) return trimmed;
  return DOMAIN_LIKE.test(trimmed) ? `https://${trimmed}` : trimmed;
}

/**
 * Whether the value is a usable http(s) link once normalized: it parses as a
 * URL, uses http or https, contains no whitespace, and names a host with a
 * domain ("https://" alone or "https://localhost" do not count).
 */
export function isValidListingUrl(value?: string | null): boolean {
  const normalized = normalizeListingReference(value);
  if (!normalized || /\s/.test(normalized)) return false;
  try {
    const url = new URL(normalized);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** The link to store or open for this value, or null if it is not a valid listing URL. */
export function listingLinkHref(value?: string | null): string | null {
  return isValidListingUrl(value) ? normalizeListingReference(value) : null;
}
