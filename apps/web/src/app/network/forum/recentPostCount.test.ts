import { describe, expect, it } from 'vitest';
import { recentPostCount } from './recentPostCount';

const NOW = new Date('2026-06-15T12:00:00.000Z');

describe('recentPostCount', () => {
    it('counts posts created within the last 7 days', () => {
        const posts = [
            { createdAt: '2026-06-15T00:00:00.000Z' }, // today
            { createdAt: '2026-06-10T00:00:00.000Z' }, // 5 days ago
            { createdAt: '2026-06-08T00:00:00.000Z' }, // exactly 7 days ago
        ];
        expect(recentPostCount(posts, NOW)).toBe(3);
    });

    it('excludes posts older than 7 days', () => {
        const posts = [
            { createdAt: '2026-06-01T00:00:00.000Z' }, // 14 days ago
            { createdAt: '2026-05-01T00:00:00.000Z' },
        ];
        expect(recentPostCount(posts, NOW)).toBe(0);
    });

    it('returns 0 for an empty list', () => {
        expect(recentPostCount([], NOW)).toBe(0);
    });
});
