import { describe, expect, it } from 'vitest';
import { isValidListingUrl, listingLinkHref, normalizeListingReference } from './listingUrl';

describe('normalizeListingReference', () => {
  it.each([
    ['https://www.immobilienscout24.de/expose/123456789', 'https://www.immobilienscout24.de/expose/123456789'],
    ['http://www.kleinanzeigen.de/s-anzeige/wohnung/123', 'http://www.kleinanzeigen.de/s-anzeige/wohnung/123'],
    // links typed without a scheme get https:// — the reported SCRUM-102 case
    ['www.immobilienscout24.de/expose/123456789', 'https://www.immobilienscout24.de/expose/123456789'],
    ['immobilienscout24.de/expose/123456789', 'https://immobilienscout24.de/expose/123456789'],
    ['  www.immowelt.de/expose/2abc3  ', 'https://www.immowelt.de/expose/2abc3'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeListingReference(input)).toBe(expected);
  });

  it('only trims input that is not link-shaped', () => {
    expect(normalizeListingReference('  Kleinanzeigen ')).toBe('Kleinanzeigen');
  });

  it.each([null, undefined, '', '   '])('turns an empty value (%s) into an empty string', (input) => {
    expect(normalizeListingReference(input)).toBe('');
  });

  it('is idempotent, so normalizing on the client and again on the server changes nothing', () => {
    for (const input of ['www.immowelt.de/x', 'https://immowelt.de']) {
      const once = normalizeListingReference(input);
      expect(normalizeListingReference(once)).toBe(once);
    }
  });
});

describe('isValidListingUrl', () => {
  it.each([
    'https://www.immobilienscout24.de/expose/123456789',
    'https://www.immowelt.de/expose/2abc3',
    'http://www.kleinanzeigen.de/s-anzeige/wohnung/123',
    'www.immobilienscout24.de/expose/123456789',
    'immobilienscout24.de/expose/123456789',
    'immowelt.de',
    '  https://www.immowelt.de/expose/2abc3  ',
  ])('accepts %s', (input) => {
    expect(isValidListingUrl(input)).toBe(true);
  });

  it.each([
    ['plain text', 'Kleinanzeigen'],
    ['text with a number', 'ImmoScout 428'],
    ['scheme only', 'https://'],
    ['host without a domain', 'https://localhost'],
    ['whitespace inside the link', 'https://www.immowelt.de/expose/2 abc3'],
    ['another scheme', 'ftp://example.com/file'],
    ['a script link', 'javascript:alert(1)'],
    ['empty', ''],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(isValidListingUrl(input)).toBe(false);
  });
});

describe('listingLinkHref', () => {
  it('returns the normalized link for a valid URL', () => {
    expect(listingLinkHref('https://www.immowelt.de/expose/2abc3')).toBe('https://www.immowelt.de/expose/2abc3');
    expect(listingLinkHref('www.immowelt.de/expose/2abc3')).toBe('https://www.immowelt.de/expose/2abc3');
  });

  it('returns nothing for anything that is not a valid URL', () => {
    expect(listingLinkHref('Kleinanzeigen')).toBeNull();
    expect(listingLinkHref('javascript:alert(1)')).toBeNull();
    expect(listingLinkHref('')).toBeNull();
  });
});
