"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getPropertyPricingContext, type PropertyPricingContext } from '@/lib/api/renovationPricing';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { deletePhoto, getPhotosByProperty, getPhotoUrl, uploadPhoto } from '@/lib/supabase/renovation_measure_photo.supabase';
import {
    createRenovationMeasure,
    deleteRenovationMeasure,
    getRenovationMeasuresByProperty,
    updateRenovationMeasure,
} from '@/lib/supabase/renovation_measure.supabase';
import type { Property, PropertyUnit, RenovationMeasure, RenovationMeasurePhoto } from '@immoandthebrain/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { measurePriceRange, newMeasurePriceRange, newMeasureTitle, toDateValue, type NewMeasureForm } from './measureForm';
import { canConfirmCustomerCompletion } from './measureStatus';

/**
 * No craftsperson-facing portal — the owner enters quote/completion state
 * themselves. Everything is on this one page: the add/edit form above the
 * tables, and each measure's quotes, Rückfragen and Mängel in its panel in
 * the status table (useMeasureWork). quoteAccepted locks the core fields —
 * the same set the server enforces (lockedColumns of renovation-measures).
 */
export function useRenovationMeasuresData(propertyId: string) {
    const { showToast } = useToast();
    const { user } = useRequireAuth();
    const searchParams = useSearchParams();
    const contextUnitId = searchParams.get('unit');
    const [property, setProperty] = useState<Property | null>(null);
    const [measures, setMeasures] = useState<RenovationMeasure[]>([]);
    const [photos, setPhotos] = useState<RenovationMeasurePhoto[]>([]);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [pricingContext, setPricingContext] = useState<PropertyPricingContext | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [measurePendingDelete, setMeasurePendingDelete] = useState<RenovationMeasure | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;
        Promise.all([
            getPropertyById(id),
            getRenovationMeasuresByProperty(id),
            getPropertyUnitsByProperty(id),
            getPhotosByProperty(id),
        ]).then(([loadedProperty, loadedMeasures, loadedUnits, loadedPhotos]) => {
            if (cancelled) return;
            setProperty(loadedProperty);
            setMeasures(loadedMeasures);
            setUnits(loadedUnits);
            setPhotos(loadedPhotos);
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
            return false;
        }
        setMeasures((prev) => prev.map((m) => (m.renovationMeasureId === fallbackId ? updated : m)));
        return true;
    };

    // Caller already applied the change optimistically via updateLocalField;
    // this persists it and reconciles with the server's row.
    const persistField = async (measureId: number, patch: Partial<RenovationMeasure>) => {
        const updated = await updateRenovationMeasure(measureId, patch);
        return replaceMeasure(updated, measureId);
    };

    const updateLocalField = (measureId: number, patch: Partial<RenovationMeasure>) => {
        setMeasures((prev) => prev.map((m) => (m.renovationMeasureId === measureId ? { ...m, ...patch } : m)));
    };

    /** Optimistic update + save, for toggles and the panel's actions. */
    const commitField = (measureId: number, patch: Partial<RenovationMeasure>) => {
        updateLocalField(measureId, patch);
        void persistField(measureId, patch);
    };

    // ── Files ───────────────────────────────────────────────────────────
    const photosOf = (measureId: number) => photos.filter((photo) => photo.renovationMeasureId === measureId);

    /** Uploads files to a measure; reports how many failed (0 = all fine). */
    const uploadFiles = async (measure: RenovationMeasure, files: File[]) => {
        if (files.length === 0 || !user) return 0;
        const uploaded = await Promise.all(files.map((file) => uploadPhoto(user.id, measure.propertyId, measure.renovationMeasureId, file)));
        const created = uploaded.filter((photo): photo is RenovationMeasurePhoto => photo != null);
        setPhotos((prev) => [...prev, ...created]);
        return files.length - created.length;
    };

    const removePhoto = async (photo: RenovationMeasurePhoto) => {
        const success = await deletePhoto(photo.renovationMeasurePhotoId, photo.storagePath);
        if (success) setPhotos((prev) => prev.filter((p) => p.renovationMeasurePhotoId !== photo.renovationMeasurePhotoId));
        else showToast('Datei konnte nicht gelöscht werden.', 'error');
    };

    const viewPhoto = async (photo: RenovationMeasurePhoto) => {
        const url = await getPhotoUrl(photo.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else showToast('Datei konnte nicht geöffnet werden.', 'error');
    };

    const reportFailedUploads = (failed: number, total: number, prefix: string) => {
        if (failed > 0) showToast(`${prefix}, aber ${failed} von ${total} Dateien konnten nicht hochgeladen werden.`, 'warning');
    };

    // ── Add / edit ──────────────────────────────────────────────────────
    // Files chosen in the form are uploaded right after the measure exists
    // (they are stored per measure).
    const addMeasure = async (form: NewMeasureForm, files: File[] = []) => {
        const title = newMeasureTitle(form);
        if (!property || title === '') return false;
        // The indicated range is stored with the measure: it is what the
        // price slider spans, and what a published job shows craftspeople as
        // budget in the network.
        const range = newMeasurePriceRange(form, pricingContext);
        const created = await createRenovationMeasure({
            propertyId: property.propertyId,
            sortOrder: measures.length,
            title,
            category: form.category !== '' ? form.category : null,
            description: form.description.trim() || null,
            estimatedCost: form.estimatedCost !== '' ? Number(form.estimatedCost) : null,
            quotedCost: form.quotedCost !== '' ? Number(form.quotedCost) : null,
            budgetMin: range?.min ?? null,
            budgetMax: range?.max ?? null,
            preferredStartDate: toDateValue(form.preferredStartDate),
            quotedStartDate: toDateValue(form.quotedStartDate),
            actualCompletionDate: toDateValue(form.actualCompletionDate),
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
        reportFailedUploads(await uploadFiles(created, files), files.length, 'Maßnahme angelegt');
        return true;
    };

    /**
     * Saves "Maßnahme bearbeiten". A locked measure (quote accepted) only
     * sends what stays editable then — the rest is refused by the server.
     */
    const saveMeasure = async (measure: RenovationMeasure, form: NewMeasureForm, files: File[] = []) => {
        const title = newMeasureTitle(form);
        if (title === '') return false;
        const completion = toDateValue(form.actualCompletionDate);
        const patch: Partial<RenovationMeasure> = {
            category: form.category !== '' ? form.category : null,
            actualCompletionDate: completion,
            // Clearing the completion date also clears a stale customer confirmation.
            ...(completion ? {} : { customerConfirmedCompleted: false }),
        };
        if (!measure.quoteAccepted) {
            // A different measure is a different price range; the same one keeps its stored range.
            const sameMeasure = title === measure.title && patch.category === measure.category;
            const range = sameMeasure ? measurePriceRange(measure, pricingContext) : newMeasurePriceRange(form, pricingContext);
            Object.assign(patch, {
                title,
                description: form.description.trim() || null,
                estimatedCost: form.estimatedCost !== '' ? Number(form.estimatedCost) : null,
                quotedCost: form.quotedCost !== '' ? Number(form.quotedCost) : null,
                budgetMin: range?.min ?? null,
                budgetMax: range?.max ?? null,
                preferredStartDate: toDateValue(form.preferredStartDate),
                quotedStartDate: toDateValue(form.quotedStartDate),
            });
        }
        const ok = await persistField(measure.renovationMeasureId, patch);
        if (ok) reportFailedUploads(await uploadFiles(measure, files), files.length, 'Maßnahme gespeichert');
        return ok;
    };

    // ── Status toggles ──────────────────────────────────────────────────
    const togglePublished = (measure: RenovationMeasure) => {
        const nextPublished = !measure.published;
        commitField(measure.renovationMeasureId, { published: nextPublished, publishedAt: nextPublished ? new Date().toISOString() : null });
    };

    const toggleCraftsmanConfirmed = (measure: RenovationMeasure) => {
        const next = !measure.craftsmanConfirmedCompleted;
        // Un-confirming must also clear a stale customer confirmation.
        commitField(measure.renovationMeasureId, next ? { craftsmanConfirmedCompleted: next } : { craftsmanConfirmedCompleted: next, customerConfirmedCompleted: false });
    };

    const toggleCustomerConfirmed = (measure: RenovationMeasure) => {
        if (!canConfirmCustomerCompletion(measure)) return;
        commitField(measure.renovationMeasureId, { customerConfirmedCompleted: !measure.customerConfirmedCompleted });
    };

    // ── Delete ──────────────────────────────────────────────────────────
    const requestDeleteMeasure = (measure: RenovationMeasure) => setMeasurePendingDelete(measure);
    const cancelDeleteMeasure = () => setMeasurePendingDelete(null);

    const confirmDeleteMeasure = async () => {
        if (!measurePendingDelete) return;
        setIsDeleting(true);
        try {
            const success = await deleteRenovationMeasure(measurePendingDelete.renovationMeasureId);
            if (success) {
                const deletedId = measurePendingDelete.renovationMeasureId;
                setMeasures((prev) => prev.filter((m) => m.renovationMeasureId !== deletedId));
                setPhotos((prev) => prev.filter((p) => p.renovationMeasureId !== deletedId));
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
        photosOf,
        uploadFiles,
        removePhoto,
        viewPhoto,
        commitField,
        addMeasure,
        saveMeasure,
        togglePublished,
        toggleCraftsmanConfirmed,
        toggleCustomerConfirmed,
        measurePendingDelete,
        requestDeleteMeasure,
        cancelDeleteMeasure,
        confirmDeleteMeasure,
        isDeleting,
    };
}
