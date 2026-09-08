"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { buildCertificateDocxBlob } from '@/lib/docx/certificateDocx';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { downloadBlob, formatDeDate } from '@/lib/utils';
import { useRef, useState } from 'react';
import { readFileAsDataUrl } from './DocumentGeneratorParts';
import { useUnitDocumentGeneratorData } from './useUnitDocumentGeneratorData';

export function isPersonComplete(person: { firstName: string; lastName: string; isPrimary: boolean; taxId: string; moveInDate: Date | undefined }): boolean {
    if (person.firstName.trim() === '' || person.lastName.trim() === '') return false;
    if (person.isPrimary) return person.taxId.trim() !== '' && person.moveInDate != null;
    return true;
}

export interface CertificateContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    /** Whether the Vermieter is also the Eigentümer of the unit. */
    isLandlordOwner: boolean;
    propertyAddress: string;
    unitLabel: string;
    tenants: { name: string; role: string }[];
    mietbeginn: string;
    /** Move-out date ("Mietauszug") — null when the tenancy has no end date yet. */
    mietende: string | null;
    mietvertragAktiv: boolean;
    issuePlace: string;
    issueDate: string;
    documentNumber: string;
    signatureDataUrl: string | null;
}

export function certificateBodyHtml(c: CertificateContent): string {
    const tenantRows = c.tenants.map((t) => `
        <div style="background:#f2f4f7;border-radius:6px;padding:8px 12px;margin-bottom:6px;">
            <strong>${t.name}</strong> <span style="color:#475467;font-size:12px;">— ${t.role}</span>
        </div>`).join('');

    const signatureBlock = c.signatureDataUrl
        ? `<img src="${c.signatureDataUrl}" style="max-height:60px;max-width:220px;" />`
        : `<div style="width:220px;height:60px;border:1px dashed #98a2b3;display:flex;align-items:center;justify-content:center;color:#98a2b3;font-size:12px;">[Unterschrift nicht hinterlegt]</div>`;

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:13px;line-height:1.5;">
                <strong>${c.landlordName}</strong><br/>${c.landlordStreet}<br/>${c.landlordCity}
            </div>
            <div style="font-size:12px;color:#475467;text-align:right;line-height:1.6;">
                Ausgestellt am: ${c.issueDate}<br/>
                Ausstellungsort: ${c.issuePlace}<br/>
                Dokument-Nr.: ${c.documentNumber}
            </div>
        </div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #d0d5dd;" />
        <h1 style="text-align:center;font-size:22px;margin-bottom:4px;">Mieterbescheinigung</h1>
        <p style="text-align:center;color:#475467;font-size:13px;margin-bottom:28px;">Bestätigung eines bestehenden Mietverhältnisses</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Vermieter</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Name:</span> ${c.landlordName}</p>
        <p style="margin:4px 0;"><span style="color:#475467;">Adresse:</span> ${c.landlordStreet}, ${c.landlordCity}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Eigentümer der Wohnung:</span> ${c.isLandlordOwner ? 'Ja' : 'Nein'}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Mietobjekt</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Adresse:</span> ${c.propertyAddress}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Einheit:</span> ${c.unitLabel}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Mietpartei(en)</h2>
        <p style="margin:4px 0 10px;">Folgende Person(en) sind laut Mietvertrag Mieter der oben genannten Wohnung:</p>
        ${tenantRows}

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin:20px 0 10px;">Mietverhältnis</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Mieteinzug:</span> ${c.mietbeginn}</p>
        <p style="margin:4px 0;"><span style="color:#475467;">Mietauszug:</span> ${c.mietende ?? 'noch nicht bekannt'}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Mietvertrag aktiv:</span> ${c.mietvertragAktiv ? 'Ja' : 'Nein'}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Bescheinigung</h2>
        <div style="border-left:3px solid #224b96;background:#e9edf4;padding:12px 16px;font-size:13px;margin-bottom:24px;">
            Hiermit wird bestätigt, dass die oben genannten Personen derzeit in dem genannten Objekt wohnen und ein gültiger Mietvertrag besteht.
        </div>

        <p style="margin:0 0 40px;">${c.issuePlace}, ${c.issueDate}</p>

        <div style="margin-bottom:8px;">${signatureBlock}</div>
        <div style="border-top:1px solid #101828;width:260px;"></div>
        <div style="display:flex;justify-content:space-between;width:260px;font-size:12px;color:#475467;margin-top:4px;">
            <span>Unterschrift Vermieter</span>
        </div>

        <hr style="margin:32px 0 12px;border:none;border-top:1px solid #d0d5dd;" />
        <p style="font-size:11px;color:#98a2b3;">Mieterbescheinigung · ${c.propertyAddress} · Seite 1 von 1</p>
    `;
}

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
