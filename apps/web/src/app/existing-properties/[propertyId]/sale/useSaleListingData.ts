"use client";

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/components/ui';
import { getParkingSpacesByProperty } from '@/lib/supabase/parking_space.supabase';
import {
    deletePropertyDocument,
    getPropertyDocumentsByProperty,
    getPropertyDocumentUrl,
    uploadPropertyDocument,
} from '@/lib/supabase/property_document.supabase';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertySaleListing, savePropertySaleListing } from '@/lib/supabase/property_sale_listing.supabase';
import { getTenanciesByProperty } from '@/lib/supabase/tenancy.supabase';
import type { Property, PropertyDocument, PropertySaleListing } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EMPTY_FORM, formFromListing, formToListingFields, initialFormFromProperty, type SaleListingForm } from './saleListingForm';

export type { SaleListingForm } from './saleListingForm';

export function useSaleListingData(propertyId: string) {
    const router = useRouter();
    const { user } = useRequireAuth();
    const { showToast } = useToast();

    const [property, setProperty] = useState<Property | null>(null);
    const [listing, setListing] = useState<PropertySaleListing | null>(null);
    const [documents, setDocuments] = useState<PropertyDocument[]>([]);
    const [form, setForm] = useState<SaleListingForm>(EMPTY_FORM);
    const [original, setOriginal] = useState<SaleListingForm>(EMPTY_FORM);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [busyDocId, setBusyDocId] = useState<number | null>(null);

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        let cancelled = false;

        Promise.all([
            getPropertyById(id),
            getTenanciesByProperty(id),
            getParkingSpacesByProperty(id),
            getPropertySaleListing(id),
            getPropertyDocumentsByProperty(id),
        ]).then(([foundProperty, tenancies, parkingSpaces, existingListing, docs]) => {
            if (cancelled) return;
            if (!foundProperty) {
                setIsLoading(false);
                return;
            }
            setProperty(foundProperty);
            setDocuments(docs);
            setListing(existingListing);

            if (existingListing) {
                const loaded = formFromListing(existingListing);
                setForm(loaded);
                setOriginal(loaded);
            } else {
                const initial = initialFormFromProperty(foundProperty, tenancies, parkingSpaces);
                setForm(initial);
                setOriginal(initial);
            }
            setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [propertyId]);

    const isDirty = JSON.stringify(form) !== JSON.stringify(original);

    const goTo = (href: string) => {
        if (isDirty) setPendingHref(href); else router.push(href);
    };
    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };
    const cancelPendingNav = () => setPendingHref(null);

    const update = (patch: Partial<SaleListingForm>) => setForm((prev) => ({ ...prev, ...patch }));

    const hubHref = `/existing-properties/${propertyId}`;

    const toFields = (status: PropertySaleListing['status'], publishedAt: string | null, selectedPortals: string[]) =>
        formToListingFields(form, status, publishedAt, selectedPortals);

    const handleCancel = () => goTo(hubHref);

    const handleSave = async () => {
        const id = parseInt(propertyId, 10);
        setIsSaving(true);
        try {
            const saved = await savePropertySaleListing(id, toFields(listing?.status ?? 'draft', listing?.publishedAt ?? null, listing?.selectedPortals ?? []));
            if (!saved) {
                showToast('Verkaufsangebot konnte nicht gespeichert werden.', 'error');
                return;
            }
            setListing(saved);
            setOriginal(form);
            showToast('Verkaufsangebot gespeichert.');
            router.push(hubHref);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async (selectedPortals: string[]) => {
        const id = parseInt(propertyId, 10);
        setIsSaving(true);
        try {
            const saved = await savePropertySaleListing(id, toFields('published', new Date().toISOString(), selectedPortals));
            if (!saved) {
                showToast('Verkaufsangebot konnte nicht veröffentlicht werden.', 'error');
                return;
            }
            setListing(saved);
            setOriginal(form);
            showToast('Verkaufsangebot veröffentlicht.');
            router.push(hubHref);
        } finally {
            setIsSaving(false);
        }
    };

    // Every document is independent — as many as the owner likes, each
    // under a name they chose themselves at upload time.
    const addDocument = async (name: string, file: File) => {
        if (!user || !property) return;
        const uploaded = await uploadPropertyDocument(user.id, file, property.propertyId, name);
        if (!uploaded) {
            showToast('Dokument konnte nicht hochgeladen werden.', 'error');
            return;
        }
        setDocuments((prev) => [uploaded, ...prev]);
        showToast('Dokument hochgeladen.');
    };

    const handleView = async (doc: PropertyDocument) => {
        const url = await getPropertyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleDownload = async (doc: PropertyDocument) => {
        const url = await getPropertyDocumentUrl(doc.storagePath);
        if (!url) return;
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = doc.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    };

    const handleDelete = async (doc: PropertyDocument) => {
        setBusyDocId(doc.propertyDocumentId);
        try {
            const success = await deletePropertyDocument(doc.propertyDocumentId, doc.storagePath);
            if (success) setDocuments((prev) => prev.filter((d) => d.propertyDocumentId !== doc.propertyDocumentId));
        } finally {
            setBusyDocId(null);
        }
    };

    return {
        property, listing, documents, form, update, isDirty, isLoading, isSaving,
        pendingHref, goTo, confirmDiscard, cancelPendingNav,
        handleCancel, handleSave, handlePublish,
        addDocument, handleView, handleDownload, handleDelete, busyDocId,
    };
}
