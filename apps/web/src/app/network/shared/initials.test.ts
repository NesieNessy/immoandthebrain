import { describe, expect, it } from 'vitest';
import { nameInitials } from './initials';

describe('nameInitials', () => {
    it('takes the first character of the first and last word', () => {
        expect(nameInitials('Klaus Fischer')).toBe('KF');
        expect(nameInitials('inb Expertenkommentar')).toBe('IE');
    });

    it('uses the same single character twice for a one-word name', () => {
        expect(nameInitials('Cher')).toBe('CC');
    });

    it('ignores extra internal whitespace', () => {
        expect(nameInitials('  Klaus   Fischer  ')).toBe('KF');
    });

    it('returns a dash for an empty or whitespace-only name', () => {
        expect(nameInitials('')).toBe('–');
        expect(nameInitials('   ')).toBe('–');
    });
});
