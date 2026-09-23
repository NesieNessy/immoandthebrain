"use client";

import { useToast } from '@/components/ui';
import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { buildCertificateDocxBlob } from '@/lib/docx/certificateDocx';
import { deleteTenancyDocument, getTenancyDocumentUrl, uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { downloadBlob, formatDeDate } from '@/lib/utils';
import type { TenancyDocument } from '@immoandthebrain/types';
import { useRef, useState } from 'react';
import { readFileAsDataUrl, useDocumentReplaceFlow } from './DocumentGeneratorParts';
import type { CertificateContent } from './mieterbescheinigungLetter';
import { useUnitDocumentGeneratorData } from './useUnitDocumentGeneratorData';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Hook for the Mieterbescheinigung (tenant certificate) generator: data load,
 * docx build/upload/download, and the "Eigentümer der Wohnung" confirmation
 * gate. Shared by the full review page and any "generate now" shortcut button.
 *
 * `onUploaded` lets a caller with its own document list (e.g. useTenantUnitData)
 * refresh without a full page reload.
 *
 * `archivedTenancyId` scopes to a past tenancy (Mieterhistorie view) instead of
 * the unit's current one, so a moved-out tenant's certificate isn't shown as current.
 */
export function useMieterbescheinigungGenerator(propertyId: string, unitId: string, onUploaded?: () => void, archivedTenancyId?: number) {
    const { user } = useRequireAuth();
    const { showToast } = useToast();
    const { isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord, documents, setDocuments } =
        useUnitDocumentGeneratorData(propertyId, unitId, user?.id, archivedTenancyId);
    const mieterbescheinigungDocs = documents.filter((d) => d.documentType === 'Mieterbescheinigung' && !d.supersededAt);

    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    // Not persisted; landlord data has no ownership field, so this is asked per document.
    // null = not yet confirmed; generation always prompts rather than defaulting silently.
    const [isLandlordOwner, setIsLandlordOwner] = useState<boolean | null>(null);
    const [ownerModalOpen, setOwnerModalOpen] = useState(false);
    // Whether confirming the modal should immediately continue to generation
    // (opened via "Word-Dokument generieren") or just record the answer
    // (opened via "Ändern" in the review screen).
    const generateAfterOwnerChoice = useRef(false);

    const [uploadPromptOpen, setUploadPromptOpen] = useState(false);
    const [pendingGeneratedFile, setPendingGeneratedFile] = useState<File | null>(null);
    const [pendingDeleteDoc, setPendingDeleteDoc] = useState<TenancyDocument | null>(null);
    const [deletingDocId, setDeletingDocId] = useState<number | null>(null);

    const unitLabel = unit ? formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote) : '';
    const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '';
    const landlordStreet = landlord ? `${landlord.street} ${landlord.houseNumber}` : '';
    const landlordCity = landlord ? `${landlord.postalCode} ${landlord.city}` : '';
    const propertyStreet = property ? `${property.street} ${property.houseNumber}` : '';
    const propertyCity = property ? `${property.postalCode} ${property.city}` : '';
    const propertyAddress = `${propertyStreet}, ${propertyCity}`;
    const namedPersons = persons
        .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
        .map((p) => ({
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            isPrimary: p.isPrimary,
            taxId: p.taxId ?? '',
            moveInDate: p.moveInDate ? new Date(p.moveInDate) : undefined,
        }));
    const tenants = namedPersons.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim(),
        role: p.isPrimary ? 'Hauptmieter' : 'Weitere Person',
    }));
    // Matches useTenantUnitData's allTenantsDisplayName, so the document box
    // shows the same tenant label whether it's read from this hook or that one.
    const tenantNames = tenants.map((t) => t.name).filter(Boolean);
    const tenantLabel = tenantNames.length === 0
        ? 'Alle Mieter'
        : tenantNames.length === 1
            ? tenantNames[0]
            : `${tenantNames.slice(0, -1).join(', ')} & ${tenantNames[tenantNames.length - 1]}`;
    const mietbeginn = tenancy?.tenancyStartDate ? formatDeDate(tenancy.tenancyStartDate) : '–';
    const mietende = tenancy?.tenancyEndDate ? formatDeDate(tenancy.tenancyEndDate) : null;
    const mietvertragAktiv = tenancy != null && !tenancy.tenancyEndDate;
    const issuePlace = landlord?.city || property?.city || '';
    const issueDate = formatDeDate(new Date().toISOString());
    const canGenerate = landlord != null && tenants.length > 0 && tenancy != null;
    const documentNumber = `MB-${new Date().getFullYear()}-${String(tenancy?.tenancyId ?? 0).padStart(3, '0')}`;

    const buildContent = (ownerValue: boolean): CertificateContent => ({
        landlordName,
        landlordStreet,
        landlordCity,
        isLandlordOwner: ownerValue,
        propertyAddress,
        unitLabel,
        tenants,
        mietbeginn,
        mietende,
        mietvertragAktiv,
        issuePlace,
        issueDate,
        documentNumber,
        signatureDataUrl,
    });
    // Preview-only fallback for before the owner question is answered; runGenerate always uses the confirmed value.
    const content = buildContent(isLandlordOwner ?? true);

    const handleUploadSignature = async (file: File) => {
        setIsUploadingSignature(true);
        try {
            setSignatureDataUrl(await readFileAsDataUrl(file));
        } finally {
            setIsUploadingSignature(false);
        }
    };

    // Server upserts by (tenancy, documentType, tenancyPersonId), so a re-upload
    // returns the same tenancy_document_id; replace by id, don't append, or the box shows a stale duplicate.
    const uploadDoc = async (file: File) => {
        if (!tenancy || !user) return;
        try {
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Mieterbescheinigung',
            });
            if (!uploaded) {
                showToast('Dokument konnte nicht hochgeladen werden.', 'error');
                return;
            }
            setDocuments((prev) => [...prev.filter((d) => d.tenancyDocumentId !== uploaded.tenancyDocumentId), uploaded]);
            onUploaded?.();
            showToast('Dokument hochgeladen.', 'success');
        } catch {
            showToast('Dokument konnte nicht hochgeladen werden.', 'error');
        }
    };

    const removeDoc = async (doc: TenancyDocument) => {
        try {
            const success = await deleteTenancyDocument(doc.tenancyDocumentId, doc.storagePath);
            if (!success) {
                showToast('Dokument konnte nicht gelöscht werden.', 'error');
                return;
            }
            setDocuments((prev) => prev.filter((d) => d.tenancyDocumentId !== doc.tenancyDocumentId));
            onUploaded?.();
        } catch {
            showToast('Dokument konnte nicht gelöscht werden.', 'error');
        }
    };

    const replaceFlow = useDocumentReplaceFlow<TenancyDocument>({ upload: uploadDoc });

    const handleViewDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleDownloadDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
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

    const requestDeleteDoc = (doc: TenancyDocument) => setPendingDeleteDoc(doc);
    const cancelDeleteDoc = () => setPendingDeleteDoc(null);
    const confirmDeleteDoc = async () => {
        if (!pendingDeleteDoc) return;
        setDeletingDocId(pendingDeleteDoc.tenancyDocumentId);
        try {
            await removeDoc(pendingDeleteDoc);
            setPendingDeleteDoc(null);
        } finally {
            setDeletingDocId(null);
        }
    };

    const runGenerate = async (ownerValue: boolean) => {
        if (!canGenerate) return;
        setIsGenerating(true);
        try {
            const blob = await buildCertificateDocxBlob(buildContent(ownerValue));
            const fileName = `${documentNumber}.docx`;
            // Word blobs aren't browser-renderable (unlike a PDF), so save directly instead of opening in a tab.
            downloadBlob(blob, fileName);
            if (tenancy) {
                setPendingGeneratedFile(new File([blob], fileName, { type: WORD_MIME }));
                setUploadPromptOpen(true);
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerate = () => {
        if (!canGenerate) return;
        if (isLandlordOwner === null) {
            generateAfterOwnerChoice.current = true;
            setOwnerModalOpen(true);
            return;
        }
        void runGenerate(isLandlordOwner);
    };

    const openOwnerModalToEdit = () => {
        generateAfterOwnerChoice.current = false;
        setOwnerModalOpen(true);
    };

    const closeOwnerModal = () => {
        setOwnerModalOpen(false);
        generateAfterOwnerChoice.current = false;
    };

    const handleConfirmOwner = (value: boolean) => {
        setIsLandlordOwner(value);
        setOwnerModalOpen(false);
        if (generateAfterOwnerChoice.current) {
            generateAfterOwnerChoice.current = false;
            void runGenerate(value);
        }
    };

    // Shown once per generated file after download ("Datei wurde heruntergeladen.
    // Auch zu den Mieterdokumenten hochladen?"); declining leaves the file local-only.
    const closeUploadPrompt = () => {
        setUploadPromptOpen(false);
        setPendingGeneratedFile(null);
    };

    const confirmUploadPrompt = () => {
        if (pendingGeneratedFile) replaceFlow.requestUpload(pendingGeneratedFile, mieterbescheinigungDocs);
        closeUploadPrompt();
    };

    return {
        isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord,
        unitLabel, landlordName, landlordStreet, landlordCity, propertyStreet, propertyCity, propertyAddress,
        namedPersons, tenants, tenantLabel, mietbeginn, mietende, mietvertragAktiv, issuePlace, issueDate,
        canGenerate, documentNumber, content,
        signatureDataUrl, setSignatureDataUrl, isUploadingSignature, handleUploadSignature,
        isGenerating, isLandlordOwner, ownerModalOpen, openOwnerModalToEdit, closeOwnerModal,
        handleGenerate, handleConfirmOwner,
        // documents
        documents: mieterbescheinigungDocs, replaceFlow,
        handleViewDocument, handleDownloadDocument,
        pendingDeleteDoc, deletingDocId, requestDeleteDoc, cancelDeleteDoc, confirmDeleteDoc,
        uploadPromptOpen, pendingGeneratedFileName: pendingGeneratedFile?.name,
        closeUploadPrompt, confirmUploadPrompt,
    };
}
