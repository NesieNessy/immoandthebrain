import { describe, expect, it } from 'vitest';
import { listingLinkHref, normalizeListingReference } from './listingUrl';

describe('normalizeListingReference', () => {
  it.each([
    // full links are kept exactly as entered
    ['https://www.immobilienscout24.de/expose/123456789', 'https://www.immobilienscout24.de/expose/123456789'],
    ['http://www.kleinanzeigen.de/s-anzeige/wohnung/123', 'http://www.kleinanzeigen.de/s-anzeige/wohnung/123'],
    // links typed without a scheme get https:// — the reported SCRUM-102 case
    ['www.immobilienscout24.de/expose/123456789', 'https://www.immobilienscout24.de/expose/123456789'],
    ['immobilienscout24.de/expose/123456789', 'https://immobilienscout24.de/expose/123456789'],
    ['immowelt.de', 'https://immowelt.de'],
    // plain text is a valid note and stays untouched
    ['Kleinanzeigen', 'Kleinanzeigen'],
    ['ImmoScout 428', 'ImmoScout 428'],
    // surrounding whitespace is dropped
    ['  www.immowelt.de/expose/2abc3  ', 'https://www.immowelt.de/expose/2abc3'],
    ['  Kleinanzeigen ', 'Kleinanzeigen'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeListingReference(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('turns an empty value (%s) into an empty string', (input) => {
    expect(normalizeListingReference(input)).toBe('');
  });

  it('is idempotent, so normalizing on the client and again on the server changes nothing', () => {
    for (const input of ['www.immowelt.de/x', 'https://immowelt.de', 'Kleinanzeigen']) {
      const once = normalizeListingReference(input);
      expect(normalizeListingReference(once)).toBe(once);
    }
  });
});

describe('listingLinkHref', () => {
  it('returns a clickable link for real links, with or without scheme', () => {
    expect(listingLinkHref('https://www.immowelt.de/expose/2abc3')).toBe('https://www.immowelt.de/expose/2abc3');
    expect(listingLinkHref('www.immowelt.de/expose/2abc3')).toBe('https://www.immowelt.de/expose/2abc3');
  });

  it('returns nothing for a plain-text note or an empty value', () => {
    expect(listingLinkHref('Kleinanzeigen')).toBeNull();
    expect(listingLinkHref('')).toBeNull();
    expect(listingLinkHref(null)).toBeNull();
  });

  it('never turns a non-http scheme into a link', () => {
    expect(listingLinkHref('javascript:alert(1)')).toBeNull();
    expect(listingLinkHref('ftp://example.com/file')).toBeNull();
  });
});
