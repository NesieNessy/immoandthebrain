"use client";

import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import { getProperties } from '@/lib/supabase/property.supabase';
import { getMySubscription } from '@/lib/supabase/subscription.supabase';
import type { PersonalData, Subscription } from '@immoandthebrain/types';
import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

export interface UserSettingsData {
    personalData: PersonalData | null;
    subscription: Subscription | null;
    activePropertyCount: number;
    isLoading: boolean;
    /** Sections call this after their own successful save/upload so every
     *  other section (and the sidebar's avatar, once shown there) reflects
     *  the change immediately, without every section re-fetching on its own. */
    applyPersonalDataUpdate: (updated: PersonalData) => void;
}

/** Loads everything the Einstellungen sidebar sections need once, up front —
 *  each section still owns its own edit/save logic, but they'd otherwise all
 *  duplicate this same personalData/subscription/property-count fetch. */
export function useUserSettingsData(user: User | null): UserSettingsData {
    const [personalData, setPersonalData] = useState<PersonalData | null>(null);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [activePropertyCount, setActivePropertyCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const [data, sub, properties] = await Promise.all([
                getPersonalData(user.id),
                getMySubscription(),
                getProperties(user.id),
            ]);
            if (cancelled) return;
            setPersonalData(data);
            setSubscription(sub);
            setActivePropertyCount(properties.filter((p) => !p.archivedAt).length);
            setIsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [user]);

    const applyPersonalDataUpdate = useCallback((updated: PersonalData) => {
        setPersonalData(updated);
    }, []);

    return { personalData, subscription, activePropertyCount, isLoading, applyPersonalDataUpdate };
}
