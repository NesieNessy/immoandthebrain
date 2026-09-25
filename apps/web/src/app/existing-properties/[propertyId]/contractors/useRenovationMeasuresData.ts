"use client";

import { CUSTOM_MEASURE } from '@/components/features/RenovationMeasurePicker';
import { useToast } from '@/components/ui';
import { getPropertyPricingContext, type PropertyPricingContext } from '@/lib/api/renovationPricing';
import { indicatePriceRange, type RenovationCategory } from '@/lib/renovation/catalog';
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
    category: RenovationCategory | '';
    /** A catalog measure, or CUSTOM_MEASURE for a free-text `customTitle`. */
    measure: string;
    customTitle: string;
    estimatedCost: string;
    preferredStartDate: Date | undefined;
}

export const EMPTY_NEW_MEASURE: NewMeasureForm = { category: '', measure: '', customTitle: '', estimatedCost: '', preferredStartDate: undefined };

/** The title the new measure will be saved under ('' while none is chosen yet). */
export function newMeasureTitle(form: NewMeasureForm): string {
    return (form.measure === CUSTOM_MEASURE ? form.customTitle : form.measure).trim();
}

/** Catalog price range for the form's measure — null for a free-text one. */
export function newMeasurePriceRange(form: NewMeasureForm, context: PropertyPricingContext | null) {
    if (!form.category || !form.measure || form.measure === CUSTOM_MEASURE) return null;
    return indicatePriceRange(form.category, form.measure, context ?? {});
}

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
    const [pricingContext, setPricingContext] = useState<PropertyPricingContext | null>(null);
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
        // Only feeds the price indication — the page works without it.
        getPropertyPricingContext(id).then((context) => { if (!cancelled) setPricingContext(context); });
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
        const title = newMeasureTitle(form);
        if (!property || title === '') return false;
        // The indicated range is stored with the measure: it is what the
        // detail page's price slider spans, and what a published job shows
        // craftspeople as budget in the network.
        const range = newMeasurePriceRange(form, pricingContext);
        const created = await createRenovationMeasure({
            propertyId: property.propertyId,
            sortOrder: measures.length,
            title,
            category: form.category !== '' ? form.category : null,
            description: null,
            estimatedCost: form.estimatedCost !== '' ? Number(form.estimatedCost) : null,
            quotedCost: null,
            budgetMin: range?.min ?? null,
            budgetMax: range?.max ?? null,
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
        pricingContext,
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
