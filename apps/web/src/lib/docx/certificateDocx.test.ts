import { describe, expect, it } from 'vitest';
import { parseImageDataUrl } from './certificateDocx';

describe('parseImageDataUrl', () => {
    it('parses a PNG data URL', () => {
        expect(parseImageDataUrl('data:image/png;base64,iVBORw0KGgo')).toEqual({ type: 'png', base64: 'iVBORw0KGgo' });
    });

    it('parses a JPEG data URL as type "jpg"', () => {
        expect(parseImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toEqual({ type: 'jpg', base64: '/9j/4AAQ' });
    });

    it('parses a JPG-suffixed MIME type the same way', () => {
        expect(parseImageDataUrl('data:image/jpg;base64,/9j/4AAQ')).toEqual({ type: 'jpg', base64: '/9j/4AAQ' });
    });

    it('is case-insensitive on the MIME type', () => {
        expect(parseImageDataUrl('data:IMAGE/PNG;base64,iVBORw0KGgo')).toEqual({ type: 'png', base64: 'iVBORw0KGgo' });
    });

    it('returns null for a non-image data URL', () => {
        expect(parseImageDataUrl('data:application/pdf;base64,JVBERi0x')).toBeNull();
    });

    it('returns null for a plain (non-data-URL) string', () => {
        expect(parseImageDataUrl('iVBORw0KGgo')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(parseImageDataUrl('')).toBeNull();
    });
});
