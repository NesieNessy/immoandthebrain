'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
    deleteQuickChecks,
    getAllQuickChecks,
    type QuickCheckOverview,
} from '@/lib/supabase/quick_check.supabase';
import { useCallback, useEffect, useState } from 'react';

export interface UseQuickChecksResult {
    data: QuickCheckOverview[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
    deleteSelected: (ids: number[]) => Promise<void>;
}

/**
 * @param detailCheck Filters by quick_check.detail_check — false (default)
 *   for the quick-check overview, true for the detail-check
 *   overview. A row moves from one list to the other after the first
 *   detail-check page has been saved successfully.
 */
export function useQuickChecks(detailCheck = false): UseQuickChecksResult {
    const { user } = useRequireAuth();
    const [data, setData] = useState<QuickCheckOverview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const rows = await getAllQuickChecks(detailCheck);
            setData(rows);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        } finally {
            setIsLoading(false);
        }
    }, [detailCheck]);

    // Firing before the Supabase session finishes restoring sends this
    // request with no token, which the server can only answer with an
    // uncaught 401 (this app has no auth middleware, so a thrown Response
    // becomes a bare 500) — and since this effect never re-ran, the page
    // was stuck on that failure even after the session became available.
    useEffect(() => {
        if (!user) return;
        fetch();
    }, [user, fetch]);

    const deleteSelected = useCallback(async (ids: number[]) => {
        await deleteQuickChecks(ids);
        setData((prev) => prev.filter((row) => !ids.includes(row.quickCheckId)));
    }, []);

    return {
        data,
        isLoading,
        error,
        refetch: fetch,
        deleteSelected,
    };
}
