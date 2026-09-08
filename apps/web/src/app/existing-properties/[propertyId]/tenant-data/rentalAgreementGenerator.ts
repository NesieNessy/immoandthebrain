"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { deCurrencyFormatter, downloadBlob, formatDeDate } from '@/lib/utils';
import type { RentalTermsPetsAllowed, RentalTermsRedecorationClause, RentalTermsSubletAllowed, TenancyPerson } from '@immonext/types';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { readFileAsDataUrl } from './DocumentGeneratorParts';
import { useUnitDocumentGeneratorData } from './useUnitDocumentGeneratorData';

export type TriState = '' | 'true' | 'false';

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

export const PETS_OPTIONS: { value: RentalTermsPetsAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Vereinbarung', label: 'Nach Vereinbarung' },
];

export const REDECORATION_OPTIONS: { value: RentalTermsRedecorationClause | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Mieter trägt Kosten (üblich)', label: 'Mieter trägt Kosten (üblich)' },
    { value: 'Vermieter trägt Kosten', label: 'Vermieter trägt Kosten' },
    { value: 'Individuelle Regelung', label: 'Individuelle Regelung' },
];

export const SUBLET_OPTIONS: { value: RentalTermsSubletAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Zustimmung', label: 'Nach Zustimmung' },
];

export const RENOVATION_ADJUSTMENT_OPTIONS: { value: TriState; label: string }[] = [
    { value: '', label: 'Nicht erfasst' },
    { value: 'true', label: 'Geplant' },
    { value: 'false', label: 'Nicht geplant' },
];

export interface AgreementContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    propertyAddress: string;
    unitLabel: string;
    livingArea: string;
    numberOfRooms: string;
    tenants: { name: string; role: string }[];
    mietbeginn: string;
    befristet: boolean;
    mietende: string;
    coldRent: string;
    miscRent: string;
    parkingRent: string | null;
    warmRent: string;
    deposit: string;
    depositRatio: string | null;
    nextRentAdjustmentDate: string | null;
    nextRentAdjustmentAmount: string | null;
    renovationAdjustmentPlanned: boolean | null;
    petsAllowed: RentalTermsPetsAllowed | null;
    redecorationClause: RentalTermsRedecorationClause | null;
    subletAllowed: RentalTermsSubletAllowed | null;
    additionalTerms: string | null;
    issuePlace: string;
    issueDate: string;
    documentNumber: string;
    signatureDataUrl: string | null;
}

export function agreementBodyHtml(c: AgreementContent): string {
    const tenantNames = c.tenants.map((t) => t.name).join(' / ');
    const tenantRows = c.tenants.map((t) => `
        <div style="background:#f2f4f7;border-radius:6px;padding:8px 12px;margin-bottom:6px;">
            <strong>${t.name}</strong> <span style="color:#475467;font-size:12px;">— ${t.role}</span>
        </div>`).join('');

    const signatureBlock = c.signatureDataUrl
        ? `<img src="${c.signatureDataUrl}" style="max-height:60px;max-width:220px;" />`
        : `<div style="height:40px;"></div>`;

    const sectionTitle = (n: number, label: string) => `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#224b96;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin:24px 0 10px;">§ ${n} · ${label}</h2>`;
    const row = (label: string, value: string, bold = false) => `<p style="margin:4px 0;display:flex;justify-content:space-between;${bold ? 'font-weight:bold;' : ''}"><span style="color:#475467;">${label}</span><span>${value}</span></p>`;
    const note = (html: string) => `<div style="border-left:3px solid #224b96;background:#e9edf4;padding:12px 16px;font-size:13px;margin:10px 0 4px;">${html}</div>`;

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:13px;line-height:1.5;">
                <strong>${c.landlordName}</strong><br/>${c.landlordStreet}<br/>${c.landlordCity}
            </div>
            <div style="font-size:12px;color:#475467;text-align:right;line-height:1.6;">
                Vertragsdatum: ${c.issueDate}<br/>
                Ort: ${c.issuePlace}<br/>
                Vertrags-Nr.: ${c.documentNumber}
            </div>
        </div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #d0d5dd;" />
        <h1 style="text-align:center;font-size:22px;margin-bottom:4px;">Mietvertrag</h1>
        <p style="text-align:center;color:#475467;font-size:13px;margin-bottom:16px;">Wohnraummietvertrag gemäß §§ 535 ff. BGB</p>

        ${sectionTitle(1, 'Vertragsparteien')}
        ${row('Vermieter', `${c.landlordName}, ${c.landlordStreet}, ${c.landlordCity}`)}
        ${row('Mieter', tenantNames || '–')}
        ${tenantRows}

        ${sectionTitle(2, 'Mietobjekt')}
        ${row('Adresse', c.propertyAddress)}
        ${row('Einheit', c.unitLabel)}
        ${row('Wohnfläche', `ca. ${c.livingArea}`)}
        ${row('Zimmer', c.numberOfRooms)}

        ${sectionTitle(3, 'Mietdauer')}
        ${c.befristet
            ? note(`<strong>BEFRISTETES MIETVERHÄLTNIS</strong><br/>Das Mietverhältnis beginnt am ${c.mietbeginn} und endet am ${c.mietende}.`)
            : note(`<strong>UNBEFRISTETES MIETVERHÄLTNIS</strong><br/>Das Mietverhältnis beginnt am ${c.mietbeginn} und läuft auf unbestimmte Zeit. Es kann von beiden Parteien mit der gesetzlichen Kündigungsfrist gekündigt werden.`)}

        ${sectionTitle(4, 'Miete & Nebenkosten')}
        ${row('Nettokaltmiete', c.coldRent)}
        ${c.parkingRent ? row('Stellplatz', c.parkingRent) : ''}
        ${row('NK-Vorauszahlung', c.miscRent)}
        ${row('Gesamtmiete', c.warmRent, true)}
        ${note('Die Nebenkostenvorauszahlung wird jährlich abgerechnet. Eine Anpassung ist nach erfolgter Abrechnung möglich.')}

        ${sectionTitle(5, 'Kaution')}
        ${note(`Der Mieter leistet eine Kaution in Höhe von ${c.deposit}${c.depositRatio ? ` (entspricht ${c.depositRatio} Nettokaltmieten)` : ''}. Die Kaution ist zu Mietbeginn fällig und wird zinsbringend angelegt.`)}

        ${sectionTitle(6, 'Mietanpassung')}
        ${c.nextRentAdjustmentDate
            ? note(`Eine Mieterhöhung ist zum ${c.nextRentAdjustmentDate}${c.nextRentAdjustmentAmount ? ` in Höhe von ${c.nextRentAdjustmentAmount}` : ''} vorgesehen, vorbehaltlich der gesetzlichen Voraussetzungen gemäß § 558 BGB.${c.renovationAdjustmentPlanned ? ' Zusätzlich ist eine Mieterhöhung infolge geplanter Modernisierungsmaßnahmen gemäß § 559 BGB vorgesehen.' : ''}`)
            : note('Es ist derzeit keine Mietanpassung vorgesehen. Gesetzliche Mieterhöhungen gemäß §§ 558 f. BGB bleiben hiervon unberührt.')}

        ${sectionTitle(7, 'Haustierhaltung & Sonstige Vereinbarungen')}
        ${row('Haustierhaltung', c.petsAllowed ?? 'Nicht geregelt')}
        ${row('Schönheitsreparaturen', c.redecorationClause ?? 'Nicht geregelt')}
        ${row('Untervermietung', c.subletAllowed ?? 'Nicht geregelt')}
        ${c.additionalTerms ? note(c.additionalTerms) : ''}

        <p style="margin:32px 0 0;">${c.issuePlace}, ${c.issueDate}</p>

        <div style="display:flex;justify-content:space-between;margin-top:16px;">
            <div style="width:45%;">
                <div style="margin-bottom:8px;">${signatureBlock}</div>
                <div style="border-top:1px solid #101828;"></div>
                <div style="font-size:12px;color:#475467;margin-top:4px;">Unterschrift Vermieter</div>
                <div style="font-size:11px;color:#98a2b3;">${c.landlordName}</div>
            </div>
            <div style="width:45%;">
                <div style="height:40px;"></div>
                <div style="border-top:1px solid #101828;"></div>
                <div style="font-size:12px;color:#475467;margin-top:4px;">Unterschrift Mieter</div>
                <div style="font-size:11px;color:#98a2b3;">${tenantNames || '–'}</div>
            </div>
        </div>

        <hr style="margin:32px 0 12px;border:none;border-top:1px solid #d0d5dd;" />
        <p style="font-size:11px;color:#98a2b3;">Mietvertrag · ${c.propertyAddress} · Seite 1 von 1</p>
    `;
}

/**
 * Everything the Mietvertrag generator needs: its own independent data load
 * (same as the /rental-agreement review page) plus the clause fields, the
 * signature upload, and the save-then-build-then-download flow. Shared
 * between the full review page and the "PDF generieren" shortcut buttons
 * elsewhere, so a shortcut can generate a specific tenant's (or the unit's
 * default) contract without navigating to the review page first.
 *
 * `generateFor(personId)` is a standalone entry point (not tied to the one
 * `personId` this hook instance was opened for) because the shortcut list on
 * the tenant-agreement page renders one button per tenant — each needs to
 * generate for a *different* person from a single hook instance, which a
 * fixed-personId API couldn't do without calling this hook once per row
 * (not allowed inside a .map()).
 */
export function useRentalAgreementGenerator(propertyId: string, unitId: string, personId: number | null = null) {
    const { user } = useRequireAuth();
    const { isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord } =
        useUnitDocumentGeneratorData(propertyId, unitId, user?.id);

    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);
    // 'all' generates for every tenant on the unit (no personId filter); a
    // number tracks which single tenant's contract is currently generating,
    // so each shortcut button can show its own loading state independently.
    const [generatingKey, setGeneratingKey] = useState<number | 'all' | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Rental-agreement clauses — persisted on the tenancy, seeded from it once.
    const [nextRentAdjustmentDate, setNextRentAdjustmentDate] = useState<Date | undefined>(undefined);
    const [nextRentAdjustmentAmount, setNextRentAdjustmentAmount] = useState('');
    const [renovationAdjustmentPlanned, setRenovationAdjustmentPlanned] = useState<TriState>('');
    const [petsAllowed, setPetsAllowed] = useState<RentalTermsPetsAllowed | ''>('');
    const [redecorationClause, setRedecorationClause] = useState<RentalTermsRedecorationClause | ''>('');
    const [subletAllowed, setSubletAllowed] = useState<RentalTermsSubletAllowed | ''>('');
    const [additionalTerms, setAdditionalTerms] = useState('');
    const seededTenancyId = useRef<number | null>(null);

    // Gate for the quick "PDF generieren" shortcuts (not the review page,
    // which already shows these fields inline): when the Anpassungsregelungen
    // haven't been explicitly decided yet, ask via a modal instead of
    // silently generating a contract with "Nicht geregelt" everywhere.
    const [clauseModalOpen, setClauseModalOpen] = useState(false);
    const pendingGenerateTarget = useRef<{ personId: number | null } | null>(null);
    const hasIncompleteClauses = renovationAdjustmentPlanned === '' || petsAllowed === '' || redecorationClause === '' || subletAllowed === '';

    useEffect(() => {
        if (!tenancy || seededTenancyId.current === tenancy.tenancyId) return;
        seededTenancyId.current = tenancy.tenancyId;
        setNextRentAdjustmentDate(tenancy.nextRentAdjustmentDate ? new Date(tenancy.nextRentAdjustmentDate) : undefined);
        setNextRentAdjustmentAmount(tenancy.nextRentAdjustmentAmount != null ? String(tenancy.nextRentAdjustmentAmount) : '');
        setRenovationAdjustmentPlanned(tenancy.renovationAdjustmentPlanned == null ? '' : tenancy.renovationAdjustmentPlanned ? 'true' : 'false');
        setPetsAllowed(tenancy.petsAllowed ?? '');
        setRedecorationClause(tenancy.redecorationClause ?? '');
        setSubletAllowed(tenancy.subletAllowed ?? '');
        setAdditionalTerms(tenancy.additionalTerms ?? '');
    }, [tenancy]);

    const unitLabel = unit ? formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote) : '';
    const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '';
    const landlordStreet = landlord ? `${landlord.street} ${landlord.houseNumber}` : '';
    const landlordCity = landlord ? `${landlord.postalCode} ${landlord.city}` : '';
    const propertyStreet = property ? `${property.street} ${property.houseNumber}` : '';
    const propertyCity = property ? `${property.postalCode} ${property.city}` : '';
    const propertyAddress = `${propertyStreet}, ${propertyCity}`;
    const mietbeginn = tenancy?.tenancyStartDate ? formatDeDate(tenancy.tenancyStartDate) : '–';
    const befristet = tenancy?.tenancyEndDate != null;
    const mietende = tenancy?.tenancyEndDate ? formatDeDate(tenancy.tenancyEndDate) : '–';
    const issuePlace = landlord?.city || property?.city || '';
    const issueDate = formatDeDate(new Date().toISOString());
    const livingArea = unit?.livingAreaM2 != null ? `${unit.livingAreaM2} m²` : '–';
    const numberOfRooms = unit?.numberOfRooms != null ? String(unit.numberOfRooms) : '–';
    const documentNumber = `MV-${new Date().getFullYear()}-${String(tenancy?.tenancyId ?? 0).padStart(3, '0')}`;
    const depositRatio = tenancy?.deposit && tenancy.coldRent
        ? (tenancy.deposit / tenancy.coldRent).toLocaleString('de-DE', { maximumFractionDigits: 1 })
        : null;

    const tenantsFor = (targetPersonId: number | null): { name: string; role: string }[] => {
        const targetPersons: TenancyPerson[] = targetPersonId != null
            ? persons.filter((p) => p.tenancyPersonId === targetPersonId)
            : persons;
        return targetPersons
            .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
            .map((p) => ({
                name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
                role: p.isPrimary ? 'Hauptmieter' : 'Weitere Person',
            }));
    };

    const buildContentFor = (targetPersonId: number | null): AgreementContent => ({
        landlordName,
        landlordStreet,
        landlordCity,
        propertyAddress,
        unitLabel,
        livingArea,
        numberOfRooms,
        tenants: tenantsFor(targetPersonId),
        mietbeginn,
        befristet,
        mietende,
        coldRent: euro(tenancy?.coldRent),
        miscRent: euro(tenancy?.miscRent),
        parkingRent: tenancy?.parkingSpaceRent ? euro(tenancy.parkingSpaceRent) : null,
        warmRent: euro(tenancy?.warmRent),
        deposit: euro(tenancy?.deposit),
        depositRatio,
        nextRentAdjustmentDate: nextRentAdjustmentDate ? formatDeDate(format(nextRentAdjustmentDate, 'yyyy-MM-dd')) : null,
        nextRentAdjustmentAmount: nextRentAdjustmentAmount !== '' ? euro(Number(nextRentAdjustmentAmount)) : null,
        renovationAdjustmentPlanned: renovationAdjustmentPlanned === '' ? null : renovationAdjustmentPlanned === 'true',
        petsAllowed: petsAllowed || null,
        redecorationClause: redecorationClause || null,
        subletAllowed: subletAllowed || null,
        additionalTerms: additionalTerms.trim() || null,
        issuePlace,
        issueDate,
        documentNumber,
        signatureDataUrl,
    });

    const canGenerateFor = (targetPersonId: number | null) => landlord != null && tenancy != null && tenantsFor(targetPersonId).length > 0;

    // This hook instance's own target (what the review page renders/generates
    // for) — defaults to every tenant on the unit.
    const content = buildContentFor(personId);
    const canGenerate = canGenerateFor(personId);

    const handleUploadSignature = async (file: File) => {
        setIsUploadingSignature(true);
        try {
            setSignatureDataUrl(await readFileAsDataUrl(file));
        } finally {
            setIsUploadingSignature(false);
        }
    };

    const generateFor = async (targetPersonId: number | null) => {
        if (!tenancy || !canGenerateFor(targetPersonId)) return;
        setGeneratingKey(targetPersonId ?? 'all');
        setSaveError(null);
        try {
            const saved = await updateTenancy(tenancy.tenancyId, {
                nextRentAdjustmentDate: nextRentAdjustmentDate ? format(nextRentAdjustmentDate, 'yyyy-MM-dd') : null,
                nextRentAdjustmentAmount: nextRentAdjustmentAmount !== '' ? Number(nextRentAdjustmentAmount) : null,
                renovationAdjustmentPlanned: renovationAdjustmentPlanned === '' ? null : renovationAdjustmentPlanned === 'true',
                petsAllowed: petsAllowed || null,
                redecorationClause: redecorationClause || null,
                subletAllowed: subletAllowed || null,
                additionalTerms: additionalTerms.trim() || null,
            });
            if (!saved) {
                setSaveError('Angaben konnten nicht gespeichert werden.');
                return;
            }

            const targetContent = buildContentFor(targetPersonId);
            const blob = await htmlToPdfBlob(agreementBodyHtml(targetContent));
            const fileName = `${documentNumber}.pdf`;
            if (user) {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                await uploadTenancyDocument(user.id, file, {
                    tenancyId: tenancy.tenancyId,
                    tenancyPersonId: targetPersonId,
                    documentType: 'Mietvertrag',
                });
            }
            downloadBlob(blob, fileName);
        } finally {
            setGeneratingKey(null);
        }
    };

    const handleGenerate = () => generateFor(personId);
    const isGenerating = generatingKey !== null;
    const isGeneratingFor = (targetPersonId: number | null) => generatingKey === (targetPersonId ?? 'all');

    // Entry point for the quick-generate shortcuts: asks for the missing
    // Anpassungsregelungen via a modal first if they haven't been decided
    // yet, then generates — same "always ask rather than silently default"
    // approach as the Mieterbescheinigung's Eigentümer question.
    const requestGenerate = (targetPersonId: number | null) => {
        if (!canGenerateFor(targetPersonId)) return;
        if (hasIncompleteClauses) {
            pendingGenerateTarget.current = { personId: targetPersonId };
            setClauseModalOpen(true);
            return;
        }
        void generateFor(targetPersonId);
    };

    const closeClauseModal = () => {
        setClauseModalOpen(false);
        pendingGenerateTarget.current = null;
    };

    const confirmClausesAndGenerate = () => {
        setClauseModalOpen(false);
        const target = pendingGenerateTarget.current;
        pendingGenerateTarget.current = null;
        if (target) void generateFor(target.personId);
    };

    return {
        isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord,
        unitLabel, landlordName, landlordStreet, landlordCity, propertyStreet, propertyCity, propertyAddress,
        mietbeginn, befristet, mietende, issuePlace, issueDate, livingArea, numberOfRooms, documentNumber,
        content, canGenerate, canGenerateFor, tenantsFor,
        signatureDataUrl, setSignatureDataUrl, isUploadingSignature, handleUploadSignature,
        isGenerating, isGeneratingFor, saveError, handleGenerate, generateFor,
        nextRentAdjustmentDate, setNextRentAdjustmentDate,
        nextRentAdjustmentAmount, setNextRentAdjustmentAmount,
        renovationAdjustmentPlanned, setRenovationAdjustmentPlanned,
        petsAllowed, setPetsAllowed,
        redecorationClause, setRedecorationClause,
        subletAllowed, setSubletAllowed,
        additionalTerms, setAdditionalTerms,
        clauseModalOpen, hasIncompleteClauses, requestGenerate, closeClauseModal, confirmClausesAndGenerate,
    };
}
