'use client';

import { archiveProperty, deleteProperty, getPropertiesOverview, type PropertyOverview } from '@/lib/supabase/property.supabase';
import { useCallback, useEffect, useState } from 'react';

export interface UsePropertiesResult {
    data: PropertyOverview[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
    deleteSelected: (id: number) => Promise<void>;
    archiveSelected: (id: number) => Promise<void>;
}

/**
 * @param userId Current user's id (from useRequireAuth in the caller) —
 *   getPropertiesOverview needs it explicitly, unlike the quick_check
 *   queries which rely on RLS alone. Fetch is skipped until it's available.
 */
export function useProperties(userId: string | undefined): UsePropertiesResult {
    const [data, setData] = useState<PropertyOverview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        setError(null);
        try {
            const rows = await getPropertiesOverview(userId);
            setData(rows);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        fetch();
    }, [fetch]);

    const deleteSelected = useCallback(async (id: number) => {
        const success = await deleteProperty(id);
        if (!success) throw new Error('Löschen fehlgeschlagen');
        setData((prev) => prev.filter((row) => row.propertyId !== id));
    }, []);

    const archiveSelected = useCallback(async (id: number) => {
        const archived = await archiveProperty(id);
        if (!archived) throw new Error('Archivieren fehlgeschlagen');
        setData((prev) => prev.map((row) => row.propertyId === id ? { ...row, archivedAt: archived.archivedAt } : row));
    }, []);

    return {
        data,
        isLoading,
        error,
        refetch: fetch,
        deleteSelected,
        archiveSelected,
    };
}
