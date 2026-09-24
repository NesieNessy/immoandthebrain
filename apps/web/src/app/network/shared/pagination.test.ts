import { describe, expect, it } from 'vitest';
import { clampPage, paginate, totalPages } from './pagination';

describe('paginate', () => {
    const items = Array.from({ length: 22 }, (_, i) => i + 1);

    it('returns the first pageSize items for page 1', () => {
        expect(paginate(items, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('returns the next slice for later pages', () => {
        expect(paginate(items, 2, 10)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    });

    it('returns a partial final page', () => {
        expect(paginate(items, 3, 10)).toEqual([21, 22]);
    });

    it('returns an empty array for a page past the end', () => {
        expect(paginate(items, 5, 10)).toEqual([]);
    });
});

describe('totalPages', () => {
    it('rounds up to cover a partial last page', () => {
        expect(totalPages(22, 10)).toBe(3);
        expect(totalPages(20, 10)).toBe(2);
    });

    it('is always at least 1, even for an empty list', () => {
        expect(totalPages(0, 10)).toBe(1);
    });
});

describe('clampPage', () => {
    it('clamps below 1 up to 1', () => {
        expect(clampPage(0, 22, 10)).toBe(1);
        expect(clampPage(-5, 22, 10)).toBe(1);
    });

    it('clamps above the last page down to it', () => {
        expect(clampPage(99, 22, 10)).toBe(3);
    });

    it('leaves an in-range page untouched', () => {
        expect(clampPage(2, 22, 10)).toBe(2);
    });
});
