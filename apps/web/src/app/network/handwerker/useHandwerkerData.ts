"use client";

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getOpenJobs } from '@/lib/supabase/renovation_measure_job.supabase';
import type { RenovationMeasureJobListing } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

export function useHandwerkerData() {
    const { user } = useRequireAuth();
    const [jobs, setJobs] = useState<RenovationMeasureJobListing[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const loaded = await getOpenJobs();
            if (!cancelled) {
                setJobs(loaded);
                setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    return { jobs, isLoading };
}
