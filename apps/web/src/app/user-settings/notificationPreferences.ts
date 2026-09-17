export interface NotificationPreferenceItem {
    key: string;
    label: string;
    description: string;
    group: 'fristen' | 'ki' | 'kanaele';
}

export const NOTIFICATION_PREFERENCE_GROUPS: Record<NotificationPreferenceItem['group'], string> = {
    fristen: 'Fristen & Erinnerungen',
    ki: 'KI-Hinweise',
    kanaele: 'Kanäle',
};

export const NOTIFICATION_PREFERENCE_ITEMS: NotificationPreferenceItem[] = [
    { key: 'mietanpassung', label: 'Mietanpassungs-Erinnerungen', description: '4 Monate vor dem geplanten Datum', group: 'fristen' },
    { key: 'sanierungsfristen', label: 'Sanierungsfristen', description: '4 Monate vor Sanierungsstart', group: 'fristen' },
    { key: 'nebenkostenFaellig', label: 'Nebenkostenabrechnung fällig', description: 'Erinnerung im Januar für das Vorjahr', group: 'fristen' },
    { key: 'mieterwechsel', label: 'Mieterwechsel ausstehend', description: 'Bei geplantem Auszugsdatum', group: 'fristen' },
    { key: 'mietpotenzialHinweise', label: 'Mietpotenzial-Hinweise', description: 'Wenn der Kalkulator ungenutzte Potenziale erkennt', group: 'ki' },
    { key: 'dokumentWarnungen', label: 'Dokument-Warnungen', description: 'Z.B. veraltete Belege oder fehlende Unterlagen', group: 'ki' },
    { key: 'email', label: 'E-Mail-Benachrichtigungen', description: 'Zusammenfassung wichtiger Ereignisse per E-Mail', group: 'kanaele' },
    { key: 'inApp', label: 'In-App-Glocke', description: 'Benachrichtigungen im Dashboard', group: 'kanaele' },
];

/** A key absent from the stored preferences object means "never turned
 *  off" — every notification defaults to on, so shipping a new toggle
 *  never silently opts existing users out of it. */
export function resolveNotificationPreference(preferences: Record<string, boolean> | undefined, key: string): boolean {
    return preferences?.[key] ?? true;
}
