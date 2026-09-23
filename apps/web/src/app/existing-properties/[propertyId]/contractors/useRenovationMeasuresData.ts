"use client";

import { useToast } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import {
    createRenovationMeasure,
    deleteRenovationMeasure,
    getRenovationMeasuresByProperty,
    updateRenovationMeasure,
} from '@/lib/supabase/renovation_measure.supabase';
import type { Property, PropertyUnit, RenovationMeasure } from '@immoandthebrain/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canConfirmCustomerCompletion } from './measureStatus';

export interface NewMeasureForm {
    title: string;
    category: string;
    estimatedCost: string;
    preferredStartDate: Date | undefined;
}

export const EMPTY_NEW_MEASURE: NewMeasureForm = { title: '', category: '', estimatedCost: '', preferredStartDate: undefined };

/**
 * No craftsperson-facing portal — owner enters quote/completion state
 * themselves, so every field is owner-editable and persisted immediately
 * (no page-level "Save"). quoteAccepted locks cost/date/publish/delete;
 * only completion confirmation stays reachable after that.
 */
export function useRenovationMeasuresData(propertyId: string) {
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const contextUnitId = searchParams.get('unit');
    const [property, setProperty] = useState<Property | null>(null);
    const [measures, setMeasures] = useState<RenovationMeasure[]>([]);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [measurePendingDelete, setMeasurePendingDelete] = useState<RenovationMeasure | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;
        Promise.all([getPropertyById(id), getRenovationMeasuresByProperty(id), getPropertyUnitsByProperty(id)]).then(([loadedProperty, loadedMeasures, loadedUnits]) => {
            if (cancelled) return;
            setProperty(loadedProperty);
            setMeasures(loadedMeasures);
            setUnits(loadedUnits);
            setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, [propertyId]);

    const hasMultipleUnits = units.length > 1;
    const contextUnit = contextUnitId ? units.find((u) => u.propertyUnitId === Number(contextUnitId)) ?? null : null;

    const replaceMeasure = (updated: RenovationMeasure | null, fallbackId: number) => {
        if (!updated) {
            showToast('Änderung konnte nicht gespeichert werden.', 'error');
            return;
        }
        setMeasures((prev) => prev.map((m) => (m.renovationMeasureId === fallbackId ? updated : m)));
    };

    // Caller already applied the change optimistically via updateLocalField;
    // this persists it and reconciles with the server's row.
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
            budgetMin: null,
            budgetMax: null,
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
        // Un-confirming must also clear a stale customer confirmation.
        const patch = next ? { craftsmanConfirmedCompleted: next } : { craftsmanConfirmedCompleted: next, customerConfirmedCompleted: false };
        updateLocalField(measure.renovationMeasureId, patch);
        void persistField(measure.renovationMeasureId, patch);
    };

    const toggleCustomerConfirmed = (measure: RenovationMeasure) => {
        if (!canConfirmCustomerCompletion(measure)) return;
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
        hasMultipleUnits,
        contextUnit,
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
