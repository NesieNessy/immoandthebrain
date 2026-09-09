"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { deCurrencyFormatter, downloadBlob, formatDeDate } from '@/lib/utils';
import type { RentalTermsPetsAllowed, RentalTermsRedecorationClause, RentalTermsSubletAllowed, TenancyPerson } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { readFileAsDataUrl } from './DocumentGeneratorParts';
import { agreementBodyHtml, type AgreementContent, type TriState } from './rentalAgreementLetter';
import { useUnitDocumentGeneratorData } from './useUnitDocumentGeneratorData';

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
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
