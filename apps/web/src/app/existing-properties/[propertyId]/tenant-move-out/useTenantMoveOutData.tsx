"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createUseCaseMenuItems } from '@/lib/propertyUseCaseMenu';
import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import { getCurrentTenancyByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { getTenancyDocumentsByTenancy, getTenancyDocumentUrl, uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import {
    createTenancyMoveOut,
    deleteMoveOutDamagePhoto,
    getMoveOutDamagePhotoUrl,
    getTenancyMoveOutByTenancy,
    updateTenancyMoveOut,
    uploadMoveOutDamagePhoto,
} from '@/lib/supabase/tenancy_move_out.supabase';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { formatDeDate } from '@/lib/utils';
import type { MoveOutDamage, MoveOutMeterReading, PersonalData, Property, PropertyUnit, Tenancy, TenancyDocument, TenancyMoveOut, TenancyPerson } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { tenantMoveOutProtocolHtml } from './tenantMoveOutProtocolLetter';

export interface MeterReadingForm {
    id: string;
    room: string;
    value: string;
}

export interface DamagePhotoForm {
    id: string;
    path: string;
    fileName: string;
    previewUrl: string | null;
}

export interface DamageForm {
    id: string;
    description: string;
    photos: DamagePhotoForm[];
}

function toMeterReadingForm(reading: MoveOutMeterReading): MeterReadingForm {
    return { id: reading.id, room: reading.room, value: reading.value != null ? String(reading.value) : '' };
}

function serializeForm(moveOutDate: Date | undefined, meterReadings: MeterReadingForm[], damages: DamageForm[]): string {
    return JSON.stringify({
        moveOutDate: moveOutDate?.toISOString() ?? null,
        meterReadings: meterReadings.map((r) => ({ id: r.id, room: r.room, value: r.value })),
        damages: damages.map((d) => ({ id: d.id, description: d.description, photos: d.photos.map((p) => p.path) })),
    });
}

function idFor() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTenantMoveOutData(propertyId: string, property: Property, unit: PropertyUnit, hasMultipleUnits: boolean) {
    const router = useRouter();
    const { user } = useRequireAuth();
    const { showToast } = useToast();

    const [tenancy, setTenancy] = useState<Tenancy | null>(null);
    const [persons, setPersons] = useState<TenancyPerson[]>([]);
    const [landlord, setLandlord] = useState<PersonalData | null | undefined>(undefined);
    const [moveOutRecord, setMoveOutRecord] = useState<TenancyMoveOut | null>(null);
    const [moveOutDate, setMoveOutDate] = useState<Date | undefined>(undefined);
    const [meterReadings, setMeterReadings] = useState<MeterReadingForm[]>([]);
    const [damages, setDamages] = useState<DamageForm[]>([]);
    const [originalSnapshot, setOriginalSnapshot] = useState('');
    const [protocolDocument, setProtocolDocument] = useState<TenancyDocument | null>(null);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingProtocol, setIsGeneratingProtocol] = useState(false);
    const [isUploadingProtocol, setIsUploadingProtocol] = useState(false);
    const [uploadingDamageId, setUploadingDamageId] = useState<string | null>(null);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const currentTenancy = await getCurrentTenancyByUnit(unit.propertyUnitId);
            setTenancy(currentTenancy);
            if (!currentTenancy) {
                setIsLoading(false);
                return;
            }

            const [foundPersons, record, documents] = await Promise.all([
                getTenancyPersonsByTenancy(currentTenancy.tenancyId),
                getTenancyMoveOutByTenancy(currentTenancy.tenancyId),
                getTenancyDocumentsByTenancy(currentTenancy.tenancyId),
            ]);
            setPersons(foundPersons);
            setMoveOutRecord(record);
            setProtocolDocument(documents.find((d) => d.documentType === 'Abnahme') ?? null);

            const loadedDate = currentTenancy.tenancyEndDate ? new Date(currentTenancy.tenancyEndDate) : undefined;
            const loadedReadings = (record?.meterReadings ?? []).map(toMeterReadingForm);

            const loadedDamages: DamageForm[] = await Promise.all(
                (record?.damages ?? []).map(async (damage: MoveOutDamage) => ({
                    id: damage.id,
                    description: damage.description,
                    photos: await Promise.all(
                        damage.photos.map(async (photo) => ({
                            id: idFor(),
                            path: photo.path,
                            fileName: photo.fileName,
                            previewUrl: await getMoveOutDamagePhotoUrl(photo.path),
                        })),
                    ),
                })),
            );

            setMoveOutDate(loadedDate);
            setMeterReadings(loadedReadings);
            setDamages(loadedDamages);
            setOriginalSnapshot(serializeForm(loadedDate, loadedReadings, loadedDamages));
        } catch {
            setError('Die Auszugsdaten konnten nicht geladen werden.');
        } finally {
            setIsLoading(false);
        }
    }, [unit.propertyUnitId]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        getPersonalData(user.id).then((data) => { if (!cancelled) setLandlord(data ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    const useCaseMenuItems = createUseCaseMenuItems(propertyId, 'TenantMoveOut', (route) => router.push(route));

    const isEditing = serializeForm(moveOutDate, meterReadings, damages) !== originalSnapshot;

    const goTo = (href: string) => {
        if (isEditing) setPendingHref(href);
        else router.push(href);
    };
    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };

    const primary = persons.find((p) => p.isPrimary) ?? persons[0];
    const others = persons.filter((p) => p !== primary);
    const tenantDisplayName = primary
        ? `${primary.lastName ?? ''}, ${[primary.firstName, ...others.map((p) => p.firstName)].filter(Boolean).join(' & ')}`.trim()
        : '–';

    // ── Meter readings ──────────────────────────────────────────────────────
    const addMeterReading = () => {
        setMeterReadings((prev) => [...prev, { id: idFor(), room: '', value: '' }]);
    };
    const updateMeterReading = (id: string, patch: Partial<MeterReadingForm>) => {
        setMeterReadings((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };
    const removeMeterReading = (id: string) => {
        setMeterReadings((prev) => prev.filter((r) => r.id !== id));
    };

    // ── Damages ──────────────────────────────────────────────────────────────
    const addDamage = () => {
        setDamages((prev) => [...prev, { id: idFor(), description: '', photos: [] }]);
    };
    const updateDamageDescription = (id: string, description: string) => {
        setDamages((prev) => prev.map((d) => (d.id === id ? { ...d, description } : d)));
    };
    const removeDamage = (id: string) => {
        setDamages((prev) => prev.filter((d) => d.id !== id));
    };

    const addDamagePhoto = async (damageId: string, file: File) => {
        if (!user || !tenancy) return;
        setUploadingDamageId(damageId);
        try {
            const uploaded = await uploadMoveOutDamagePhoto(user.id, tenancy.tenancyId, file);
            if (!uploaded) return;
            const previewUrl = await getMoveOutDamagePhotoUrl(uploaded.path);
            setDamages((prev) => prev.map((d) => d.id === damageId
                ? { ...d, photos: [...d.photos, { id: idFor(), path: uploaded.path, fileName: uploaded.fileName, previewUrl }] }
                : d));
        } finally {
            setUploadingDamageId(null);
        }
    };

    const removeDamagePhoto = async (damageId: string, photoId: string) => {
        const damage = damages.find((d) => d.id === damageId);
        const photo = damage?.photos.find((p) => p.id === photoId);
        if (!photo) return;
        await deleteMoveOutDamagePhoto(photo.path);
        setDamages((prev) => prev.map((d) => d.id === damageId ? { ...d, photos: d.photos.filter((p) => p.id !== photoId) } : d));
    };

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!tenancy) return;
        setIsSaving(true);
        setError(null);
        try {
            const newEndDate = moveOutDate ? format(moveOutDate, 'yyyy-MM-dd') : null;
            if (newEndDate !== tenancy.tenancyEndDate) {
                const updated = await updateTenancy(tenancy.tenancyId, { tenancyEndDate: newEndDate });
                if (!updated) throw new Error('updateTenancy failed');
                setTenancy(updated);
            }

            const payloadMeterReadings: MoveOutMeterReading[] = meterReadings.map((r) => ({
                id: r.id,
                room: r.room,
                value: r.value === '' ? null : Number(r.value),
            }));
            const payloadDamages: MoveOutDamage[] = damages.map((d) => ({
                id: d.id,
                description: d.description,
                photos: d.photos.map((p) => ({ path: p.path, fileName: p.fileName })),
            }));

            if (moveOutRecord) {
                const updated = await updateTenancyMoveOut(moveOutRecord.tenancyMoveOutId, {
                    meterReadings: payloadMeterReadings,
                    damages: payloadDamages,
                });
                if (!updated) throw new Error('updateTenancyMoveOut failed');
                setMoveOutRecord(updated);
            } else if (payloadMeterReadings.length > 0 || payloadDamages.length > 0) {
                const created = await createTenancyMoveOut({
                    tenancyId: tenancy.tenancyId,
                    propertyId: property.propertyId,
                    meterReadings: payloadMeterReadings,
                    damages: payloadDamages,
                });
                if (!created) throw new Error('createTenancyMoveOut failed');
                setMoveOutRecord(created);
            }

            setOriginalSnapshot(serializeForm(moveOutDate, meterReadings, damages));
            showToast('Auszugsdaten gespeichert.', 'success');
        } catch {
            setError('Die Auszugsdaten konnten nicht gespeichert werden.');
        } finally {
            setIsSaving(false);
        }
    };

    // ── Abnahmeprotokoll PDF ─────────────────────────────────────────────────
    const canGenerateProtocol = tenancy != null;

    const buildProtocolHtml = (): string | null => {
        if (!tenancy) return null;
        return tenantMoveOutProtocolHtml({
            landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '',
            landlordStreet: landlord ? `${landlord.street} ${landlord.houseNumber}` : '',
            landlordCity: landlord ? `${landlord.postalCode} ${landlord.city}` : '',
            propertyAddress: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
            tenantName: tenantDisplayName,
            moveOutDate: moveOutDate ? formatDeDate(moveOutDate.toISOString()) : '–',
            issueDate: formatDeDate(new Date().toISOString()),
            meterReadings: meterReadings.map((r) => ({ room: r.room, value: r.value })),
            damages: damages.map((d) => ({ description: d.description, photoCount: d.photos.length })),
        });
    };

    const handlePreview = async () => {
        setIsLoadingPreview(true);
        try {
            setPreviewHtml(buildProtocolHtml());
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const handleGenerateProtocol = async () => {
        if (!user || !tenancy) return;
        setIsGeneratingProtocol(true);
        try {
            const html = buildProtocolHtml();
            if (!html) return;
            const blob = await htmlToPdfBlob(html);
            const file = new File([blob], `Abnahmeprotokoll_${unit.propertyUnitId}.pdf`, { type: 'application/pdf' });
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Abnahme',
            });
            if (uploaded) setProtocolDocument(uploaded);
            const updated = await updateTenancy(tenancy.tenancyId, { acceptanceProtocol: true });
            if (updated) setTenancy(updated);
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
            showToast('Abnahmeprotokoll erstellt.', 'success');
        } finally {
            setIsGeneratingProtocol(false);
        }
    };

    const handleUploadProtocol = async (file: File) => {
        if (!user || !tenancy) return;
        setIsUploadingProtocol(true);
        try {
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Abnahme',
            });
            if (!uploaded) return;
            setProtocolDocument(uploaded);
            const updated = await updateTenancy(tenancy.tenancyId, { acceptanceProtocol: true });
            if (updated) setTenancy(updated);
            showToast('Abnahmeprotokoll hochgeladen.', 'success');
        } finally {
            setIsUploadingProtocol(false);
        }
    };

    const handleViewProtocolDocument = async () => {
        if (!protocolDocument) return;
        const url = await getTenancyDocumentUrl(protocolDocument.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const backHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-move-out`
        : `/existing-properties/${propertyId}`;

    return {
        // state
        isLoading, isSaving, isGeneratingProtocol, isUploadingProtocol, isLoadingPreview, error,
        tenancy, tenantDisplayName, useCaseMenuItems, backHref,
        moveOutDate, setMoveOutDate,
        meterReadings, damages,
        uploadingDamageId,
        pendingHref, setPendingHref,
        protocolDocument, previewHtml,
        // computed
        isEditing, canGenerateProtocol,
        // handlers
        goTo, confirmDiscard,
        addMeterReading, updateMeterReading, removeMeterReading,
        addDamage, updateDamageDescription, removeDamage,
        addDamagePhoto, removeDamagePhoto,
        handleSave, handleGenerateProtocol, handleUploadProtocol, handleViewProtocolDocument, handlePreview,
    };
}
