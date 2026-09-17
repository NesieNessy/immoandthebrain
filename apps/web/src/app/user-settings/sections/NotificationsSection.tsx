"use client";

import { Button, Icons, SectionLabel, Switch, Tile, useToast } from '@/components/ui';
import { updatePersonalData } from '@/lib/supabase/personal_data.supabase';
import type { PersonalData } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';
import { NOTIFICATION_PREFERENCE_GROUPS, NOTIFICATION_PREFERENCE_ITEMS, resolveNotificationPreference } from '../notificationPreferences';

const GROUP_ORDER = ['fristen', 'ki', 'kanaele'] as const;

export function NotificationsSection({ userId, personalData, onSaved }: {
    userId: string;
    personalData: PersonalData;
    onSaved: (updated: PersonalData) => void;
}) {
    const { showToast } = useToast();
    const [preferences, setPreferences] = useState<Record<string, boolean>>(personalData.notificationPreferences ?? {});
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setPreferences(personalData.notificationPreferences ?? {});
        setIsDirty(false);
    }, [personalData]);

    const handleToggle = (key: string, checked: boolean) => {
        setPreferences((prev) => ({ ...prev, [key]: checked }));
        setIsDirty(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const updated = await updatePersonalData(userId, { notificationPreferences: preferences });
        setIsSaving(false);
        if (!updated) {
            showToast('Einstellungen konnten nicht gespeichert werden.', 'error');
            return;
        }
        onSaved(updated);
        setIsDirty(false);
        showToast('Benachrichtigungen gespeichert.', 'success');
    };

    return (
        <Tile title="Benachrichtigungen" description="Steuern Sie, wann und wie Sie über wichtige Ereignisse informiert werden.">
            {GROUP_ORDER.map((group) => (
                <div key={group} className="mb-6 last:mb-0">
                    <SectionLabel>{NOTIFICATION_PREFERENCE_GROUPS[group]}</SectionLabel>
                    <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                        {NOTIFICATION_PREFERENCE_ITEMS.filter((item) => item.group === group).map((item) => (
                            <div key={item.key} className="flex items-center justify-between gap-4 p-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                                    <p className="text-xs text-muted-foreground">{item.description}</p>
                                </div>
                                <Switch
                                    checked={resolveNotificationPreference(preferences, item.key)}
                                    onCheckedChange={(checked) => handleToggle(item.key, checked)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="flex justify-end">
                <Button
                    label={isSaving ? 'Speichert…' : 'Speichern'}
                    icon={isSaving ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                    variant="primary"
                    disabled={!isDirty || isSaving}
                    onClick={() => void handleSave()}
                />
            </div>
        </Tile>
    );
}
