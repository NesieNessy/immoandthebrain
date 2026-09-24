"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createWeg, getWegReviews, getWegs, submitWegReview } from '@/lib/supabase/weg.supabase';
import type { WegInsert, WegReview, WegWithRating } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

export interface NewWegForm {
    name: string;
    foundedYear: string;
    city: string;
    unitCount: string;
    serviceTier: string;
    annualFeePerUnit: string;
    responseTimeHours: string;
    reachability: string;
    website: string;
    phone: string;
    email: string;
}

export const EMPTY_NEW_WEG: NewWegForm = {
    name: '', foundedYear: '', city: '', unitCount: '', serviceTier: '',
    annualFeePerUnit: '', responseTimeHours: '', reachability: '', website: '', phone: '', email: '',
};

function toNumber(value: string): number | null {
    return value.trim() === '' ? null : Number(value);
}

export function useWegsData() {
    const { user } = useRequireAuth();
    const { showToast } = useToast();
    const [wegs, setWegs] = useState<WegWithRating[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [reviewsByWeg, setReviewsByWeg] = useState<Map<number, (WegReview & { reviewerName: string })[]>>(new Map());

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const loaded = await getWegs();
            if (!cancelled) {
                setWegs(loaded);
                setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const loadReviews = async (wegId: number) => {
        const reviews = await getWegReviews(wegId);
        setReviewsByWeg((prev) => new Map(prev).set(wegId, reviews));
    };

    const addWeg = async (form: NewWegForm): Promise<boolean> => {
        if (form.name.trim() === '' || form.city.trim() === '' || form.serviceTier.trim() === '') return false;
        const payload: WegInsert = {
            createdByUserId: user?.id ?? '',
            name: form.name.trim(),
            foundedYear: toNumber(form.foundedYear),
            city: form.city.trim(),
            unitCount: toNumber(form.unitCount),
            serviceTier: form.serviceTier,
            annualFeePerUnit: toNumber(form.annualFeePerUnit),
            responseTimeHours: toNumber(form.responseTimeHours),
            reachability: form.reachability.trim() || null,
            website: form.website.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
        };
        const created = await createWeg(payload);
        if (!created) {
            showToast('WEG konnte nicht vorgeschlagen werden.', 'error');
            return false;
        }
        setWegs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showToast('WEG vorgeschlagen.', 'success');
        return true;
    };

    const rateWeg = async (wegId: number, rating: number, comment: string): Promise<boolean> => {
        const success = await submitWegReview(wegId, { rating, comment: comment.trim() || null });
        if (!success) {
            showToast('Bewertung konnte nicht gespeichert werden.', 'error');
            return false;
        }
        showToast('Bewertung gespeichert.', 'success');
        const [loaded, reviews] = await Promise.all([getWegs(), getWegReviews(wegId)]);
        setWegs(loaded);
        setReviewsByWeg((prev) => new Map(prev).set(wegId, reviews));
        return true;
    };

    return { wegs, isLoading, reviewsByWeg, loadReviews, addWeg, rateWeg };
}
