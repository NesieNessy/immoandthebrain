"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createDefect, deleteDefect, getDefectsByMeasure } from '@/lib/supabase/renovation_measure_defect.supabase';
import {
    createQuote,
    deleteQuote,
    getQuoteDocumentUrl,
    getQuotesByMeasure,
    setQuoteAccepted,
} from '@/lib/supabase/renovation_measure_quote.supabase';
import type { RenovationMeasure, RenovationMeasureDefect, RenovationMeasureQuote } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

/**
 * One measure's Angebote and Mängel — loaded when its panel in the status
 * table opens. `commit` saves a change of the measure itself (optimistic),
 * e.g. accepting a quote sets quoteAccepted + quotedCost.
 */
export function useMeasureWork(measure: RenovationMeasure, commit: (patch: Partial<RenovationMeasure>) => void) {
    const { showToast } = useToast();
    const { user } = useRequireAuth();
    const [quotes, setQuotes] = useState<RenovationMeasureQuote[]>([]);
    const [defects, setDefects] = useState<RenovationMeasureDefect[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const measureId = measure.renovationMeasureId;

    useEffect(() => {
        let cancelled = false;
        Promise.all([getQuotesByMeasure(measureId), getDefectsByMeasure(measureId)]).then(([loadedQuotes, loadedDefects]) => {
            if (cancelled) return;
            setQuotes(loadedQuotes);
            setDefects(loadedDefects);
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [measureId]);

    // ── Quotes ───────────────────────────────────────────────────────────
    const addQuote = async (companyName: string, cost: string, file: File | null) => {
        if (!user || companyName.trim() === '') return false;
        const created = await createQuote({
            renovationMeasureId: measureId,
            propertyId: measure.propertyId,
            sortOrder: quotes.length,
            companyName: companyName.trim(),
            cost: cost !== '' ? Number(cost) : null,
        }, user.id, file);
        if (!created) {
            showToast('Angebot konnte nicht angelegt werden.', 'error');
            return false;
        }
        setQuotes((prev) => [...prev, created]);
        return true;
    };

    // Only one quote can be accepted at a time. Accepting commissions the
    // measure with that quote's cost (and locks it).
    const acceptQuote = async (quote: RenovationMeasureQuote) => {
        const others = quotes.filter((q) => q.renovationMeasureQuoteId !== quote.renovationMeasureQuoteId && q.accepted);
        setQuotes((prev) => prev.map((q) => ({ ...q, accepted: q.renovationMeasureQuoteId === quote.renovationMeasureQuoteId })));
        await Promise.all(others.map((q) => setQuoteAccepted(q.renovationMeasureQuoteId, false)));
        const updated = await setQuoteAccepted(quote.renovationMeasureQuoteId, true);
        if (updated) setQuotes((prev) => prev.map((q) => (q.renovationMeasureQuoteId === updated.renovationMeasureQuoteId ? updated : q)));
        commit({ quoteAccepted: true, quotedCost: quote.cost });
    };

    /** Undoes the commission: unlocks the measure so another quote can be chosen. */
    const withdrawAcceptance = async () => {
        const accepted = quotes.filter((q) => q.accepted);
        setQuotes((prev) => prev.map((q) => ({ ...q, accepted: false })));
        await Promise.all(accepted.map((q) => setQuoteAccepted(q.renovationMeasureQuoteId, false)));
        commit({ quoteAccepted: false });
    };

    const removeQuote = async (quote: RenovationMeasureQuote) => {
        const success = await deleteQuote(quote.renovationMeasureQuoteId, quote.documentPath);
        if (!success) {
            showToast('Angebot konnte nicht gelöscht werden.', 'error');
            return;
        }
        setQuotes((prev) => prev.filter((q) => q.renovationMeasureQuoteId !== quote.renovationMeasureQuoteId));
        if (quote.accepted) commit({ quoteAccepted: false, quotedCost: null });
    };

    const viewQuoteDocument = async (quote: RenovationMeasureQuote) => {
        if (!quote.documentPath) return;
        const url = await getQuoteDocumentUrl(quote.documentPath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else showToast('Dokument konnte nicht geöffnet werden.', 'error');
    };

    // ── Defects ──────────────────────────────────────────────────────────
    const addDefect = async (description: string) => {
        if (description.trim() === '') return false;
        const created = await createDefect({
            renovationMeasureId: measureId,
            propertyId: measure.propertyId,
            sortOrder: defects.length,
            description: description.trim(),
        });
        if (!created) {
            showToast('Mangel konnte nicht hinzugefügt werden.', 'error');
            return false;
        }
        setDefects((prev) => [...prev, created]);
        return true;
    };

    const removeDefect = async (defect: RenovationMeasureDefect) => {
        const success = await deleteDefect(defect.renovationMeasureDefectId);
        if (success) setDefects((prev) => prev.filter((d) => d.renovationMeasureDefectId !== defect.renovationMeasureDefectId));
        else showToast('Mangel konnte nicht gelöscht werden.', 'error');
    };

    return {
        quotes,
        defects,
        isLoading,
        addQuote,
        acceptQuote,
        withdrawAcceptance,
        removeQuote,
        viewQuoteDocument,
        addDefect,
        removeDefect,
    };
}
