"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { Button, Icons, useToast, type SortDirection, type TableColumn } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createTenancy, getCurrentTenancyByUnit, getTenancyById, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import { createMaintenanceCosts, getMaintenanceCostsById, updateMaintenanceCosts } from '@/lib/supabase/maintenance_costs.supabase';
import { addAdjustmentHistoryEntry, getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import {
    deleteTenancyDocument,
    getTenancyDocumentsByTenancy,
    getTenancyDocumentUrl,
    renameTenancyDocument,
    uploadTenancyDocument,
} from '@/lib/supabase/tenancy_document.supabase';
import {
    createTenancyPerson,
    deleteTenancyPerson,
    getTenancyPersonsByTenancy,
    updateTenancyPerson,
} from '@/lib/supabase/tenancy_person.supabase';
import { createUseCaseMenuItems } from '@/lib/propertyUseCaseMenu';
import { cn, deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import { renovationAdjustmentLetterHtml, rentIncreaseLetterHtml } from './adjustmentLetters';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import type { MaintenanceCostItem, MaintenanceCosts, PersonalData, Property, PropertyUnit, Tenancy, TenancyAdjustmentHistoryEntry, TenancyAdjustmentType, TenancyDocument, TenancyDocumentType } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

export function addMonthsSafe(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

export interface RentalForm {
    tenancyEndDate: Date | undefined;
    coldRent: string;
    /** NK-Vorauszahlung — the tenant's monthly service-charge prepayment.
     *  Also gets overwritten by the "NK-Vorauszahlung übernehmen" action on
     *  the Nebenkostenabrechnung page; this is just the manual entry point
     *  for it (e.g. the initial value on a new tenancy). */
    miscRent: string;
    parkingSpaceRent: string;
    houseMoney: string;
    allocableCosts: string;
    nonAllocableCosts: string;
    totalCosts: string;
    nextRentAdjustmentDate: Date | undefined;
    nextRentAdjustmentAmount: string;
    rentAdjustmentReminderDate: Date | undefined;
    renovationAdjustmentStartDate: Date | undefined;
    renovationAdjustmentEndDate: Date | undefined;
    renovationAdjustmentAmount: string;
    renovationAdjustmentReminderDate: Date | undefined;
}

const EMPTY_RENTAL_FORM: RentalForm = {
    tenancyEndDate: undefined,
    coldRent: '',
    miscRent: '',
    parkingSpaceRent: '',
    houseMoney: '',
    allocableCosts: '',
    nonAllocableCosts: '',
    totalCosts: '',
    nextRentAdjustmentDate: undefined,
    nextRentAdjustmentAmount: '',
    rentAdjustmentReminderDate: undefined,
    renovationAdjustmentStartDate: undefined,
    renovationAdjustmentEndDate: undefined,
    renovationAdjustmentAmount: '',
    renovationAdjustmentReminderDate: undefined,
};

function serializeRentalForm(form: RentalForm): string {
    return JSON.stringify({
        ...form,
        tenancyEndDate: form.tenancyEndDate?.toISOString() ?? null,
        nextRentAdjustmentDate: form.nextRentAdjustmentDate?.toISOString() ?? null,
        rentAdjustmentReminderDate: form.rentAdjustmentReminderDate?.toISOString() ?? null,
        renovationAdjustmentStartDate: form.renovationAdjustmentStartDate?.toISOString() ?? null,
        renovationAdjustmentEndDate: form.renovationAdjustmentEndDate?.toISOString() ?? null,
        renovationAdjustmentReminderDate: form.renovationAdjustmentReminderDate?.toISOString() ?? null,
    });
}

/** The full § 2 BetrKV position list — 18 apportionable categories (Nr. 1–17
 *  plus the standard "Sonstige Betriebskosten" catch-all), followed by the
 *  costs that are never allocable to tenants regardless of lease wording
 *  (Verwaltung, Instandhaltung, Modernisierung, Finanzierung, Rücklagen/AfA,
 *  Erstanschaffung von Erfassungsgeräten, Rechtskosten). Amounts start at 0
 *  — unused rows are simply not summed. */
export const DEFAULT_COST_ITEMS: MaintenanceCostItem[] = [
    // Apportionable — § 2 Nr. 1–17 BetrKV
    { id: 'grundsteuer', label: 'Grundsteuer', amount: 0, allocable: true },
    { id: 'wasser', label: 'Wasserversorgung', amount: 0, allocable: true },
    { id: 'entwaesserung', label: 'Entwässerung', amount: 0, allocable: true },
    { id: 'heizung', label: 'Heizung', amount: 0, allocable: true },
    { id: 'warmwasser', label: 'Warmwasser', amount: 0, allocable: true },
    { id: 'kombianlage', label: 'Verbundene Heizungs- und Warmwasserversorgungsanlagen', amount: 0, allocable: true },
    { id: 'aufzug', label: 'Aufzug', amount: 0, allocable: true },
    { id: 'strassenreinigung', label: 'Straßenreinigung / Müllabfuhr', amount: 0, allocable: true },
    { id: 'gebaeudereinigung', label: 'Gebäudereinigung / Ungezieferbekämpfung', amount: 0, allocable: true },
    { id: 'gartenpflege', label: 'Gartenpflege', amount: 0, allocable: true },
    { id: 'beleuchtung', label: 'Beleuchtung', amount: 0, allocable: true },
    { id: 'schornstein', label: 'Schornsteinreinigung', amount: 0, allocable: true },
    { id: 'versicherung', label: 'Sach- / Haftpflichtversicherung', amount: 0, allocable: true },
    { id: 'hausmeister', label: 'Hausmeister', amount: 0, allocable: true },
    { id: 'kabel', label: 'Gemeinschaftsantenne / Kabelanschluss', amount: 0, allocable: true },
    { id: 'breitband', label: 'Breitbandanschluss / Internet-Basisversorgung', amount: 0, allocable: true },
    { id: 'waschkueche', label: 'Waschküchenbetrieb', amount: 0, allocable: true },
    { id: 'sonstige', label: 'Sonstige Betriebskosten', amount: 0, allocable: true },
    // Non-apportionable
    { id: 'verwaltung', label: 'Verwaltungskosten', amount: 0, allocable: false },
    { id: 'instandhaltung', label: 'Instandhaltung / Instandsetzung', amount: 0, allocable: false },
    { id: 'modernisierung', label: 'Modernisierungskosten', amount: 0, allocable: false },
    { id: 'finanzierung', label: 'Finanzierungskosten', amount: 0, allocable: false },
    { id: 'ruecklagen', label: 'Abschreibungen / Rücklagen', amount: 0, allocable: false },
    { id: 'verbrauchserfassung', label: 'Verbrauchserfassungseinrichtungen (Erstanschaffung)', amount: 0, allocable: false },
    { id: 'rechtskosten', label: 'Rechtliche / juristische Kosten', amount: 0, allocable: false },
    { id: 'sonstige_nicht_umlagefaehig', label: 'Sonstige nicht umlagefähige Kosten', amount: 0, allocable: false },
];

export interface PersonForm {
    id: number | null;
    lastName: string;
    firstName: string;
    taxId: string;
    isPrimary: boolean;
    moveInDate: Date | undefined;
}

const EMPTY_PRIMARY_PERSON: PersonForm = { id: null, lastName: '', firstName: '', taxId: '', isPrimary: true, moveInDate: undefined };

/** Ausweis/Schufa/Bürgschaft are always per person. Mietvertrag defaults to
 *  one shared contract for the whole tenancy (single row); the "individual"
 *  toggle swaps that row for one per person, for cases where each tenant
 *  signed a separate contract. */
const PER_PERSON_DOCUMENTS: TenancyDocumentType[] = ['Ausweis', 'Schufa', 'Bürgschaft', 'Gehaltsnachweise', 'Vormieterbescheinigung', 'Sonstiges'];
const SHARED_DOCUMENTS: TenancyDocumentType[] = ['Mietvertrag'];
/** Mieterbescheinigung is always one shared row for the whole tenancy — it
 *  has no individual/shared toggle since the certificate always lists
 *  every tenant. */
export const MIETERBESCHEINIGUNG: TenancyDocumentType = 'Mieterbescheinigung';

export function personDisplayName(person: PersonForm, index: number): string {
    const name = `${person.firstName} ${person.lastName}`.trim();
    return name || `Person ${index + 1}`;
}

function allTenantsDisplayName(persons: PersonForm[]): string {
    const names = persons.map((p, i) => personDisplayName(p, i));
    if (names.length <= 1) return names[0] ?? 'Alle Mieter';
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** First + last initial from a display name (e.g. "Klaus Fischer" → "KF"),
 *  for the avatar circle on a document row — matches Mieterdaten's tenant
 *  avatar so both use the same visual language. */
function nameInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/** Comparable snapshot of the person list — Date fields don't compare
 *  reliably with JSON.stringify unless normalized to ISO strings first. */
function serializePersons(persons: PersonForm[]): string {
    return JSON.stringify(persons.map((p) => ({ ...p, moveInDate: p.moveInDate ? p.moveInDate.toISOString() : null })));
}

/**
 * All the state, data-loading, and mutation logic shared by the
 * current-tenant and rental-agreement pages — they're separate
 * routes/components now (see CurrentTenantPage / TenantAgreementPage),
 * but both edit the same underlying tenancy/persons/maintenance_costs
 * records and share one save flow, so that part stays in one place
 * rather than being duplicated or awkwardly synced between two copies.
 */
/**
 * `archivedTenancyId` switches this from the unit's current tenancy (the
 * normal tenant-data/rental-agreement flow) to a specific past one — used by
 * the tenant history's "Ansehen" action, which reuses this same page/hook
 * instead of a bespoke read view so archived tenants get the exact same
 * layout as the current one, just with the move-out surfaced.
 */
export function useTenantUnitData(propertyId: string, property: Property, unit: PropertyUnit, hasMultipleUnits: boolean, archivedTenancyId?: number) {
    const router = useRouter();
    const { user } = useRequireAuth();
    const { showToast } = useToast();
    // Archived (tenant history "Ansehen") view: same page, but nothing that
    // mutates the record — upload/delete document controls fall back to
    // their disabled/no-affordance branch below.
    const readOnly = Boolean(archivedTenancyId);

    const [tenancy, setTenancy] = useState<Tenancy | null>(null);
    const [persons, setPersons] = useState<PersonForm[]>([EMPTY_PRIMARY_PERSON]);
    const [deletedPersonIds, setDeletedPersonIds] = useState<number[]>([]);
    const [personIndexPendingDelete, setPersonIndexPendingDelete] = useState<number | null>(null);
    const [deposit, setDeposit] = useState('');
    const [startFreshTenancy, setStartFreshTenancy] = useState(false);
    const [tenantChangeModalOpen, setTenantChangeModalOpen] = useState(false);
    const [isStartingTenantChange, setIsStartingTenantChange] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [landlord, setLandlord] = useState<PersonalData | null | undefined>(undefined);
    const [docSortKey, setDocSortKey] = useState<string>('document');
    const [docSortDirection, setDocSortDirection] = useState<SortDirection>('asc');
    const [docColumnFilters, setDocColumnFilters] = useState<Record<string, string>>({});
    const [documents, setDocuments] = useState<TenancyDocument[]>([]);
    const [pendingDocKey, setPendingDocKey] = useState<string | null>(null);
    const [docPendingDelete, setDocPendingDelete] = useState<{ key: string; label: string; doc: TenancyDocument } | null>(null);
    const [docPendingRename, setDocPendingRename] = useState<{ key: string; doc: TenancyDocument } | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [showDocUploadModal, setShowDocUploadModal] = useState(false);
    const [uploadDocType, setUploadDocType] = useState<TenancyDocumentType>(PER_PERSON_DOCUMENTS[0]);
    const [uploadPersonIndex, setUploadPersonIndex] = useState(0);
    const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
    const [uploadDocFileName, setUploadDocFileName] = useState('');
    const [mietvertragIndividual, setMietvertragIndividual] = useState(false);
    const [originalPersonsSnapshot, setOriginalPersonsSnapshot] = useState(() => serializePersons([EMPTY_PRIMARY_PERSON]));
    const [originalDeposit, setOriginalDeposit] = useState('');
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCosts | null>(null);
    const [rentalForm, setRentalForm] = useState<RentalForm>(EMPTY_RENTAL_FORM);
    const [originalRentalFormSnapshot, setOriginalRentalFormSnapshot] = useState(() => serializeRentalForm(EMPTY_RENTAL_FORM));
    const [costItems, setCostItems] = useState<MaintenanceCostItem[]>([]);
    const [originalCostItemsSnapshot, setOriginalCostItemsSnapshot] = useState('[]');
    const [historyModalType, setHistoryModalType] = useState<TenancyAdjustmentType | null>(null);
    const [historyEntries, setHistoryEntries] = useState<TenancyAdjustmentHistoryEntry[]>([]);
    const [isGeneratingLetter, setIsGeneratingLetter] = useState<TenancyAdjustmentType | null>(null);
    const [isResolvingAdjustment, setIsResolvingAdjustment] = useState<TenancyAdjustmentType | null>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchTenancy = archivedTenancyId ? getTenancyById(archivedTenancyId) : getCurrentTenancyByUnit(unit.propertyUnitId);
        fetchTenancy.then(async (found) => {
            if (cancelled) return;
            setTenancy(found);
            const loadedDeposit = found?.deposit != null ? String(found.deposit) : '';
            setDeposit(loadedDeposit);
            setOriginalDeposit(loadedDeposit);
            if (found) {
                const [loadedPersons, loadedDocuments, loadedMaintenanceCosts, loadedHistory] = await Promise.all([
                    getTenancyPersonsByTenancy(found.tenancyId),
                    getTenancyDocumentsByTenancy(found.tenancyId),
                    found.maintenanceCostsId ? getMaintenanceCostsById(found.maintenanceCostsId) : Promise.resolve(null),
                    getAdjustmentHistoryByTenancy(found.tenancyId),
                ]);
                if (cancelled) return;
                const mappedPersons = loadedPersons.length > 0
                    ? loadedPersons.map((p) => ({
                        id: p.tenancyPersonId,
                        lastName: p.lastName ?? '',
                        firstName: p.firstName ?? '',
                        taxId: p.taxId ?? '',
                        isPrimary: p.isPrimary,
                        moveInDate: p.moveInDate ? new Date(p.moveInDate) : undefined,
                    }))
                    : [EMPTY_PRIMARY_PERSON];
                setPersons(mappedPersons);
                setOriginalPersonsSnapshot(serializePersons(mappedPersons));
                setDocuments(loadedDocuments);
                setMaintenanceCosts(loadedMaintenanceCosts);
                setHistoryEntries(loadedHistory);
                const loadedCostItems = loadedMaintenanceCosts?.costItems ?? [];
                setCostItems(loadedCostItems);
                setOriginalCostItemsSnapshot(JSON.stringify(loadedCostItems));
                const form: RentalForm = {
                    tenancyEndDate: found.tenancyEndDate ? new Date(found.tenancyEndDate) : undefined,
                    coldRent: found.coldRent != null ? String(found.coldRent) : '',
                    miscRent: found.miscRent != null ? String(found.miscRent) : '',
                    parkingSpaceRent: found.parkingSpaceRent != null ? String(found.parkingSpaceRent) : '',
                    houseMoney: loadedMaintenanceCosts?.houseMoney != null ? String(loadedMaintenanceCosts.houseMoney) : '',
                    allocableCosts: loadedMaintenanceCosts?.allocableCosts != null ? String(loadedMaintenanceCosts.allocableCosts) : '',
                    nonAllocableCosts: loadedMaintenanceCosts?.nonAllocableCosts != null ? String(loadedMaintenanceCosts.nonAllocableCosts) : '',
                    totalCosts: loadedMaintenanceCosts?.totalCosts != null ? String(loadedMaintenanceCosts.totalCosts) : '',
                    nextRentAdjustmentDate: found.nextRentAdjustmentDate ? new Date(found.nextRentAdjustmentDate) : undefined,
                    nextRentAdjustmentAmount: found.nextRentAdjustmentAmount != null ? String(found.nextRentAdjustmentAmount) : '',
                    rentAdjustmentReminderDate: found.rentAdjustmentReminderDate ? new Date(found.rentAdjustmentReminderDate) : undefined,
                    renovationAdjustmentStartDate: found.renovationAdjustmentStartDate ? new Date(found.renovationAdjustmentStartDate) : undefined,
                    renovationAdjustmentEndDate: found.renovationAdjustmentEndDate ? new Date(found.renovationAdjustmentEndDate) : undefined,
                    renovationAdjustmentAmount: found.renovationAdjustmentAmount != null ? String(found.renovationAdjustmentAmount) : '',
                    renovationAdjustmentReminderDate: found.renovationAdjustmentReminderDate ? new Date(found.renovationAdjustmentReminderDate) : undefined,
                };
                setRentalForm(form);
                setOriginalRentalFormSnapshot(serializeRentalForm(form));
            } else {
                setPersons([EMPTY_PRIMARY_PERSON]);
                setOriginalPersonsSnapshot(serializePersons([EMPTY_PRIMARY_PERSON]));
                setDocuments([]);
                setMaintenanceCosts(null);
                setHistoryEntries([]);
                setCostItems([]);
                setOriginalCostItemsSnapshot('[]');
                setRentalForm(EMPTY_RENTAL_FORM);
                setOriginalRentalFormSnapshot(serializeRentalForm(EMPTY_RENTAL_FORM));
            }
        });
        return () => { cancelled = true; };
    }, [unit.propertyUnitId, archivedTenancyId]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        getPersonalData(user.id).then((data) => { if (!cancelled) setLandlord(data ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    // Lets a document flow that lives outside this hook's own upload path
    // (e.g. the independent Mieterbescheinigung/Mietvertrag generators) tell
    // this page's document list — and the documents table further down the
    // page — to catch up after it uploads or deletes something on its own.
    const refreshDocuments = async () => {
        if (!tenancy) return;
        setDocuments(await getTenancyDocumentsByTenancy(tenancy.tenancyId));
    };

    const status = useMemo(() => {
        if (!tenancy || startFreshTenancy) return 'Unvermietet' as const;
        return 'Vermietet' as const;
    }, [tenancy, startFreshTenancy]);

    const isEditing = startFreshTenancy
        || deposit !== originalDeposit
        || serializePersons(persons) !== originalPersonsSnapshot
        || serializeRentalForm(rentalForm) !== originalRentalFormSnapshot
        || JSON.stringify(costItems) !== originalCostItemsSnapshot;

    // Any navigation away from an unsaved edit is routed through here so it
    // can be confirmed first (breadcrumb links, the back button, the use-case menu).
    const goTo = (href: string) => {
        if (isEditing) {
            setPendingHref(href);
        } else {
            router.push(href);
        }
    };

    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };

    // Upload is only possible once the underlying row is actually saved —
    // a draft person (id === null) or a unit with no tenancy yet has
    // nothing to attach the document to. The rental agreement is either one
    // shared row (default) or one row per person — never both — toggled via
    // mietvertragIndividual; every rental-agreement row carries the toggle
    // button so switching modes is reachable from any of them.
    // The rental agreement can't meaningfully be generated without the
    // landlord's own data, so the whole row — upload, toggle and generate —
    // stays disabled until user-settings has been filled in.
    const landlordMissing = !landlord;

    // Total service charges is computed as the sum of the two breakdown fields
    // whenever either is filled in — otherwise it stays freely editable.
    const costBreakdownActive = rentalForm.allocableCosts !== '' || rentalForm.nonAllocableCosts !== '';
    const computedTotalCosts = costBreakdownActive
        ? (Number(rentalForm.allocableCosts || 0) + Number(rentalForm.nonAllocableCosts || 0))
        : null;

    const defaultRentReminderDate = rentalForm.nextRentAdjustmentDate ? addMonthsSafe(rentalForm.nextRentAdjustmentDate, -4) : undefined;
    const effectiveRentReminderDate = rentalForm.rentAdjustmentReminderDate ?? defaultRentReminderDate;
    const defaultRenovationReminderDate = rentalForm.renovationAdjustmentStartDate ? addMonthsSafe(rentalForm.renovationAdjustmentStartDate, -4) : undefined;
    const effectiveRenovationReminderDate = rentalForm.renovationAdjustmentReminderDate ?? defaultRenovationReminderDate;

    // Ausweis/Schufa/Bürgschaft only — the rental agreement and tenant
    // certificate moved to the "Generierbare Dokumente" section below,
    // where the generate action can be a lot more prominent than a table icon.
    const documentRows = useMemo(() => (
        persons.flatMap((person, personIndex) =>
            PER_PERSON_DOCUMENTS
                .map((document) => ({
                    key: `${document}-${personIndex}`,
                    document,
                    tenant: personDisplayName(person, personIndex),
                    tenancyPersonId: person.id,
                    doc: person.id != null
                        ? documents.find((d) => d.tenancyPersonId === person.id && d.documentType === document)
                        : undefined,
                }))
                .filter((row) => row.doc != null)
        )
    ), [persons, documents]);

    const documentFilterOptions = useMemo(
        () => PER_PERSON_DOCUMENTS.map((value) => ({ value, label: value })),
        []
    );

    // Persons a document can be attached to — a draft person (id === null)
    // has nothing to attach it to yet.
    const uploadablePersonOptions = useMemo(
        () => persons
            .map((person, index) => ({ person, index }))
            .filter(({ person }) => person.id != null)
            .map(({ person, index }) => ({ value: String(index), label: personDisplayName(person, index) })),
        [persons]
    );

    const canUploadDocument = tenancy != null && uploadablePersonOptions.length > 0;

    const openDocUploadModal = () => {
        setUploadDocType(PER_PERSON_DOCUMENTS[0]);
        setUploadPersonIndex(Number(uploadablePersonOptions[0]?.value ?? 0));
        setUploadDocFile(null);
        setUploadDocFileName('');
        setShowDocUploadModal(true);
    };

    const closeDocUploadModal = () => {
        setShowDocUploadModal(false);
        setUploadDocFile(null);
        setUploadDocFileName('');
    };

    const selectUploadDocFile = (file: File | null) => {
        setUploadDocFile(file);
    };

    const mietvertrag = SHARED_DOCUMENTS[0];

    const mietvertragRows = useMemo(() => (
        mietvertragIndividual
            ? persons.map((person, personIndex) => ({
                key: `${mietvertrag}-${personIndex}`,
                tenant: personDisplayName(person, personIndex),
                tenancyPersonId: person.id,
                canUpload: tenancy != null && person.id != null,
                doc: person.id != null
                    ? documents.find((d) => d.tenancyPersonId === person.id && d.documentType === mietvertrag)
                    : undefined,
            }))
            : [{
                key: mietvertrag,
                tenant: allTenantsDisplayName(persons),
                tenancyPersonId: null as number | null,
                canUpload: tenancy != null,
                doc: documents.find((d) => d.tenancyPersonId === null && d.documentType === mietvertrag),
            }]
    ), [persons, documents, tenancy, mietvertragIndividual, mietvertrag]);

    const mieterbescheinigungRow = useMemo(() => ({
        key: MIETERBESCHEINIGUNG,
        tenant: allTenantsDisplayName(persons),
        canUpload: tenancy != null,
        doc: documents.find((d) => d.tenancyPersonId === null && d.documentType === MIETERBESCHEINIGUNG),
    }), [persons, documents, tenancy]);

    const rentIncreaseLetterRow = useMemo(() => ({
        key: 'Mieterhöhungsschreiben',
        tenant: 'Mieterhöhungsschreiben',
        canUpload: false,
        doc: documents.find((d) => d.tenancyPersonId === null && d.documentType === 'Mieterhöhungsschreiben'),
    }), [documents]);

    const renovationLetterRow = useMemo(() => ({
        key: 'Sanierungsanpassungsschreiben',
        tenant: 'Sanierungsanpassungsschreiben',
        canUpload: false,
        doc: documents.find((d) => d.tenancyPersonId === null && d.documentType === 'Sanierungsanpassungsschreiben'),
    }), [documents]);

    const tenantFilterOptions = useMemo(() => {
        const names = Array.from(new Set(documentRows.map((row) => row.tenant)));
        return names.map((value) => ({ value, label: value }));
    }, [documentRows]);

    const handleDocSort = (key: string) => {
        if (docSortKey === key) {
            setDocSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setDocSortKey(key);
            setDocSortDirection('asc');
        }
    };

    const handleDocColumnFilterChange = (key: string, value: string) => {
        setDocColumnFilters((prev) => ({ ...prev, [key]: value }));
    };

    const documentTableData = useMemo(() => {
        let filtered = documentRows;
        for (const [key, val] of Object.entries(docColumnFilters)) {
            if (!val) continue;
            filtered = filtered.filter((row) => row[key as keyof typeof row] === val);
        }

        return [...filtered].sort((a, b) => {
            const av = String(a[docSortKey as keyof typeof a] ?? '');
            const bv = String(b[docSortKey as keyof typeof a] ?? '');
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return docSortDirection === 'asc' ? cmp : -cmp;
        });
    }, [documentRows, docColumnFilters, docSortKey, docSortDirection]);

    const useCaseMenuItems = useMemo(() =>
        createUseCaseMenuItems(propertyId, 'TenantData', (route) => {
            goTo(route);
        }),
        [propertyId, isEditing] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const updatePerson = (index: number, patch: Partial<PersonForm>) => {
        setPersons((prev) => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
    };

    const addPerson = () => {
        setPersons((prev) => [...prev, { id: null, lastName: '', firstName: '', taxId: '', isPrimary: false, moveInDate: undefined }]);
    };

    const removePerson = (index: number) => {
        setPersons((prev) => {
            const removed = prev[index];
            if (removed.id) setDeletedPersonIds((ids) => [...ids, removed.id!]);
            return prev.filter((_, i) => i !== index);
        });
    };

    // Already-saved persons (id !== null) get a confirmation modal before
    // removal; drafts that were never persisted can just be dropped.
    const handleDeletePersonClick = (index: number) => {
        if (index === 0) return;
        if (persons[index].id !== null) {
            setPersonIndexPendingDelete(index);
        } else {
            removePerson(index);
        }
    };

    const confirmDeletePerson = () => {
        if (personIndexPendingDelete !== null) removePerson(personIndexPendingDelete);
        setPersonIndexPendingDelete(null);
    };

    // The primary tenant is always index 0 (required fields, non-deletable),
    // so making someone else primary means moving them to the front.
    const makePrimary = (index: number) => {
        if (index === 0) return;
        setPersons((prev) => {
            const next = prev.map((p, i) => ({ ...p, isPrimary: i === index }));
            const [newPrimary] = next.splice(index, 1);
            return [newPrimary, ...next];
        });
    };

    // A tenant change always needs confirmation first — it discards the
    // currently-shown tenant. The two continue-paths both end the current
    // tenancy (once the tenancy history record exists, that's what makes it
    // show up there); leaving with a move-out navigates away immediately, so
    // that part has to be written right away rather than deferred to the
    // save handler like the "without move-out" path (which stays on the
    // page to enter the new tenant).
    const confirmTenantChange = async (withMoveOut: boolean) => {
        setIsStartingTenantChange(true);
        try {
            if (withMoveOut) {
                if (tenancy) {
                    await updateTenancy(tenancy.tenancyId, { tenancyEndDate: format(new Date(), 'yyyy-MM-dd') });
                }
                setTenantChangeModalOpen(false);
                router.push(`/existing-properties/${propertyId}/tenant-move-out`);
                return;
            }

            setStartFreshTenancy(true);
            setPersons([EMPTY_PRIMARY_PERSON]);
            setDeposit('');
            setDeletedPersonIds([]);
            setRentalForm(EMPTY_RENTAL_FORM);
            setCostItems([]);
            setMaintenanceCosts(null);
            setTenantChangeModalOpen(false);
        } finally {
            setIsStartingTenantChange(false);
        }
    };

    const backHref = archivedTenancyId
        ? `/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}`
        : hasMultipleUnits
            ? `/existing-properties/${propertyId}/tenant-data`
            : `/existing-properties/${propertyId}`;

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            let activeTenancyId = tenancy?.tenancyId ?? null;
            const depositValue = deposit !== '' ? Number(deposit) : null;
            const hasAnyPersonData = persons.some((p) => p.lastName.trim() !== '' || p.firstName.trim() !== '');

            // The primary tenant's own move-in date (persons[0].moveInDate) is
            // the single source of truth for the tenancy's move-in date — the
            // rental-agreement tab's move-in date field edits that same value.
            const primaryMoveInDate = persons[0]?.moveInDate;
            const startDateValue = primaryMoveInDate ? format(primaryMoveInDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
            const endDateValue = rentalForm.tenancyEndDate ? format(rentalForm.tenancyEndDate, 'yyyy-MM-dd') : null;
            const coldRentValue = rentalForm.coldRent !== '' ? Number(rentalForm.coldRent) : null;
            const miscRentValue = rentalForm.miscRent !== '' ? Number(rentalForm.miscRent) : null;
            const parkingSpaceRentValue = rentalForm.parkingSpaceRent !== '' ? Number(rentalForm.parkingSpaceRent) : null;
            const adjustmentFields = {
                nextRentAdjustmentDate: rentalForm.nextRentAdjustmentDate ? format(rentalForm.nextRentAdjustmentDate, 'yyyy-MM-dd') : null,
                nextRentAdjustmentAmount: rentalForm.nextRentAdjustmentAmount !== '' ? Number(rentalForm.nextRentAdjustmentAmount) : null,
                rentAdjustmentReminderDate: rentalForm.rentAdjustmentReminderDate ? format(rentalForm.rentAdjustmentReminderDate, 'yyyy-MM-dd') : null,
                renovationAdjustmentStartDate: rentalForm.renovationAdjustmentStartDate ? format(rentalForm.renovationAdjustmentStartDate, 'yyyy-MM-dd') : null,
                renovationAdjustmentEndDate: rentalForm.renovationAdjustmentEndDate ? format(rentalForm.renovationAdjustmentEndDate, 'yyyy-MM-dd') : null,
                renovationAdjustmentAmount: rentalForm.renovationAdjustmentAmount !== '' ? Number(rentalForm.renovationAdjustmentAmount) : null,
                renovationAdjustmentReminderDate: rentalForm.renovationAdjustmentReminderDate ? format(rentalForm.renovationAdjustmentReminderDate, 'yyyy-MM-dd') : null,
                // Only ever forces this to true (renovation fields filled in here);
                // never clobbers an explicit false set on the rental-agreement
                // generation page when this tab's renovation fields are left untouched.
                renovationAdjustmentPlanned: (rentalForm.renovationAdjustmentStartDate || rentalForm.renovationAdjustmentEndDate || rentalForm.renovationAdjustmentAmount !== '') ? true : undefined,
            };

            if (startFreshTenancy) {
                if (tenancy) {
                    await updateTenancy(tenancy.tenancyId, {
                        tenancyEndDate: format(new Date(), 'yyyy-MM-dd'),
                    });
                }
                if (hasAnyPersonData) {
                    const created = await createTenancy({
                        propertyId: property.propertyId,
                        propertyUnitId: unit.propertyUnitId,
                        maintenanceCostsId: null,
                        parkingSpaceId: null,
                        isRented: true,
                        tenancyStartDate: startDateValue,
                        tenancyEndDate: endDateValue,
                        tenancyType: null,
                        tenancyUnits: null,
                        tenancyUnitsPrice: null,
                        parkingSpaceRent: parkingSpaceRentValue,
                        miscRent: miscRentValue,
                        warmRent: null,
                        coldRent: coldRentValue,
                        tenantFirstName: '',
                        tenantLastName: '',
                        deposit: depositValue,
                        ...adjustmentFields,
                    });
                    activeTenancyId = created?.tenancyId ?? null;
                } else {
                    activeTenancyId = null;
                }
            } else if (!tenancy && hasAnyPersonData) {
                const created = await createTenancy({
                    propertyId: property.propertyId,
                    propertyUnitId: unit.propertyUnitId,
                    maintenanceCostsId: null,
                    parkingSpaceId: null,
                    isRented: true,
                    tenancyStartDate: startDateValue,
                    tenancyEndDate: endDateValue,
                    tenancyType: null,
                    tenancyUnits: null,
                    tenancyUnitsPrice: null,
                    parkingSpaceRent: parkingSpaceRentValue,
                    miscRent: miscRentValue,
                    warmRent: null,
                    coldRent: coldRentValue,
                    tenantFirstName: '',
                    tenantLastName: '',
                    deposit: depositValue,
                    ...adjustmentFields,
                });
                activeTenancyId = created?.tenancyId ?? null;
            } else if (tenancy) {
                await updateTenancy(tenancy.tenancyId, {
                    deposit: depositValue,
                    tenancyStartDate: startDateValue,
                    tenancyEndDate: endDateValue,
                    coldRent: coldRentValue,
                    miscRent: miscRentValue,
                    parkingSpaceRent: parkingSpaceRentValue,
                    ...adjustmentFields,
                });
            }

            if (activeTenancyId) {
                const mcFieldsPresent = rentalForm.houseMoney !== '' || rentalForm.allocableCosts !== '' || rentalForm.nonAllocableCosts !== '' || rentalForm.totalCosts !== '' || costItems.length > 0;
                if (mcFieldsPresent) {
                    const totalCostsValue = computedTotalCosts != null ? computedTotalCosts : (rentalForm.totalCosts !== '' ? Number(rentalForm.totalCosts) : null);
                    const mcPayload = {
                        costBreakdown: costItems.length > 0,
                        allocableCosts: rentalForm.allocableCosts !== '' ? Number(rentalForm.allocableCosts) : null,
                        nonAllocableCosts: rentalForm.nonAllocableCosts !== '' ? Number(rentalForm.nonAllocableCosts) : null,
                        totalCosts: totalCostsValue,
                        houseMoney: rentalForm.houseMoney !== '' ? Number(rentalForm.houseMoney) : null,
                        costItems: costItems.length > 0 ? costItems : null,
                    };
                    if (maintenanceCosts) {
                        const updated = await updateMaintenanceCosts(maintenanceCosts.maintenanceCostsId, mcPayload);
                        if (!updated) throw new Error('updateMaintenanceCosts failed');
                    } else {
                        const createdCosts = await createMaintenanceCosts({
                            propertyId: property.propertyId,
                            allocableCostsProjection: false,
                            nonAllocableCostsProjection: false,
                            totalCostsProjection: false,
                            ...mcPayload,
                        });
                        if (!createdCosts) throw new Error('createMaintenanceCosts failed');
                        await updateTenancy(activeTenancyId, { maintenanceCostsId: createdCosts.maintenanceCostsId });
                    }
                }

                for (let i = 0; i < persons.length; i++) {
                    const p = persons[i];
                    const moveInDate = p.moveInDate ? format(p.moveInDate, 'yyyy-MM-dd') : null;
                    if (p.id) {
                        await updateTenancyPerson(p.id, {
                            lastName: p.lastName || null,
                            firstName: p.firstName || null,
                            taxId: p.taxId || null,
                            moveInDate,
                        });
                    } else if (p.lastName.trim() !== '' || p.firstName.trim() !== '') {
                        await createTenancyPerson({
                            tenancyId: activeTenancyId,
                            lastName: p.lastName || null,
                            firstName: p.firstName || null,
                            taxId: p.taxId || null,
                            isPrimary: p.isPrimary,
                            sortOrder: i,
                            moveInDate,
                        });
                    }
                }
            }

            for (const id of deletedPersonIds) {
                await deleteTenancyPerson(id);
            }

            showToast('Mieterdaten gespeichert.');
            router.push(backHref);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUploadDocument = async (
        key: string,
        tenancyPersonId: number | null,
        documentType: TenancyDocumentType,
        file: File,
        fileName?: string,
    ) => {
        if (!tenancy || !user) return;
        setPendingDocKey(key);
        try {
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId,
                documentType,
            }, fileName);
            if (uploaded) {
                setDocuments((prev) => [...prev.filter((d) => d.tenancyDocumentId !== uploaded.tenancyDocumentId), uploaded]);
            } else {
                setError('Datei konnte nicht hochgeladen werden.');
            }
        } finally {
            setPendingDocKey(null);
        }
    };

    const handleDocUploadSubmit = async () => {
        const person = persons[uploadPersonIndex];
        if (!uploadDocFile || !person || person.id == null) return;
        await handleUploadDocument(`${uploadDocType}-${uploadPersonIndex}`, person.id, uploadDocType, uploadDocFile, uploadDocFileName);
        closeDocUploadModal();
    };

    const handleViewDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // The signed URL is cross-origin, so a plain <a download> doesn't force
    // a download in every browser — fetch the bytes and save them locally.
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

    const confirmDeleteDocument = async () => {
        if (!docPendingDelete) return;
        const { key, doc } = docPendingDelete;
        setPendingDocKey(key);
        try {
            const success = await deleteTenancyDocument(doc.tenancyDocumentId, doc.storagePath);
            if (success) {
                setDocuments((prev) => prev.filter((d) => d.tenancyDocumentId !== doc.tenancyDocumentId));
            }
        } finally {
            setPendingDocKey(null);
            setDocPendingDelete(null);
        }
    };

    const openRenameModal = (key: string, doc: TenancyDocument) => {
        setDocPendingRename({ key, doc });
        setRenameValue(doc.fileName);
    };

    const closeRenameModal = () => {
        setDocPendingRename(null);
        setRenameValue('');
    };

    const confirmRenameDocument = async () => {
        if (!docPendingRename) return;
        const trimmed = renameValue.trim();
        if (!trimmed) return;
        setIsRenaming(true);
        try {
            const renamed = await renameTenancyDocument(docPendingRename.doc.tenancyDocumentId, trimmed);
            if (renamed) {
                setDocuments((prev) => prev.map((d) => (d.tenancyDocumentId === renamed.tenancyDocumentId ? renamed : d)));
                closeRenameModal();
            }
        } finally {
            setIsRenaming(false);
        }
    };

    const documentColumns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'document',
            label: 'Dokument',
            width: '140px',
            sortable: true,
            filterable: true,
            filterOptions: documentFilterOptions,
        },
        {
            key: 'tenant',
            label: 'Mieter',
            width: '220px',
            sortable: true,
            filterable: true,
            filterOptions: tenantFilterOptions,
            renderCell: (v) => <span className="block truncate" title={String(v)}>{String(v)}</span>,
        },
        {
            key: 'file',
            label: 'Datei',
            width: '200px',
            renderCell: (_v, row) => {
                const fileName = (row.doc as TenancyDocument | undefined)?.fileName ?? '–';
                return <span className="block truncate" title={fileName}>{fileName}</span>;
            },
        },
        {
            key: 'action',
            label: 'Aktion',
            width: '170px',
            align: 'right',
            renderCell: (_v, row) => {
                const key = row.key as string;
                const doc = row.doc as TenancyDocument;
                const isPending = pendingDocKey === key;

                return (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => void handleViewDocument(doc)}
                            aria-label={`${row.document as string} ansehen`}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Icons.Eye className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleDownloadDocument(doc)}
                            aria-label={`${row.document as string} herunterladen`}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Icons.Download className="w-4 h-4" />
                        </button>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => openRenameModal(key, doc)}
                                aria-label={`${row.document as string} umbenennen`}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                                <Icons.Rename className="w-4 h-4" />
                            </button>
                        )}
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => setDocPendingDelete({ key, doc, label: `${row.document as string} von ${row.tenant as string}` })}
                                disabled={isPending}
                                aria-label={`${row.document as string} löschen`}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                                <Icons.Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            },
        },
    ];

    // Shared row renderer for the rental-agreement/tenant-certificate cards
    // in "Generierbare Dokumente" — same view/download/delete/upload logic
    // as the documents table's action column, just inside a card row
    // instead of a table cell.
    const renderDocRow = (
        row: { key: string; tenant: string; tenancyPersonId?: number | null; canUpload: boolean; doc?: TenancyDocument },
        documentType: TenancyDocumentType,
        blocked: boolean,
        showUploadInRow: boolean = true,
    ) => {
        const isPending = pendingDocKey === row.key;
        return (
            <div key={row.key} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                <div className="min-w-0 flex items-center gap-3 flex-wrap">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {nameInitials(row.tenant)}
                    </div>
                    <span className="text-sm text-foreground truncate">{row.tenant}</span>
                    {row.doc ? (
                        <button
                            type="button"
                            onClick={() => void handleViewDocument(row.doc!)}
                            title={row.doc.fileName}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium max-w-[180px] hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                            <Icons.FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{row.doc.fileName}</span>
                        </button>
                    ) : !showUploadInRow && (
                        <span className="text-xs text-muted-foreground">Kein Dokument hinterlegt</span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {row.doc ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void handleDownloadDocument(row.doc!)}
                                aria-label="Herunterladen"
                                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                                <Icons.Download className="w-4 h-4" />
                            </button>
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={() => setDocPendingDelete({ key: row.key, doc: row.doc!, label: `${documentType} von ${row.tenant}` })}
                                    disabled={isPending}
                                    aria-label={BUTTON_DETAILS.Delete.label}
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <Icons.Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </>
                    ) : !showUploadInRow || readOnly ? null : !row.canUpload || blocked ? (
                        <span title={blocked ? 'Bitte zuerst Vermieterdaten in den Einstellungen hinterlegen' : 'Bitte zuerst speichern'}>
                            <Button iconOnly icon={<Icons.Upload className="w-4 h-4" />} variant="outline" size="sm" disabled aria-label="Hochladen" />
                        </span>
                    ) : (
                        <>
                            <input
                                id={`doc-upload-${row.key}`}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.docx"
                                className="sr-only"
                                disabled={isPending}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) void handleUploadDocument(row.key, row.tenancyPersonId ?? null, documentType, file);
                                }}
                            />
                            <label
                                htmlFor={`doc-upload-${row.key}`}
                                title="Hochladen"
                                className={cn(
                                    "inline-flex items-center justify-center p-1.5 rounded-lg border-2 border-primary text-primary cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground",
                                    isPending && "opacity-50 pointer-events-none"
                                )}
                            >
                                <Icons.Upload className="w-4 h-4" />
                            </label>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // Standalone upload control for the footer of generated-document cards
    // (Mietvertrag, Mieterbescheinigung) — re-uploading replaces whatever's
    // there. Sized and styled to match the Button component's md/ghost look
    // exactly, since it can't use Button itself (needs to wrap a hidden
    // file input via a <label for>).
    const renderFooterUpload = (
        row: { key: string; tenancyPersonId?: number | null; canUpload: boolean },
        documentType: TenancyDocumentType,
        blocked: boolean,
        label: string = 'Datei hochladen',
    ) => {
        if (readOnly) return null;
        const isPending = pendingDocKey === row.key;
        if (!row.canUpload || blocked) {
            return (
                <span key={row.key} title={blocked ? 'Bitte zuerst Vermieterdaten in den Einstellungen hinterlegen' : 'Bitte zuerst speichern'}>
                    <Button label={label} icon={<Icons.Upload className="w-5 h-5" />} variant="ghost" disabled />
                </span>
            );
        }
        return (
            <span key={row.key}>
                <input
                    id={`doc-upload-footer-${row.key}`}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    className="sr-only"
                    disabled={isPending}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleUploadDocument(row.key, row.tenancyPersonId ?? null, documentType, file);
                    }}
                />
                <label
                    htmlFor={`doc-upload-footer-${row.key}`}
                    className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 bg-transparent text-foreground cursor-pointer transition-all duration-200 hover:bg-muted",
                        isPending && "opacity-50 pointer-events-none"
                    )}
                >
                    <Icons.Upload className="w-5 h-5" />
                    {label}
                </label>
            </span>
        );
    };

    const generatorBase = `/existing-properties/${propertyId}/tenant-data/unit/${unit.propertyUnitId}`;

    const buildLetterParty = () => ({
        landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '',
        landlordStreet: landlord ? `${landlord.street} ${landlord.houseNumber}` : '',
        landlordCity: landlord ? `${landlord.postalCode} ${landlord.city}` : '',
        propertyAddress: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
        unitLabel: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
        tenantNames: persons.filter((p) => p.lastName.trim() !== '' || p.firstName.trim() !== '').map((p) => `${p.firstName} ${p.lastName}`.trim()),
        issuePlace: landlord?.city || property.city,
        issueDate: formatDeDate(new Date().toISOString()),
    });

    const canGenerateRentIncreaseLetter = !landlordMissing && tenancy != null && rentalForm.nextRentAdjustmentDate != null && rentalForm.nextRentAdjustmentAmount !== '';
    const canGenerateRenovationLetter = !landlordMissing && tenancy != null && rentalForm.renovationAdjustmentAmount !== '' && (rentalForm.renovationAdjustmentStartDate != null || rentalForm.renovationAdjustmentEndDate != null);

    const handleGenerateRentIncreaseLetter = async () => {
        if (!tenancy || !canGenerateRentIncreaseLetter || !user) return;
        setIsGeneratingLetter('rent');
        try {
            const effectiveDate = rentalForm.nextRentAdjustmentDate ? format(rentalForm.nextRentAdjustmentDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
            const html = rentIncreaseLetterHtml({
                ...buildLetterParty(),
                currentColdRent: tenancy.coldRent,
                increaseAmount: Number(rentalForm.nextRentAdjustmentAmount),
                effectiveDate,
            });
            const blob = await htmlToPdfBlob(html);
            const file = new File([blob], `Mieterhoehungsschreiben_${effectiveDate}.pdf`, { type: 'application/pdf' });
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Mieterhöhungsschreiben',
            });
            if (uploaded) setDocuments((prev) => [...prev.filter((d) => d.tenancyDocumentId !== uploaded.tenancyDocumentId), uploaded]);
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'rent',
                effectiveDate,
                amount: Number(rentalForm.nextRentAdjustmentAmount),
                note: 'Mieterhöhungsschreiben erstellt',
            });
            if (created) setHistoryEntries((prev) => [created, ...prev]);
        } finally {
            setIsGeneratingLetter(null);
        }
    };

    const handleGenerateRenovationLetter = async () => {
        if (!tenancy || !canGenerateRenovationLetter || !user) return;
        setIsGeneratingLetter('renovation');
        try {
            const effectiveDate = rentalForm.renovationAdjustmentEndDate
                ? format(rentalForm.renovationAdjustmentEndDate, 'yyyy-MM-dd')
                : format(new Date(), 'yyyy-MM-dd');
            const html = renovationAdjustmentLetterHtml({
                ...buildLetterParty(),
                modernizationAmount: Number(rentalForm.renovationAdjustmentAmount),
                startDate: rentalForm.renovationAdjustmentStartDate ? format(rentalForm.renovationAdjustmentStartDate, 'yyyy-MM-dd') : null,
                endDate: rentalForm.renovationAdjustmentEndDate ? format(rentalForm.renovationAdjustmentEndDate, 'yyyy-MM-dd') : null,
                effectiveDate,
            });
            const blob = await htmlToPdfBlob(html);
            const file = new File([blob], `Sanierungsanpassungsschreiben_${effectiveDate}.pdf`, { type: 'application/pdf' });
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Sanierungsanpassungsschreiben',
            });
            if (uploaded) setDocuments((prev) => [...prev.filter((d) => d.tenancyDocumentId !== uploaded.tenancyDocumentId), uploaded]);
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'renovation',
                effectiveDate,
                amount: Number(rentalForm.renovationAdjustmentAmount),
                note: 'Sanierungsanpassungsschreiben erstellt',
            });
            if (created) setHistoryEntries((prev) => [created, ...prev]);
        } finally {
            setIsGeneratingLetter(null);
        }
    };

    // Accepting applies the change (rent adjustments bump net rental income;
    // renovation adjustment has no single field to bump) and logs it to the
    // history. Declining just clears the pending fields — nothing is ever
    // written to the history unless the client actually accepted it.
    const handleAcceptRentAdjustment = async () => {
        if (!tenancy) return;
        setIsResolvingAdjustment('rent');
        try {
            const amount = Number(rentalForm.nextRentAdjustmentAmount || 0);
            const newColdRent = (tenancy.coldRent ?? 0) + amount;
            const effectiveDate = rentalForm.nextRentAdjustmentDate ? format(rentalForm.nextRentAdjustmentDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
            await updateTenancy(tenancy.tenancyId, { coldRent: newColdRent });
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'rent',
                effectiveDate,
                amount,
                note: 'Mietanpassung übernommen',
            });
            if (created) setHistoryEntries((prev) => [created, ...prev]);
            setTenancy((prev) => prev ? { ...prev, coldRent: newColdRent } : prev);
            setRentalForm((prev) => ({ ...prev, coldRent: String(newColdRent) }));
        } finally {
            setIsResolvingAdjustment(null);
        }
    };

    const handleDeclineRentAdjustment = async () => {
        if (!tenancy) return;
        setIsResolvingAdjustment('rent');
        try {
            await updateTenancy(tenancy.tenancyId, {
                nextRentAdjustmentDate: null,
                nextRentAdjustmentAmount: null,
                rentAdjustmentReminderDate: null,
            });
            setRentalForm((prev) => ({ ...prev, nextRentAdjustmentDate: undefined, nextRentAdjustmentAmount: '', rentAdjustmentReminderDate: undefined }));
        } finally {
            setIsResolvingAdjustment(null);
        }
    };

    const handleAcceptRenovationAdjustment = async () => {
        if (!tenancy) return;
        setIsResolvingAdjustment('renovation');
        try {
            const amount = Number(rentalForm.renovationAdjustmentAmount || 0);
            const newColdRent = (tenancy.coldRent ?? 0) + amount;
            const effectiveDate = rentalForm.renovationAdjustmentEndDate
                ? format(rentalForm.renovationAdjustmentEndDate, 'yyyy-MM-dd')
                : format(new Date(), 'yyyy-MM-dd');
            await updateTenancy(tenancy.tenancyId, { coldRent: newColdRent });
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'renovation',
                effectiveDate,
                amount,
                note: 'Sanierungsanpassung übernommen',
            });
            if (created) setHistoryEntries((prev) => [created, ...prev]);
            setTenancy((prev) => prev ? { ...prev, coldRent: newColdRent } : prev);
            setRentalForm((prev) => ({ ...prev, coldRent: String(newColdRent) }));
        } finally {
            setIsResolvingAdjustment(null);
        }
    };

    const handleDeclineRenovationAdjustment = async () => {
        if (!tenancy) return;
        setIsResolvingAdjustment('renovation');
        try {
            await updateTenancy(tenancy.tenancyId, {
                renovationAdjustmentStartDate: null,
                renovationAdjustmentEndDate: null,
                renovationAdjustmentAmount: null,
                renovationAdjustmentReminderDate: null,
                renovationAdjustmentPlanned: false,
            });
            setRentalForm((prev) => ({
                ...prev,
                renovationAdjustmentStartDate: undefined,
                renovationAdjustmentEndDate: undefined,
                renovationAdjustmentAmount: '',
                renovationAdjustmentReminderDate: undefined,
            }));
        } finally {
            setIsResolvingAdjustment(null);
        }
    };

    return {
        // state
        tenancy, persons, deletedPersonIds, personIndexPendingDelete, deposit, startFreshTenancy,
        isSaving, error, landlord, docSortKey, docSortDirection, docColumnFilters, documents,
        pendingDocKey, docPendingDelete, mietvertragIndividual, setMietvertragIndividual,
        setPersonIndexPendingDelete, tenantChangeModalOpen, setTenantChangeModalOpen,
        isStartingTenantChange,
        pendingHref, setPendingHref, maintenanceCosts, rentalForm, setRentalForm, costItems,
        historyModalType, setHistoryModalType,
        historyEntries, isGeneratingLetter, isResolvingAdjustment, setDeposit,
        showDocUploadModal, uploadDocType, setUploadDocType, uploadPersonIndex, setUploadPersonIndex,
        uploadDocFile, uploadDocFileName, setUploadDocFileName, selectUploadDocFile,
        docPendingRename, renameValue, setRenameValue, isRenaming,
        // computed
        isArchived: Boolean(archivedTenancyId),
        status, isEditing, landlordMissing, costBreakdownActive, computedTotalCosts,
        effectiveRentReminderDate, effectiveRenovationReminderDate,
        documentRows, mietvertrag, mietvertragRows, mieterbescheinigungRow,
        rentIncreaseLetterRow, renovationLetterRow, documentColumns, documentTableData,
        useCaseMenuItems, canGenerateRentIncreaseLetter, canGenerateRenovationLetter,
        backHref, generatorBase, uploadablePersonOptions, canUploadDocument, documentFilterOptions,
        // handlers
        goTo, confirmDiscard, updatePerson, addPerson, removePerson, handleDeletePersonClick,
        confirmDeletePerson, makePrimary, confirmTenantChange, handleSave, handleViewDocument,
        handleDownloadDocument, confirmDeleteDocument, handleDocSort, handleDocColumnFilterChange,
        refreshDocuments,
        renderDocRow, renderFooterUpload, openDocUploadModal, closeDocUploadModal, handleDocUploadSubmit,
        closeRenameModal, confirmRenameDocument,
        handleGenerateRentIncreaseLetter, handleGenerateRenovationLetter,
        handleAcceptRentAdjustment, handleDeclineRentAdjustment,
        handleAcceptRenovationAdjustment, handleDeclineRenovationAdjustment,
        setDocPendingDelete,
    };
}
