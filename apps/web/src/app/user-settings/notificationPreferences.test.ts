import { describe, expect, it } from 'vitest';
import { resolveNotificationPreference } from './notificationPreferences';

describe('resolveNotificationPreference', () => {
    it('defaults to true when the key is absent', () => {
        expect(resolveNotificationPreference({}, 'email')).toBe(true);
        expect(resolveNotificationPreference(undefined, 'email')).toBe(true);
    });

    it('returns the stored value when the key is present', () => {
        expect(resolveNotificationPreference({ email: false }, 'email')).toBe(false);
        expect(resolveNotificationPreference({ email: true }, 'email')).toBe(true);
    });

    it('only the requested key is read, other keys do not interfere', () => {
        expect(resolveNotificationPreference({ email: false, inApp: false }, 'sanierungsfristen')).toBe(true);
    });
});
