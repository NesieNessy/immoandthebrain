"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { buildCertificateDocxBlob } from '@/lib/docx/certificateDocx';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { downloadBlob, formatDeDate } from '@/lib/utils';
import { useRef, useState } from 'react';
import { readFileAsDataUrl } from './DocumentGeneratorParts';
import type { CertificateContent } from './mieterbescheinigungLetter';
import { useUnitDocumentGeneratorData } from './useUnitDocumentGeneratorData';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Everything the Mieterbescheinigung (tenant certificate) generator needs:
 * its own independent data load (same as the /certificate review page) plus
 * the docx-build/upload/download flow and the "Eigentümer der Wohnung"
 * confirmation gate. Shared between the full review page and any "generate
 * now" shortcut button elsewhere, so a shortcut can generate the document
 * without navigating to the review page first — same behavior, same asked
 * questions, just callable directly from wherever the button lives.
 */
export function useMieterbescheinigungGenerator(propertyId: string, unitId: string) {
    const { user } = useRequireAuth();
    const { isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord } =
        useUnitDocumentGeneratorData(propertyId, unitId, user?.id);

    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    // Not persisted (like the signature) — set per generated document, since
    // the app's "landlord" (personal data) has no separate ownership field.
    // null = not yet confirmed — generating always asks first (via the modal
    // rendered by callers) rather than silently defaulting.
    const [isLandlordOwner, setIsLandlordOwner] = useState<boolean | null>(null);
    const [ownerModalOpen, setOwnerModalOpen] = useState(false);
    // Whether confirming the modal should immediately continue to generation
    // (opened via "Word-Dokument generieren") or just record the answer
    // (opened via "Ändern" in the review screen).
    const generateAfterOwnerChoice = useRef(false);

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
    // Preview-only fallback — a preview needs some value to render before the
    // owner question has been answered, but this fallback never reaches the
    // actually-generated document (runGenerate always gets the confirmed
    // value explicitly).
    const content = buildContent(isLandlordOwner ?? true);

    const handleUploadSignature = async (file: File) => {
        setIsUploadingSignature(true);
        try {
            setSignatureDataUrl(await readFileAsDataUrl(file));
        } finally {
            setIsUploadingSignature(false);
        }
    };

    const runGenerate = async (ownerValue: boolean) => {
        if (!canGenerate) return;
        setIsGenerating(true);
        try {
            const blob = await buildCertificateDocxBlob(buildContent(ownerValue));
            const fileName = `${documentNumber}.docx`;
            if (tenancy && user) {
                const file = new File([blob], fileName, { type: WORD_MIME });
                await uploadTenancyDocument(user.id, file, {
                    tenancyId: tenancy.tenancyId,
                    tenancyPersonId: null,
                    documentType: 'Mieterbescheinigung',
                });
            }
            // Word blobs aren't browser-renderable, so — unlike a PDF, which
            // could just be window.open()'d — this has to be saved directly
            // for the user to open in Word.
            downloadBlob(blob, fileName);
        } finally {
            setIsGenerating(false);
        }
    };

    // Always asks for the Eigentümer answer before generating if it hasn't
    // been given yet, rather than silently defaulting.
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

    return {
        isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord,
        unitLabel, landlordName, landlordStreet, landlordCity, propertyStreet, propertyCity, propertyAddress,
        namedPersons, tenants, mietbeginn, mietende, mietvertragAktiv, issuePlace, issueDate,
        canGenerate, documentNumber, content,
        signatureDataUrl, setSignatureDataUrl, isUploadingSignature, handleUploadSignature,
        isGenerating, isLandlordOwner, ownerModalOpen, openOwnerModalToEdit, closeOwnerModal,
        handleGenerate, handleConfirmOwner,
    };
}
