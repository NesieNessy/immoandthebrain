"use client";

import { useToast } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import {
    createRenovationMeasure,
    deleteRenovationMeasure,
    getRenovationMeasuresByProperty,
    updateRenovationMeasure,
} from '@/lib/supabase/renovation_measure.supabase';
import type { Property, RenovationMeasure } from '@immoandthebrain/types';
import { useEffect, useState } from 'react';

export interface NewMeasureForm {
    title: string;
    category: string;
    estimatedCost: string;
    preferredStartDate: Date | undefined;
}

export const EMPTY_NEW_MEASURE: NewMeasureForm = { title: '', category: '', estimatedCost: '', preferredStartDate: undefined };

/**
 * There is no craftsperson-facing portal — the property owner enters the
 * quote and completion state themselves once they have it (by phone/email/
 * etc. with the contractor), so every field here is owner-editable and every
 * change is persisted immediately rather than batched behind a page-level
 * "Save". quoteAccepted is the one field that gates the others: once a
 * measure is commissioned, its cost/date/publish/delete controls lock —
 * confirming completion is the only thing still reachable after that.
 */
export function useRenovationMeasuresData(propertyId: string) {
    const { showToast } = useToast();
    const [property, setProperty] = useState<Property | null>(null);
    const [measures, setMeasures] = useState<RenovationMeasure[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [measurePendingDelete, setMeasurePendingDelete] = useState<RenovationMeasure | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;
        Promise.all([getPropertyById(id), getRenovationMeasuresByProperty(id)]).then(([loadedProperty, loadedMeasures]) => {
            if (cancelled) return;
            setProperty(loadedProperty);
            setMeasures(loadedMeasures);
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [propertyId]);

    const replaceMeasure = (updated: RenovationMeasure | null, fallbackId: number) => {
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        setMeasures((prev) => prev.map((m) => (m.renovationMeasureId === fallbackId ? updated : m)));
    };

    // Optimistic — the field is already visible mid-edit via the caller's own
    // setMeasures before this fires (e.g. NumberField/CalendarField onChange),
    // this just persists it and reconciles with the server's row afterward.
    const persistField = async (measureId: number, patch: Partial<RenovationMeasure>) => {
        const updated = await updateRenovationMeasure(measureId, patch);
        replaceMeasure(updated, measureId);
    };

    const updateLocalField = (measureId: number, patch: Partial<RenovationMeasure>) => {
        setMeasures((prev) => prev.map((m) => (m.renovationMeasureId === measureId ? { ...m, ...patch } : m)));
    };

    const addMeasure = async (form: NewMeasureForm) => {
        if (!property || form.title.trim() === '') return false;
        const created = await createRenovationMeasure({
            propertyId: property.propertyId,
            sortOrder: measures.length,
            title: form.title.trim(),
            category: form.category !== '' ? form.category : null,
            description: null,
            estimatedCost: form.estimatedCost !== '' ? Number(form.estimatedCost) : null,
            quotedCost: null,
            preferredStartDate: form.preferredStartDate ? form.preferredStartDate.toISOString().slice(0, 10) : null,
            quotedStartDate: null,
            actualCompletionDate: null,
            published: false,
            quoteAccepted: false,
            craftsmanConfirmedCompleted: false,
            customerConfirmedCompleted: false,
            craftsmanNotes: null,
        });
        if (!created) {
            showToast('Maßnahme konnte nicht angelegt werden.', 'error');
            return false;
        }
        setMeasures((prev) => [...prev, created]);
        return true;
    };

    const togglePublished = (measure: RenovationMeasure) => {
        const nextPublished = !measure.published;
        updateLocalField(measure.renovationMeasureId, { published: nextPublished, publishedAt: nextPublished ? new Date().toISOString() : null });
        void persistField(measure.renovationMeasureId, { published: nextPublished, publishedAt: nextPublished ? new Date().toISOString() : null });
    };

    const toggleQuoteAccepted = (measure: RenovationMeasure) => {
        const next = !measure.quoteAccepted;
        updateLocalField(measure.renovationMeasureId, { quoteAccepted: next });
        void persistField(measure.renovationMeasureId, { quoteAccepted: next });
    };

    const toggleCraftsmanConfirmed = (measure: RenovationMeasure) => {
        const next = !measure.craftsmanConfirmedCompleted;
        // Un-confirming the contractor's report can't leave a stale customer
        // confirmation sitting on top of it.
        const patch = next ? { craftsmanConfirmedCompleted: next } : { craftsmanConfirmedCompleted: next, customerConfirmedCompleted: false };
        updateLocalField(measure.renovationMeasureId, patch);
        void persistField(measure.renovationMeasureId, patch);
    };

    const toggleCustomerConfirmed = (measure: RenovationMeasure) => {
        if (!measure.craftsmanConfirmedCompleted) return;
        const next = !measure.customerConfirmedCompleted;
        updateLocalField(measure.renovationMeasureId, { customerConfirmedCompleted: next });
        void persistField(measure.renovationMeasureId, { customerConfirmedCompleted: next });
    };

    const requestDeleteMeasure = (measure: RenovationMeasure) => setMeasurePendingDelete(measure);
    const cancelDeleteMeasure = () => setMeasurePendingDelete(null);

    const confirmDeleteMeasure = async () => {
        if (!measurePendingDelete) return;
        setIsDeleting(true);
        try {
            const success = await deleteRenovationMeasure(measurePendingDelete.renovationMeasureId);
            if (success) {
                setMeasures((prev) => prev.filter((m) => m.renovationMeasureId !== measurePendingDelete.renovationMeasureId));
                setMeasurePendingDelete(null);
            } else {
                showToast('Maßnahme konnte nicht gelöscht werden.', 'error');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    return {
        property,
        measures,
        isLoading,
        updateLocalField,
        persistField,
        addMeasure,
        togglePublished,
        toggleQuoteAccepted,
        toggleCraftsmanConfirmed,
        toggleCustomerConfirmed,
        measurePendingDelete,
        requestDeleteMeasure,
        cancelDeleteMeasure,
        confirmDeleteMeasure,
        isDeleting,
    };
}
