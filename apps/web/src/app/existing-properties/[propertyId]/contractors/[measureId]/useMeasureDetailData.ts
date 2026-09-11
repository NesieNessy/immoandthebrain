"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import {
    getRenovationMeasureById,
    updateRenovationMeasure,
} from '@/lib/supabase/renovation_measure.supabase';
import {
    createDefect,
    deleteDefect,
    getDefectsByMeasure,
} from '@/lib/supabase/renovation_measure_defect.supabase';
import {
    deletePhoto,
    getPhotosByMeasure,
    getPhotoUrl,
    uploadPhoto,
} from '@/lib/supabase/renovation_measure_photo.supabase';
import {
    createQuote,
    deleteQuote,
    getQuoteDocumentUrl,
    getQuotesByMeasure,
    setQuoteAccepted,
} from '@/lib/supabase/renovation_measure_quote.supabase';
import type {
    Property,
    RenovationMeasure,
    RenovationMeasureDefect,
    RenovationMeasurePhoto,
    RenovationMeasureQuote,
} from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

/**
 * There is no craftsperson-facing portal — every field here is owner-
 * editable, and (matching the overview table) every change is persisted
 * immediately. quoteAccepted is what locks the measure's core fields;
 * accepting a quote from the list below sets it the same way the overview
 * table's "Beauftragt" toggle does.
 */
export function useMeasureDetailData(propertyId: string, measureId: string) {
    const { showToast } = useToast();
    const { user } = useRequireAuth();
    const [property, setProperty] = useState<Property | null>(null);
    const [measure, setMeasure] = useState<RenovationMeasure | null>(null);
    const [quotes, setQuotes] = useState<RenovationMeasureQuote[]>([]);
    const [defects, setDefects] = useState<RenovationMeasureDefect[]>([]);
    const [photos, setPhotos] = useState<RenovationMeasurePhoto[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        const propId = parseInt(propertyId, 10);
        const measId = parseInt(measureId, 10);
        let cancelled = false;
        Promise.all([
            getPropertyById(propId),
            getRenovationMeasureById(measId),
            getQuotesByMeasure(measId),
            getDefectsByMeasure(measId),
            getPhotosByMeasure(measId),
        ]).then(([loadedProperty, loadedMeasure, loadedQuotes, loadedDefects, loadedPhotos]) => {
            if (cancelled) return;
            setProperty(loadedProperty);
            setMeasure(loadedMeasure);
            setQuotes(loadedQuotes);
            setDefects(loadedDefects);
            setPhotos(loadedPhotos);
            setNotFound(!loadedMeasure);
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [propertyId, measureId]);

    const isLocked = measure?.quoteAccepted ?? false;

    // ── Measure fields ──────────────────────────────────────────────────
    const updateLocalField = (patch: Partial<RenovationMeasure>) => {
        setMeasure((prev) => (prev ? { ...prev, ...patch } : prev));
    };

    const persistField = async (patch: Partial<RenovationMeasure>) => {
        if (!measure) return;
        const updated = await updateRenovationMeasure(measure.renovationMeasureId, patch);
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        setMeasure(updated);
    };

    const commitField = (patch: Partial<RenovationMeasure>) => {
        updateLocalField(patch);
        void persistField(patch);
    };

    const togglePublished = () => {
        if (!measure) return;
        const next = !measure.published;
        commitField({ published: next, publishedAt: next ? new Date().toISOString() : null });
    };

    const toggleCraftsmanConfirmed = () => {
        if (!measure) return;
        const next = !measure.craftsmanConfirmedCompleted;
        commitField(next ? { craftsmanConfirmedCompleted: next } : { craftsmanConfirmedCompleted: next, customerConfirmedCompleted: false });
    };

    const toggleCustomerConfirmed = () => {
        if (!measure || !measure.craftsmanConfirmedCompleted) return;
        commitField({ customerConfirmedCompleted: !measure.customerConfirmedCompleted });
    };

    // ── Quotes ───────────────────────────────────────────────────────────
    const addQuote = async (companyName: string, cost: string, file: File | null) => {
        if (!measure || !user || companyName.trim() === '') return false;
        const created = await createQuote({
            renovationMeasureId: measure.renovationMeasureId,
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

    // Only one quote can be accepted at a time — clears any other accepted
    // quote on this measure, then syncs the parent measure's quotedCost /
    // quoteAccepted so the overview table keeps reflecting it.
    const acceptQuote = async (quote: RenovationMeasureQuote) => {
        if (!measure) return;
        const others = quotes.filter((q) => q.renovationMeasureQuoteId !== quote.renovationMeasureQuoteId && q.accepted);
        setQuotes((prev) => prev.map((q) => ({ ...q, accepted: q.renovationMeasureQuoteId === quote.renovationMeasureQuoteId })));
        await Promise.all(others.map((q) => setQuoteAccepted(q.renovationMeasureQuoteId, false)));
        const updated = await setQuoteAccepted(quote.renovationMeasureQuoteId, true);
        if (updated) setQuotes((prev) => prev.map((q) => (q.renovationMeasureQuoteId === updated.renovationMeasureQuoteId ? updated : q)));
        commitField({ quoteAccepted: true, quotedCost: quote.cost });
    };

    const removeQuote = async (quote: RenovationMeasureQuote) => {
        const success = await deleteQuote(quote.renovationMeasureQuoteId, quote.documentPath);
        if (!success) {
            showToast('Angebot konnte nicht gelöscht werden.', 'error');
            return;
        }
        setQuotes((prev) => prev.filter((q) => q.renovationMeasureQuoteId !== quote.renovationMeasureQuoteId));
        if (quote.accepted && measure) commitField({ quoteAccepted: false, quotedCost: null });
    };

    const viewQuoteDocument = async (quote: RenovationMeasureQuote) => {
        if (!quote.documentPath) return;
        const url = await getQuoteDocumentUrl(quote.documentPath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // ── Defects ──────────────────────────────────────────────────────────
    const addDefect = async (description: string) => {
        if (!measure || description.trim() === '') return false;
        const created = await createDefect({
            renovationMeasureId: measure.renovationMeasureId,
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
    };

    // ── Photos ───────────────────────────────────────────────────────────
    const addPhoto = async (file: File) => {
        if (!measure || !user) return;
        const created = await uploadPhoto(user.id, measure.propertyId, measure.renovationMeasureId, file);
        if (!created) {
            showToast('Bild konnte nicht hochgeladen werden.', 'error');
            return;
        }
        setPhotos((prev) => [...prev, created]);
    };

    const removePhoto = async (photo: RenovationMeasurePhoto) => {
        const success = await deletePhoto(photo.renovationMeasurePhotoId, photo.storagePath);
        if (success) setPhotos((prev) => prev.filter((p) => p.renovationMeasurePhotoId !== photo.renovationMeasurePhotoId));
    };

    const viewPhoto = async (photo: RenovationMeasurePhoto) => {
        const url = await getPhotoUrl(photo.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    return {
        property,
        measure,
        quotes,
        defects,
        photos,
        isLoading,
        notFound,
        isLocked,
        updateLocalField,
        commitField,
        togglePublished,
        toggleCraftsmanConfirmed,
        toggleCustomerConfirmed,
        addQuote,
        acceptQuote,
        removeQuote,
        viewQuoteDocument,
        addDefect,
        removeDefect,
        addPhoto,
        removePhoto,
        viewPhoto,
    };
}
