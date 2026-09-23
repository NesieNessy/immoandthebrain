"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createUseCaseMenuItems } from '@/lib/propertyUseCaseMenu';
import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import {
    createCostItem,
    deleteCostItem,
    getCostItemsBySettlement,
    updateCostItem,
} from '@/lib/supabase/service_charge_cost_item.supabase';
import {
    createAllocationKey,
    getAllocationKeysByUnit,
    updateAllocationKey,
} from '@/lib/supabase/service_charge_allocation_key.supabase';
import {
    createSettlement,
    deleteSettlement,
    getPreviousSettlementForUnit,
    getSettlementByPeriod,
    getSettlementSourceDocumentUrl,
    getSettlementsByUnit,
    removeSettlementSourceDocument,
    updateSettlement,
    uploadSettlementSourceDocument,
} from '@/lib/supabase/service_charge_settlement.supabase';
import { getTenanciesByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { addAdjustmentHistoryEntry, getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { deleteTenancyDocument, getTenancyDocumentsByTenancy, getTenancyDocumentUrl, uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { createMaintenanceCosts, getMaintenanceCostsById, updateMaintenanceCosts } from '@/lib/supabase/maintenance_costs.supabase';
import { downloadBlob, formatDeDate } from '@/lib/utils';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { buildAdjustmentDocxBlob } from '@/lib/docx/adjustmentDocx';
import { authFetch } from '@/lib/api/authFetch';
import {
    compareBudgetCoverage,
    compareSettlementCoverage,
    defaultSettlementPeriod,
    isFullCalendarYear,
    isPeriodTooLong,
    monthlyRateAsOf,
    prorateAnnualPrepayment,
    splitByAllocable,
    suggestShareForCostItem,
    type PreviousCostItemInput,
    type SuggestedShare,
} from '@/lib/serviceCharge/settlementMath';
import { mergeExtractedCostItems, type ExtractedSettlementData } from '@/lib/serviceCharge/settlementExtraction';
import type {
    MaintenanceCosts,
    PersonalData,
    Property,
    PropertyUnit,
    ServiceChargeAllocationKey,
    ServiceChargeCostItem,
    ServiceChargeSettlement,
    Tenancy,
    TenancyAdjustmentHistoryEntry,
    TenancyDocument,
    TenancyPerson,
} from '@immoandthebrain/types';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DEFAULT_COST_ITEMS, euro } from '../tenant-data/useTenantUnitData';
import { readFileAsDataUrl, useDocumentReplaceFlow } from '../tenant-data/DocumentGeneratorParts';
import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { serviceChargeStatementHtml } from './serviceChargeStatementLetter';
import { adjustmentLetterHtml } from './adjustmentLetterHtml';

export interface CostItemForm {
    id: number | null;
    label: string;
    allocable: boolean;
    actualAmount: string;
    budgetAmount: string;
    /** Anteil Wohnung for this row — always a manual, independent entry.
     *  Never derived from actualAmount (Gesamt Objekt is the whole
     *  building's cost, not automatically this apartment's share of it).
     *  Empty string means "not entered yet". */
    actualShareOverride: string;
    /** Same as `actualShareOverride`, for the Wirtschaftsplan column. */
    budgetShareOverride: string;
}

function toCostItemForm(item: ServiceChargeCostItem): CostItemForm {
    return {
        id: item.serviceChargeCostItemId,
        label: item.label,
        allocable: item.allocable,
        actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
        budgetAmount: item.budgetAmount != null ? String(item.budgetAmount) : '',
        actualShareOverride: item.actualShareOverride != null ? String(item.actualShareOverride) : '',
        budgetShareOverride: item.budgetShareOverride != null ? String(item.budgetShareOverride) : '',
    };
}

function serializeCostItems(items: CostItemForm[], periodStart: Date | undefined, periodEnd: Date | undefined): string {
    return JSON.stringify({
        periodStart: periodStart?.toISOString() ?? null,
        periodEnd: periodEnd?.toISOString() ?? null,
        items: items.map((i) => ({
            id: i.id, label: i.label, allocable: i.allocable, actualAmount: i.actualAmount, budgetAmount: i.budgetAmount,
            actualShareOverride: i.actualShareOverride, budgetShareOverride: i.budgetShareOverride,
        })),
    });
}

export { euro };

export function useServiceChargeSettlementData(propertyId: string, property: Property, unit: PropertyUnit, hasMultipleUnits: boolean) {
    const router = useRouter();
    const { user } = useRequireAuth();
    const { showToast } = useToast();

    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [settlement, setSettlement] = useState<ServiceChargeSettlement | null>(null);
    const [periodStart, setPeriodStart] = useState<Date | undefined>(undefined);
    const [periodEnd, setPeriodEnd] = useState<Date | undefined>(undefined);
    const [periodMode, setPeriodModeState] = useState<'year' | 'custom'>('year');
    const [costItems, setCostItems] = useState<CostItemForm[]>([]);
    const [deletedCostItemIds, setDeletedCostItemIds] = useState<number[]>([]);
    const [originalSnapshot, setOriginalSnapshot] = useState('');
    const [tenancy, setTenancy] = useState<Tenancy | null>(null);
    const [tenancyPersons, setTenancyPersons] = useState<TenancyPerson[]>([]);
    const [miscRentHistory, setMiscRentHistory] = useState<TenancyAdjustmentHistoryEntry[]>([]);
    const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCosts | null>(null);
    // Wert-vorschlagen inputs — explicit keys persist across periods (fetched
    // by unit, not by settlement); previousCostItems is a label -> row lookup
    // for whichever settlement immediately precedes the one currently loaded.
    const [allocationKeys, setAllocationKeys] = useState<ServiceChargeAllocationKey[]>([]);
    const [previousCostItems, setPreviousCostItems] = useState<Record<string, PreviousCostItemInput>>({});
    const [landlord, setLandlord] = useState<PersonalData | null | undefined>(undefined);
    const [documents, setDocuments] = useState<TenancyDocument[]>([]);
    const [pendingDeleteDoc, setPendingDeleteDoc] = useState<TenancyDocument | null>(null);
    const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
    const [pendingDeleteSettlement, setPendingDeleteSettlement] = useState(false);
    const [isDeletingSettlement, setIsDeletingSettlement] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingSource, setIsUploadingSource] = useState(false);
    const [isExtractingSettlement, setIsExtractingSettlement] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingAdjustmentDocx, setIsGeneratingAdjustmentDocx] = useState(false);
    const [isApplyingPrepayment, setIsApplyingPrepayment] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [previewAdjustmentHtml, setPreviewAdjustmentHtml] = useState<string | null>(null);
    const [isLoadingAdjustmentPreview, setIsLoadingAdjustmentPreview] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Every settlement ever saved for this unit — lets the picker reopen one
    // whose period isn't reachable via the year chevron (a custom range, or
    // a year other than the currently loaded one). Settlements are per unit,
    // not shared across a building, so this must never mix in another
    // unit's settlements.
    const [savedSettlements, setSavedSettlements] = useState<ServiceChargeSettlement[]>([]);
    const refreshSavedSettlements = useCallback(async () => {
        setSavedSettlements(await getSettlementsByUnit(property.propertyId, unit.propertyUnitId));
    }, [property.propertyId, unit.propertyUnitId]);
    useEffect(() => { void refreshSavedSettlements(); }, [refreshSavedSettlements]);

    // `explicitPeriod` set means "load the settlement for exactly this
    // period" (browsing settlement history via the year picker) rather than
    // the initial "most recent settlement" load.
    const load = useCallback(async (explicitPeriod?: { start: Date; end: Date }) => {
        setIsLoading(true);
        setError(null);
        try {
            const { getAggregatedSettlementData } = await import('@/lib/supabase/settlementAggregate.supabase');
            const periodStartParam = explicitPeriod ? format(explicitPeriod.start, 'yyyy-MM-dd') : undefined;
            const periodEndParam = explicitPeriod ? format(explicitPeriod.end, 'yyyy-MM-dd') : undefined;
            const { units: loadedUnits, settlement: currentSettlement, tenancy: currentTenancy, costItems: loadedCostItems } = await getAggregatedSettlementData(property.propertyId, unit.propertyUnitId, periodStartParam, periodEndParam);
            setUnits(loadedUnits);
            setTenancy(currentTenancy);
            setSettlement(currentSettlement);

            const [history, loadedMaintenanceCosts, loadedDocuments, loadedPersons] = await Promise.all([
                currentTenancy ? getAdjustmentHistoryByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
                currentTenancy?.maintenanceCostsId ? getMaintenanceCostsById(currentTenancy.maintenanceCostsId) : Promise.resolve(null),
                currentTenancy ? getTenancyDocumentsByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
                currentTenancy ? getTenancyPersonsByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
            ]);
            setDocuments(loadedDocuments);
            setMiscRentHistory(history.filter((entry) => entry.adjustmentType === 'miscRent'));
            setMaintenanceCosts(loadedMaintenanceCosts);
            setTenancyPersons(loadedPersons);

            const defaultItems = () => DEFAULT_COST_ITEMS.map((item) => ({ id: null, label: item.label, allocable: item.allocable, actualAmount: '', budgetAmount: '', actualShareOverride: '', budgetShareOverride: '' }));

            let resolvedStart: Date;
            let resolvedEnd: Date;

            if (currentSettlement) {
                const start = new Date(currentSettlement.periodStart);
                const end = new Date(currentSettlement.periodEnd);
                resolvedStart = start;
                resolvedEnd = end;
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
                const loadedItems = (loadedCostItems ?? []).map(toCostItemForm);
                // The settlement row can exist with no saved cost items yet (e.g.
                // it was created just by uploading a source document, before any
                // amounts were entered/saved) — the table must still show the
                // full standard BetrKV list to fill in, not an empty table.
                const items = loadedItems.length > 0 ? loadedItems : defaultItems();
                setCostItems(items);
                // Snapshotting whatever was actually just loaded (including the
                // default template when there are no saved items yet) — not an
                // empty string — so isEditing correctly stays false until the
                // user changes something, instead of an untouched page being
                // permanently "dirty" (previously: navigating away via the
                // breadcrumb always showed the discard-confirmation dialog,
                // even with nothing edited).
                setOriginalSnapshot(serializeCostItems(items, start, end));
            } else if (explicitPeriod) {
                // Navigated (via the year picker) to a period that has no
                // saved settlement yet — start a fresh draft for exactly
                // that period rather than falling back to the "brand new
                // settlement" defaulting logic below.
                resolvedStart = explicitPeriod.start;
                resolvedEnd = explicitPeriod.end;
                setPeriodStart(explicitPeriod.start);
                setPeriodEnd(explicitPeriod.end);
                setPeriodModeState(isFullCalendarYear(explicitPeriod.start, explicitPeriod.end) ? 'year' : 'custom');
                const items = defaultItems();
                setCostItems(items);
                setOriginalSnapshot(serializeCostItems(items, explicitPeriod.start, explicitPeriod.end));
            } else {
                // Default the period to the tenant's Mietauszug date when
                // there is one — a settlement for a moved-out tenant almost
                // always needs to end there, not run through Dec 31.
                const moveOutDate = currentTenancy?.tenancyEndDate ? new Date(currentTenancy.tenancyEndDate) : null;
                const { start, end } = defaultSettlementPeriod(moveOutDate, new Date().getFullYear());
                resolvedStart = start;
                resolvedEnd = end;
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
                const items = defaultItems();
                setCostItems(items);
                setOriginalSnapshot(serializeCostItems(items, start, end));
            }
            setDeletedCostItemIds([]);

            // Wert-vorschlagen inputs: the explicit allocation keys for this
            // unit (stable across periods), and a label -> row lookup of
            // whichever settlement immediately precedes the one just resolved
            // above (the "previous period" a ratio can be learned from).
            const [loadedAllocationKeys, previousSettlement] = await Promise.all([
                getAllocationKeysByUnit(property.propertyId, unit.propertyUnitId),
                getPreviousSettlementForUnit(property.propertyId, unit.propertyUnitId, format(resolvedStart, 'yyyy-MM-dd')),
            ]);
            setAllocationKeys(loadedAllocationKeys);
            const previousItems = previousSettlement
                ? await getCostItemsBySettlement(previousSettlement.serviceChargeSettlementId)
                : [];
            setPreviousCostItems(Object.fromEntries(
                previousItems
                    .filter((item) => item.label.trim() !== '')
                    .map((item) => [item.label.trim().toLowerCase(), {
                        label: item.label,
                        actualAmount: item.actualAmount,
                        actualShareOverride: item.actualShareOverride,
                    }]),
            ));
        } catch {
            setError('Die Nebenkostenabrechnung konnte nicht geladen werden.');
        } finally {
            setIsLoading(false);
        }
    }, [property.propertyId, unit.propertyUnitId]);

    useEffect(() => { void load(); }, [load]);

    // ── Browsing a different billing period (per-period settlement history) ──
    // Navigating years must never discard an unsaved edit silently — guard
    // it the same way PropertyData.tsx guards route navigation. (Defined
    // after `isEditing` below, which it closes over.)
    const [pendingPeriod, setPendingPeriod] = useState<{ start: Date; end: Date } | null>(null);
    // Leaving the page entirely (breadcrumbs, "Zurück", the use-case menu)
    // must be guarded the same way — separate from pendingPeriod above,
    // which only covers switching years/periods within this same page.
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        getPersonalData(user.id).then((data) => { if (!cancelled) setLandlord(data ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    // Every tenancy this unit has ever had — backs the "Mietzeitraum
    // übernehmen" menu below, so a landlord can pick a *past* tenant's
    // period (not just the current one) when composing a settlement.
    const [unitTenancies, setUnitTenancies] = useState<Tenancy[]>([]);
    useEffect(() => {
        let cancelled = false;
        getTenanciesByUnit(unit.propertyUnitId).then((rows) => { if (!cancelled) setUnitTenancies(rows); });
        return () => { cancelled = true; };
    }, [unit.propertyUnitId]);

    // Purely a snapshot comparison now — originalSnapshot is always set to
    // whatever was actually just loaded (a saved settlement's items, or the
    // default template for a fresh/unsaved period), so this correctly stays
    // false until the user changes something. It must NOT also force true
    // whenever `settlement` is null: a fresh, untouched draft period has no
    // settlement yet by definition, but that alone was making every such
    // page permanently "dirty" — spuriously popping the discard-confirmation
    // dialog on every navigation attempt and leaving "Abrechnung speichern"
    // enabled with nothing to save.
    const isEditing = serializeCostItems(costItems, periodStart, periodEnd) !== originalSnapshot;

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
    const cancelDiscard = () => setPendingHref(null);

    const useCaseMenuItems = createUseCaseMenuItems(propertyId, 'ServiceChargeSettlement', (route) => goTo(route));

    // ── Abrechnungszeitraum: whole calendar year vs. a shorter custom range ──
    const setPeriodMode = (mode: 'year' | 'custom') => {
        setPeriodModeState(mode);
        if (mode === 'year') {
            const year = periodEnd?.getFullYear() ?? periodStart?.getFullYear() ?? new Date().getFullYear();
            setPeriodStart(new Date(year, 0, 1));
            setPeriodEnd(new Date(year, 11, 31));
        }
    };

    const applyTenancyPeriodSuggestion = (suggestion: { startDateStr: string; endDateStr: string }) => {
        setPeriodStart(new Date(suggestion.startDateStr));
        setPeriodEnd(new Date(suggestion.endDateStr));
    };
    // Navigating to a different year means "load that year's settlement" —
    // guarded the same way PropertyData.tsx guards route navigation away
    // from an unsaved edit, since this replaces periodStart/periodEnd,
    // costItems and settlement wholesale (see `load`'s explicitPeriod branch).
    const switchToPeriod = (start: Date, end: Date) => {
        if (isEditing) {
            setPendingPeriod({ start, end });
        } else {
            void load({ start, end });
        }
    };
    const confirmPeriodSwitch = () => {
        if (pendingPeriod) void load(pendingPeriod);
        setPendingPeriod(null);
    };
    const cancelPeriodSwitch = () => setPendingPeriod(null);

    const setSettlementYear = (year: number) => {
        switchToPeriod(new Date(year, 0, 1), new Date(year, 11, 31));
    };

    // ── Allocation & summary math ───────────────────────────────────────────
    const totalArea = useMemo(() => units.reduce((sum, u) => sum + (u.livingAreaM2 ?? 0), 0), [units]);
    const unitShare = unit.livingAreaM2 && totalArea > 0 ? unit.livingAreaM2 / totalArea : 0;

    // "Total share" (Gesamt Objekt) / "Apartment share" (Anteil Wohnung), split
    // into apportionable and non-apportionable per the table.
    const actualSplit = useMemo(
        () => splitByAllocable(costItems.map((item) => ({ amount: Number(item.actualAmount) || 0, allocable: item.allocable }))),
        [costItems],
    );
    const budgetSplit = useMemo(
        () => splitByAllocable(costItems.map((item) => ({ amount: Number(item.budgetAmount) || 0, allocable: item.allocable }))),
        [costItems],
    );
    const totalActualAllocable = actualSplit.allocable;
    const totalBudgetAllocable = budgetSplit.allocable;

    // Per-row Anteil Wohnung: always a manual entry. This must NOT be derived
    // from actualAmount/budgetAmount (Gesamt Objekt) — the total cost of the
    // whole property never automatically equals, or proportionally implies,
    // a specific apartment's share of it, so there is no automatic fallback
    // here to compute or fall back to.
    const actualShareForItem = useCallback((item: CostItemForm): number | null => {
        if (!item.allocable || item.actualShareOverride === '') return null;
        return Number(item.actualShareOverride) || 0;
    }, []);
    const budgetShareForItem = useCallback((item: CostItemForm): number | null => {
        if (!item.allocable || item.budgetShareOverride === '') return null;
        return Number(item.budgetShareOverride) || 0;
    }, []);

    // (1) Apartment share: sum of allocable actual cost items for this unit.
    const unitActualShare = useMemo(
        () => costItems.reduce((sum, item) => sum + (actualShareForItem(item) ?? 0), 0),
        [costItems, actualShareForItem],
    );
    // (3) Budget plan: sum of allocable budgeted cost items for this unit, for the following year.
    const unitBudgetShare = useMemo(
        () => costItems.reduce((sum, item) => sum + (budgetShareForItem(item) ?? 0), 0),
        [costItems, budgetShareForItem],
    );
    // Anteil Wohnung of the NICHT umlagefähig rows — kept separate from
    // unitActualShare/unitBudgetShare above (which must only ever include
    // allocable items, since those feed the Nachzahlung/Guthaben math), but
    // still summed for display: the landlord can enter a value here too
    // (e.g. for their own recordkeeping), and the footer must show that
    // total instead of a "–" that would hide real, already-entered numbers.
    const unitActualShareNonAllocable = useMemo(
        () => costItems.reduce((sum, item) => sum + (!item.allocable && item.actualShareOverride !== '' ? Number(item.actualShareOverride) || 0 : 0), 0),
        [costItems],
    );
    const unitBudgetShareNonAllocable = useMemo(
        () => costItems.reduce((sum, item) => sum + (!item.allocable && item.budgetShareOverride !== '' ? Number(item.budgetShareOverride) || 0 : 0), 0),
        [costItems],
    );

    const currentMonthlyPrepayment = tenancy?.miscRent ?? 0;

    // "Wert vorschlagen" must never rely on a single ratio applied to every
    // cost item — different items legitimately use different Verteilerschlüssel
    // (ownership share, consumption, unit count, ...), so the ratio has to be
    // derived per cost item label instead (see suggestShareForCostItem):
    // an explicit, landlord-entered allocation key first, else the ratio
    // implied by this same unit's own previous settlement for that label,
    // else no suggestion at all. allocationKeys and previousCostItems are
    // fetched once in `load` below and looked up per row from here.
    // (2) Annual total from the tenant's NK-Vorauszahlung, prorated for any
    // miscRent change that took effect during the settlement period, and
    // clipped to the days the tenant actually occupied the unit — a
    // settlement period that starts before the tenancy did (or extends past
    // a move-out) must not charge/credit prepayment for months nobody was
    // renting the unit.
    const annualPrepayment = useMemo(() => {
        if (!periodStart || !periodEnd) return currentMonthlyPrepayment * 12;
        const history = miscRentHistory
            .filter((entry): entry is TenancyAdjustmentHistoryEntry & { effectiveDate: string; amount: number } => entry.effectiveDate != null && entry.amount != null)
            .map((entry) => ({ effectiveDate: entry.effectiveDate, amount: entry.amount }));
        const tenancyStart = tenancy?.tenancyStartDate ? new Date(tenancy.tenancyStartDate) : null;
        const tenancyEnd = tenancy?.tenancyEndDate ? new Date(tenancy.tenancyEndDate) : null;
        return prorateAnnualPrepayment(currentMonthlyPrepayment, history, periodStart, periodEnd, tenancyStart, tenancyEnd);
    }, [currentMonthlyPrepayment, miscRentHistory, periodStart, periodEnd, tenancy?.tenancyStartDate, tenancy?.tenancyEndDate]);

    // The monthly rate this settlement was actually billed at — frozen to
    // periodEnd, so applying a new rate for *next* year (handleApplyPrepayment,
    // effective the following Jan 1) never pulls this figure along with it.
    // Shown as "NK-Vorauszahlung bis zur Abrechnung"; unlike currentMonthlyPrepayment
    // (the live, actionable rate the "übernehmen" button acts on), this one
    // must never change once a settlement period is loaded.
    const prepaymentUntilSettlement = useMemo(() => {
        if (!periodEnd) return currentMonthlyPrepayment;
        const history = miscRentHistory
            .filter((entry): entry is TenancyAdjustmentHistoryEntry & { effectiveDate: string; amount: number } => entry.effectiveDate != null && entry.amount != null)
            .map((entry) => ({ effectiveDate: entry.effectiveDate, amount: entry.amount }));
        return monthlyRateAsOf(currentMonthlyPrepayment, history, periodEnd);
    }, [currentMonthlyPrepayment, miscRentHistory, periodEnd]);

    // (1) vs (2): shortfall = "Nachzahlung durch Mieter", surplus = "Guthaben des Mieters".
    const settlementCoverage = compareSettlementCoverage(unitActualShare, annualPrepayment);
    const overUnderCoverage = unitActualShare - annualPrepayment;

    // (2) vs (3): shortfall = prepayment too low (increase), surplus = prepayment too high (decrease).
    const budgetCoverage = compareBudgetCoverage(annualPrepayment, unitBudgetShare);
    // Same comparison as overUnderCoverage, but against next year's *budgeted*
    // share instead of the actual settlement — an annual € figure, so it's
    // the correct like-for-like counterpart to overUnderCoverage rather than
    // prepaymentDelta (a monthly rate change, not directly comparable).
    const budgetOverUnderCoverage = unitBudgetShare - annualPrepayment;

    // Budget plan (3) divided by 12, compared against the current monthly NK-Vorauszahlung.
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.round((unitBudgetShare / 12) * 100) / 100 : null;
    // Drives the "übernehmen" button: compared against the LIVE tenancy rate,
    // since that's the value the button actually writes to (a no-op, and
    // therefore disabled, once they already match).
    const prepaymentDelta = newMonthlyPrepayment != null ? newMonthlyPrepayment - currentMonthlyPrepayment : null;
    // Drives the two "Bisherige"/"Neue" cards' own prominent difference
    // display instead — computed against prepaymentUntilSettlement (the
    // frozen, as-billed rate those two cards actually show), not against
    // currentMonthlyPrepayment. The two can differ: if some other change
    // already took effect between this settlement's periodEnd and today,
    // prepaymentDelta (vs. live) and this (vs. what's on screen) tell
    // different, both-correct stories, and the display must match what the
    // user can actually see and compare, not the button's own live target.
    const displayedPrepaymentDelta = newMonthlyPrepayment != null ? Math.round((newMonthlyPrepayment - prepaymentUntilSettlement) * 100) / 100 : null;
    const displayedPrepaymentDeltaPercent = displayedPrepaymentDelta != null && prepaymentUntilSettlement > 0
        ? Math.round((displayedPrepaymentDelta / prepaymentUntilSettlement) * 1000) / 10
        : null;
    const newTotalRent = (tenancy?.coldRent ?? 0) + (newMonthlyPrepayment ?? currentMonthlyPrepayment) + (tenancy?.parkingSpaceRent ?? 0);
    // The new rate takes effect the day after this settlement's own period
    // ends — not always Jan 1, since a settlement can cover a custom
    // ("Individueller Zeitraum") period that ends anywhere.
    const nextPrepaymentEffectiveDate = periodEnd
        ? new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1)
        : new Date(new Date().getFullYear() + 1, 0, 1);

    const settlementYear = periodEnd ? periodEnd.getFullYear() : new Date().getFullYear();

    // Individueller Zeitraum's most common real use case is a final/partial
    // settlement bounded to exactly how long a given tenant lived there
    // DURING the year currently being viewed — surfaced as one-click
    // starting points (one per tenant this unit has ever had, not just the
    // current one — a landlord composing a settlement for a past tenant
    // needs their period, not whoever rents the unit today) instead of
    // leaving Von/Bis blank to type in by hand. Never applied automatically;
    // only ever offered. Each is clipped to [settlementYear Jan 1,
    // settlementYear Dec 31] rather than that tenancy's raw start/end: a
    // long-standing tenant who moved in years ago must not turn into a
    // multi-year "settlement" spanning their entire tenancy —
    // Nebenkostenabrechnung is always a single calendar year (or the
    // partial year of an actual move-in/move-out within it).
    const tenancyPeriodSuggestions = unitTenancies
        .map((t) => {
            if (!t.tenancyStartDate) return null;
            const yearStart = new Date(settlementYear, 0, 1);
            const yearEnd = new Date(settlementYear, 11, 31);
            const tenancyStart = new Date(t.tenancyStartDate);
            const tenancyEnd = t.tenancyEndDate ? new Date(t.tenancyEndDate) : null;
            const suggestedStart = tenancyStart > yearStart ? tenancyStart : yearStart;
            const suggestedEnd = tenancyEnd && tenancyEnd < yearEnd ? tenancyEnd : yearEnd;
            if (suggestedEnd < suggestedStart) return null; // doesn't overlap this year at all
            return {
                tenancyId: t.tenancyId,
                label: `${t.tenantFirstName ?? ''} ${t.tenantLastName ?? ''}`.trim() || 'Mieter',
                startDateStr: format(suggestedStart, 'yyyy-MM-dd'),
                endDateStr: format(suggestedEnd, 'yyyy-MM-dd'),
            };
        })
        .filter((s): s is { tenancyId: number; label: string; startDateStr: string; endDateStr: string } => s != null)
        // Most relevant (current/most recently started) tenant first.
        .sort((a, b) => b.startDateStr.localeCompare(a.startDateStr));

    // Shown as the avatar+name on the document box rows — same tenant(s) the
    // generated Nebenkostenabrechnung/Anpassungsschreiben actually goes to.
    // A tenancy can have more than one current tenant (a couple, roommates)
    // recorded as separate tenancy_person rows — this must show all of them,
    // not just tenancy.tenantFirstName/tenantLastName (the single primary
    // tenant denormalized onto the tenancy row itself), or the document
    // recipient shown here silently drops every non-primary tenant.
    const tenantPersonNames = tenancyPersons
        .filter((p) => (p.lastName ?? '').trim() !== '' || (p.firstName ?? '').trim() !== '')
        .map((p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim());
    const tenantLabel = tenantPersonNames.length > 0
        ? tenantPersonNames.join(' und ')
        : tenancy ? `${tenancy.tenantFirstName ?? ''} ${tenancy.tenantLastName ?? ''}`.trim() || 'Mieter' : undefined;

    // ── Cost item editing ────────────────────────────────────────────────────
    const updateCostItemField = (index: number, patch: Partial<CostItemForm>) => {
        setCostItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    const addCostItem = () => {
        setCostItems((prev) => [...prev, { id: null, label: '', allocable: true, actualAmount: '', budgetAmount: '', actualShareOverride: '', budgetShareOverride: '' }]);
    };

    const removeCostItem = (index: number) => {
        setCostItems((prev) => {
            const item = prev[index];
            if (item?.id != null) setDeletedCostItemIds((ids) => [...ids, item.id!]);
            return prev.filter((_, i) => i !== index);
        });
    };

    // Opt-in "Wert vorschlagen" — never runs on its own (e.g. when
    // actualAmount/budgetAmount changes, or on load) and never overwrites a
    // value the landlord already entered or previously accepted. The ratio
    // itself is per cost item label (see suggestShareForCostItem): an
    // explicit allocation key first, else a learned ratio for that label,
    // else no suggestion — "Allocable" never enters the decision, it only
    // governs what's later charged to the tenant, not what a landlord's own
    // share of a cost item is.
    //
    // The "learned ratio" source differs by column: Wirtschaftsplan (budget)
    // is next year's projection for THIS SAME settlement, so this settlement's
    // own already-filled Abrechnung (actual) side for that label is the most
    // relevant, most recent ratio available — checked before falling back to
    // a genuinely earlier settlement. Abrechnung (actual) itself has no such
    // same-settlement fallback (there's nothing more recent than "now" to
    // learn from) and only ever looks at a truly previous settlement.
    const historyCandidatesFor = useCallback((item: CostItemForm, column: 'actual' | 'budget'): PreviousCostItemInput[] => {
        const sameSettlementActual: PreviousCostItemInput[] = column === 'budget' && item.actualAmount !== '' && item.actualShareOverride !== ''
            ? [{ label: item.label, actualAmount: Number(item.actualAmount) || 0, actualShareOverride: Number(item.actualShareOverride) || 0 }]
            : [];
        return [...sameSettlementActual, ...Object.values(previousCostItems)];
    }, [previousCostItems]);

    const computeSuggestion = useCallback((index: number, column: 'actual' | 'budget'): SuggestedShare | null => {
        const item = costItems[index];
        if (!item) return null;
        const amount = column === 'actual' ? item.actualAmount : item.budgetAmount;
        if (amount === '') return null;
        return suggestShareForCostItem(Number(amount) || 0, item.label, allocationKeys, historyCandidatesFor(item, column));
    }, [costItems, allocationKeys, historyCandidatesFor]);

    // Each icon only touches its own column (Abrechnung vs. Wirtschaftsplan)
    // — clicking one must never also change the already-reviewed value in
    // the same row's other column. Always overwrites whatever was there
    // before in that one field (an explicit per-row click is the landlord
    // asking for a fresh number); the bulk action below is the "don't
    // overwrite" one.
    const applySuggestion = useCallback((index: number, column: 'actual' | 'budget') => {
        const suggestion = computeSuggestion(index, column);
        if (!suggestion) return;
        setCostItems((prev) => prev.map((it, i) => (i === index
            ? { ...it, ...(column === 'actual' ? { actualShareOverride: String(suggestion.value) } : { budgetShareOverride: String(suggestion.value) }) }
            : it)));
    }, [computeSuggestion]);

    // Bulk version — fills in every row's Anteil Wohnung at once, but
    // (unlike the per-row buttons) only where it's still empty, and only
    // where a suggestion actually exists; a row with neither an explicit
    // key nor a usable prior-period ratio is left empty rather than
    // fabricating a number.
    const suggestAllShares = useCallback(() => {
        setCostItems((prev) => prev.map((item) => {
            const actualSuggestion = item.actualShareOverride === '' && item.actualAmount !== ''
                ? suggestShareForCostItem(Number(item.actualAmount) || 0, item.label, allocationKeys, historyCandidatesFor(item, 'actual'))
                : null;
            const budgetSuggestion = item.budgetShareOverride === '' && item.budgetAmount !== ''
                ? suggestShareForCostItem(Number(item.budgetAmount) || 0, item.label, allocationKeys, historyCandidatesFor(item, 'budget'))
                : null;
            return {
                ...item,
                actualShareOverride: actualSuggestion ? String(actualSuggestion.value) : item.actualShareOverride,
                budgetShareOverride: budgetSuggestion ? String(budgetSuggestion.value) : item.budgetShareOverride,
            };
        }));
    }, [allocationKeys, historyCandidatesFor]);

    // Persists (creates or updates) an explicit Verteilerschlüssel for one
    // cost item label on this unit — the landlord setting it once so future
    // suggestions for that label never again depend on prior-period history
    // existing at all.
    const saveAllocationKey = async (label: string, numerator: number, denominator: number, allocationType: string | null): Promise<void> => {
        const normalizedLabel = label.trim();
        if (!normalizedLabel || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return;
        const existing = allocationKeys.find((k) => k.label.trim().toLowerCase() === normalizedLabel.toLowerCase());
        const saved = existing
            ? await updateAllocationKey(existing.serviceChargeAllocationKeyId, { numerator, denominator, allocationType })
            : await createAllocationKey({ propertyUnitId: unit.propertyUnitId, propertyId: property.propertyId, label: normalizedLabel, numerator, denominator, allocationType });
        if (!saved) return;
        setAllocationKeys((prev) => (existing ? prev.map((k) => (k.serviceChargeAllocationKeyId === saved.serviceChargeAllocationKeyId ? saved : k)) : [...prev, saved]));
    };

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const currentYear = new Date().getFullYear();
            const resolvedPeriodStart = periodStart ?? new Date(currentYear, 0, 1);
            const resolvedPeriodEnd = periodEnd ?? new Date(currentYear, 11, 31);
            const periodStartStr = format(resolvedPeriodStart, 'yyyy-MM-dd');
            const periodEndStr = format(resolvedPeriodEnd, 'yyyy-MM-dd');
            if (periodEndStr <= periodStartStr) throw new Error('INVALID_PERIOD');
            if (isPeriodTooLong(resolvedPeriodStart, resolvedPeriodEnd)) throw new Error('PERIOD_TOO_LONG');

            // Anteil Wohnung is a single apartment's slice of Gesamtobjekt
            // (the whole property's cost for that line) — it can never
            // legitimately exceed it, so a value that does is always a typo
            // (e.g. mixing up which column to type into), not a real figure.
            // Checked per row, per column, since the two sides (Abrechnung /
            // Wirtschaftsplan) are independent entries.
            const oversizedShareItem = costItems.find((item) =>
                (item.actualAmount !== '' && item.actualShareOverride !== '' && Number(item.actualShareOverride) > Number(item.actualAmount))
                || (item.budgetAmount !== '' && item.budgetShareOverride !== '' && Number(item.budgetShareOverride) > Number(item.budgetAmount)),
            );
            if (oversizedShareItem) {
                const column = oversizedShareItem.actualAmount !== '' && oversizedShareItem.actualShareOverride !== '' && Number(oversizedShareItem.actualShareOverride) > Number(oversizedShareItem.actualAmount)
                    ? 'Abrechnung'
                    : 'Wirtschaftsplan';
                throw new Error(`SHARE_EXCEEDS_TOTAL|${oversizedShareItem.label || 'einer Kostenposition'}|${column}`);
            }

            // Gesamtobjekt and Anteil Wohnung form a pair, per column — one
            // filled without the other is always an incomplete entry (either
            // a total with no apartment share allocated yet, or a share with
            // nothing behind it), never something that should silently save.
            const incompletePairItem = costItems.find((item) =>
                (item.actualAmount !== '') !== (item.actualShareOverride !== '')
                || (item.budgetAmount !== '') !== (item.budgetShareOverride !== ''),
            );
            if (incompletePairItem) {
                const column = (incompletePairItem.actualAmount !== '') !== (incompletePairItem.actualShareOverride !== '')
                    ? 'Abrechnung'
                    : 'Wirtschaftsplan';
                throw new Error(`SHARE_INCOMPLETE_PAIR|${incompletePairItem.label || 'einer Kostenposition'}|${column}`);
            }

            let activeSettlement = settlement;
            // Once true, `activeSettlement` is a settlement row that didn't
            // exist when this edit session started — none of the current
            // cost-item rows' ids belong to it (they're either unset, or
            // still carry ids from whatever settlement/period was loaded
            // before), so every item must be (re)created there, and
            // deletedCostItemIds — which target that OTHER settlement — must
            // not be applied to this one.
            let isNewSettlementForThisSave = false;

            if (!activeSettlement) {
                activeSettlement = await createSettlement({
                    propertyId: property.propertyId,
                    propertyUnitId: unit.propertyUnitId,
                    periodStart: periodStartStr,
                    periodEnd: periodEndStr,
                    sourceDocumentName: null,
                    sourceDocumentPath: null,
                });
                if (!activeSettlement) throw new Error('Konnte Abrechnung nicht anlegen.');
                setSettlement(activeSettlement);
                isNewSettlementForThisSave = true;
            } else if (
                // activeSettlement.periodStart/periodEnd come back from the API
                // as full ISO datetime strings (pg parses a DATE column into a
                // JS Date, which JSON.stringify renders as e.g.
                // "2026-01-01T00:00:00.000Z"), never as a bare "yyyy-MM-dd" —
                // comparing them against periodStartStr/periodEndStr directly
                // always mismatched, so saving an *unchanged* existing
                // settlement always took this "period changed" branch and hit
                // itself as a PERIOD_CONFLICT, blocking every edit. Both sides
                // must go through the same Date -> 'yyyy-MM-dd' formatting
                // before comparing.
                format(new Date(activeSettlement.periodStart), 'yyyy-MM-dd') !== periodStartStr
                || format(new Date(activeSettlement.periodEnd), 'yyyy-MM-dd') !== periodEndStr
            ) {
                // The period was changed away from the settlement that's
                // loaded. That settlement is a distinct billing period with
                // its own saved history and must not be overwritten by
                // renaming its period (the old bug) — instead, this edit
                // belongs to a settlement for the *new* target period.
                // Check whether one already exists there first, since
                // blindly creating could duplicate it.
                const conflict = await getSettlementByPeriod(property.propertyId, unit.propertyUnitId, periodStartStr, periodEndStr);
                if (conflict) throw new Error('PERIOD_CONFLICT');
                const created = await createSettlement({
                    propertyId: property.propertyId,
                    propertyUnitId: unit.propertyUnitId,
                    periodStart: periodStartStr,
                    periodEnd: periodEndStr,
                    sourceDocumentName: null,
                    sourceDocumentPath: null,
                });
                if (!created) throw new Error('createSettlement failed');
                activeSettlement = created;
                setSettlement(created);
                isNewSettlementForThisSave = true;
            }

            const deleteResults = isNewSettlementForThisSave
                ? []
                : await Promise.all(deletedCostItemIds.map((id) => deleteCostItem(id)));
            if (deleteResults.some((ok) => !ok)) throw new Error('deleteCostItem failed');

            const savedItems: CostItemForm[] = [];
            for (let index = 0; index < costItems.length; index++) {
                const item = costItems[index];
                const payload = {
                    serviceChargeSettlementId: activeSettlement.serviceChargeSettlementId,
                    propertyId: property.propertyId,
                    sortOrder: index,
                    label: item.label,
                    allocable: item.allocable,
                    actualAmount: item.actualAmount === '' ? null : Number(item.actualAmount),
                    budgetAmount: item.budgetAmount === '' ? null : Number(item.budgetAmount),
                    actualShareOverride: item.actualShareOverride === '' ? null : Number(item.actualShareOverride),
                    budgetShareOverride: item.budgetShareOverride === '' ? null : Number(item.budgetShareOverride),
                };
                if (item.id != null && !isNewSettlementForThisSave) {
                    const updated = await updateCostItem(item.id, payload);
                    if (!updated) throw new Error('updateCostItem failed');
                    savedItems.push(toCostItemForm(updated));
                } else {
                    const created = await createCostItem(payload);
                    if (!created) throw new Error('createCostItem failed');
                    savedItems.push(toCostItemForm(created));
                }
            }
            setCostItems(savedItems);
            setDeletedCostItemIds([]);
            setOriginalSnapshot(serializeCostItems(savedItems, periodStart, periodEnd));
            if (isNewSettlementForThisSave) void refreshSavedSettlements();
            showToast('Nebenkostenabrechnung gespeichert.', 'success');
        } catch (err) {
            const code = err instanceof Error ? err.message : null;
            const [errorKey, shareLabel, shareColumn] = code?.split('|') ?? [];
            setError(
                errorKey === 'PERIOD_CONFLICT'
                    ? 'Für diesen Zeitraum existiert bereits eine gespeicherte Abrechnung. Bitte über „Gespeicherte Abrechnungen" dorthin wechseln, um sie zu bearbeiten.'
                    : errorKey === 'INVALID_PERIOD'
                        ? 'Die Nebenkostenabrechnung konnte nicht gespeichert werden: Das Enddatum liegt vor dem Startdatum.'
                        : errorKey === 'PERIOD_TOO_LONG'
                            ? 'Die Nebenkostenabrechnung konnte nicht gespeichert werden: Der Abrechnungszeitraum darf maximal 12 Monate umfassen (§ 556 Abs. 3 BGB).'
                            : errorKey === 'SHARE_EXCEEDS_TOTAL'
                                ? `Die Nebenkostenabrechnung konnte nicht gespeichert werden: Anteil Wohnung bei „${shareLabel}" (${shareColumn}) ist höher als der Gesamtobjekt-Betrag.`
                                : errorKey === 'SHARE_INCOMPLETE_PAIR'
                                    ? `Die Nebenkostenabrechnung konnte nicht gespeichert werden: Bei „${shareLabel}" (${shareColumn}) fehlt entweder der Gesamtobjekt-Betrag oder der Anteil Wohnung — bitte beide Felder ausfüllen oder beide leer lassen.`
                                    : 'Die Nebenkostenabrechnung konnte nicht gespeichert werden.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    // ── Delete a saved settlement ────────────────────────────────────────────
    // Deletes the settlement currently loaded (browse to any saved period via
    // "Gespeicherte Abrechnungen" first, then delete that one) — its cost
    // items cascade-delete with it at the DB level (ON DELETE CASCADE).
    const requestDeleteSettlement = () => setPendingDeleteSettlement(true);
    const cancelDeleteSettlement = () => setPendingDeleteSettlement(false);
    const confirmDeleteSettlement = async () => {
        if (!settlement) return;
        setIsDeletingSettlement(true);
        setError(null);
        try {
            const ok = await deleteSettlement(settlement.serviceChargeSettlementId);
            if (!ok) throw new Error('deleteSettlement failed');
            setPendingDeleteSettlement(false);
            showToast('Nebenkostenabrechnung gelöscht.', 'success');
            await refreshSavedSettlements();
            await load();
        } catch {
            setError('Die Nebenkostenabrechnung konnte nicht gelöscht werden.');
        } finally {
            setIsDeletingSettlement(false);
        }
    };

    // ── Apply new NK-Vorauszahlung ──────────────────────────────────────────
    // Commits the recommended monthly prepayment (budget plan / 12) to the
    // tenancy, logs it to the adjustment history so future settlements can
    // prorate for the change, and writes the apportionable/non-apportionable
    // split of the budget plan into the tenancy's maintenance_costs record.
    const canApplyPrepayment = tenancy != null && newMonthlyPrepayment != null && prepaymentDelta !== 0;

    const handleApplyPrepayment = async () => {
        if (!tenancy || newMonthlyPrepayment == null || prepaymentDelta == null) return;
        setIsApplyingPrepayment(true);
        setError(null);
        try {
            // warmRent is persisted (not just derived on the fly) because the
            // generated Mietvertrag document reads tenancy.warmRent directly —
            // without updating it here it would still show the old total rent
            // after applying a new NK-Vorauszahlung.
            const newWarmRent = Math.round(((tenancy.coldRent ?? 0) + newMonthlyPrepayment + (tenancy.parkingSpaceRent ?? 0)) * 100) / 100;
            const updatedTenancy = await updateTenancy(tenancy.tenancyId, { miscRent: newMonthlyPrepayment, warmRent: newWarmRent });
            if (!updatedTenancy) throw new Error('updateTenancy failed');
            setTenancy(updatedTenancy);

            const effectiveDate = format(nextPrepaymentEffectiveDate, 'yyyy-MM-dd');
            const historyEntry = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'miscRent',
                effectiveDate,
                amount: prepaymentDelta,
                note: 'NK-Vorauszahlung aus Nebenkostenabrechnung übernommen',
            });
            if (!historyEntry) throw new Error('addAdjustmentHistoryEntry failed');
            setMiscRentHistory((prev) => [historyEntry, ...prev]);

            // This maintenance_costs record is displayed as *this tenant's own*
            // Nebenkosten breakdown (see "Nebenkosten" on the Vertragsdaten
            // page, whose "Detailerfassung" button links back to this exact
            // settlement) — it must hold the unit's share, not the whole
            // building's totals, or a multi-unit property would show every
            // tenant the full building's costs instead of their own portion.
            const nonAllocableShare = Math.round(budgetSplit.nonAllocable * unitShare * 100) / 100;
            const mcPayload = {
                costBreakdown: true,
                allocableCosts: unitBudgetShare,
                nonAllocableCosts: nonAllocableShare,
                totalCosts: Math.round((unitBudgetShare + nonAllocableShare) * 100) / 100,
                allocableCostsProjection: true,
                nonAllocableCostsProjection: true,
                totalCostsProjection: true,
                costItems: costItems.map((item, index) => ({
                    id: item.id != null ? String(item.id) : `new-${index}`,
                    label: item.label,
                    amount: item.allocable
                        ? (budgetShareForItem(item) ?? 0)
                        : Math.round((Number(item.budgetAmount) || 0) * unitShare * 100) / 100,
                    allocable: item.allocable,
                })),
            };
            if (maintenanceCosts) {
                const updatedCosts = await updateMaintenanceCosts(maintenanceCosts.maintenanceCostsId, mcPayload);
                if (!updatedCosts) throw new Error('updateMaintenanceCosts failed');
                setMaintenanceCosts(updatedCosts);
            } else {
                const createdCosts = await createMaintenanceCosts({ propertyId: property.propertyId, houseMoney: null, ...mcPayload });
                if (!createdCosts) throw new Error('createMaintenanceCosts failed');
                setMaintenanceCosts(createdCosts);
                const tenancyWithCosts = await updateTenancy(tenancy.tenancyId, { maintenanceCostsId: createdCosts.maintenanceCostsId });
                if (!tenancyWithCosts) throw new Error('updateTenancy failed');
                setTenancy(tenancyWithCosts);
            }

            showToast('Neue NK-Vorauszahlung übernommen.', 'success');
        } catch {
            setError('Die NK-Vorauszahlung konnte nicht übernommen werden.');
        } finally {
            setIsApplyingPrepayment(false);
        }
    };

    // ── Source document upload ──────────────────────────────────────────────
    // Upload is the primary entry point on a fresh settlement, so it can't
    // wait for an explicit "Speichern" (save) first — it lazily creates the
    // settlement row (with the current/default period) the same way Save
    // does, just without touching the period fields.
    const ensureSettlement = async (): Promise<ServiceChargeSettlement | null> => {
        if (settlement) return settlement;
        const currentYear = new Date().getFullYear();
        const created = await createSettlement({
            propertyId: property.propertyId,
            propertyUnitId: unit.propertyUnitId,
            periodStart: periodStart ? format(periodStart, 'yyyy-MM-dd') : format(new Date(currentYear, 0, 1), 'yyyy-MM-dd'),
            periodEnd: periodEnd ? format(periodEnd, 'yyyy-MM-dd') : format(new Date(currentYear, 11, 31), 'yyyy-MM-dd'),
            sourceDocumentName: null,
            sourceDocumentPath: null,
        });
        if (created) setSettlement(created);
        return created;
    };

    // ── Automatic data takeover from the uploaded source document ───────────
    // Documents vary wildly in layout (scan, photo, export from any property
    // management tool), so a fixed template parser can't handle them — the
    // file is sent to Claude with a structured-output tool call instead. The
    // result only pre-fills the (still editable, still unsaved) form state;
    // nothing is persisted until the user reviews it and hits "Abrechnung
    // speichern", same as manual entry.
    const extractSettlementDocument = async (file: File): Promise<ExtractedSettlementData | null> => {
        const fileDataUrl = await readFileAsDataUrl(file);
        const response = await authFetch('/api/settlement-extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileDataUrl, mimeType: file.type }),
        });
        if (!response.ok) return null;
        return await response.json() as ExtractedSettlementData;
    };

    const applyExtractedData = (extracted: ExtractedSettlementData) => {
        if (extracted.periodStart && extracted.periodEnd) {
            const start = new Date(extracted.periodStart);
            const end = new Date(extracted.periodEnd);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
            }
        }
        if (extracted.costItems.length > 0) {
            setCostItems((prev) => mergeExtractedCostItems(prev, extracted.costItems, (item) => ({
                id: null,
                label: item.label,
                allocable: item.allocable,
                actualAmount: item.actualAmount != null ? String(item.actualAmount) : '',
                budgetAmount: item.budgetAmount != null ? String(item.budgetAmount) : '',
                actualShareOverride: '',
                budgetShareOverride: '',
            })));
        }
    };

    const handleUploadSourceDocument = async (file: File) => {
        if (!user) return;
        setIsUploadingSource(true);
        try {
            const activeSettlement = await ensureSettlement();
            if (!activeSettlement) return;
            const uploaded = await uploadSettlementSourceDocument(user.id, property.propertyId, file);
            if (!uploaded) return;
            if (activeSettlement.sourceDocumentPath) await removeSettlementSourceDocument(activeSettlement.sourceDocumentPath);
            const updated = await updateSettlement(activeSettlement.serviceChargeSettlementId, {
                sourceDocumentName: uploaded.name,
                sourceDocumentPath: uploaded.path,
            });
            if (updated) setSettlement(updated);
        } finally {
            setIsUploadingSource(false);
        }

        setIsExtractingSettlement(true);
        try {
            const extracted = await extractSettlementDocument(file);
            if (extracted && (extracted.costItems.length > 0 || extracted.periodStart)) {
                applyExtractedData(extracted);
                showToast(`${extracted.costItems.length} Kostenposition(en) aus dem Dokument übernommen. Bitte prüfen und speichern.`, 'success');
            } else {
                showToast('Datei hochgeladen. Automatische Datenübernahme war nicht möglich – bitte Werte manuell erfassen.', 'error');
            }
        } catch {
            showToast('Automatische Datenübernahme fehlgeschlagen – bitte Werte manuell erfassen.', 'error');
        } finally {
            setIsExtractingSettlement(false);
        }
    };

    const handleRemoveSourceDocument = async () => {
        if (!settlement?.sourceDocumentPath) return;
        setIsUploadingSource(true);
        try {
            await removeSettlementSourceDocument(settlement.sourceDocumentPath);
            const updated = await updateSettlement(settlement.serviceChargeSettlementId, { sourceDocumentName: null, sourceDocumentPath: null });
            if (updated) setSettlement(updated);
        } finally {
            setIsUploadingSource(false);
        }
    };

    const handleViewSourceDocument = async () => {
        if (!settlement?.sourceDocumentPath) return;
        const url = await getSettlementSourceDocumentUrl(settlement.sourceDocumentPath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // ── Documents (Nebenkostenabrechnung PDF + Anpassungsschreiben Word) ────
    // Every generated or manually uploaded file is its own row — a second
    // upload never silently hides the first. Uploading over an existing
    // document pauses on a confirm (see useDocumentReplaceFlow) instead of
    // deleting it automatically; declining adds the new file as another line.
    const statementDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkostenabrechnung' && !d.supersededAt), [documents]);
    const adjustmentDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkosten-Anpassungsschreiben' && !d.supersededAt), [documents]);

    // The server upserts by (tenancy, documentType, tenancyPersonId) — a
    // second upload into an already-occupied slot returns the *same*
    // tenancy_document_id with fresh contents, not a new row. Replacing by id
    // (not blindly appending) keeps the box from showing a stale duplicate.
    const uploadDoc = useCallback(async (file: File, documentType: TenancyDocument['documentType']) => {
        if (!user || !tenancy) return;
        try {
            const uploaded = await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType,
            });
            if (!uploaded) {
                showToast('Dokument konnte nicht hochgeladen werden.', 'error');
                return;
            }
            setDocuments((prev) => [...prev.filter((d) => d.tenancyDocumentId !== uploaded.tenancyDocumentId), uploaded]);
            showToast('Dokument hochgeladen.', 'success');
        } catch {
            showToast('Dokument konnte nicht hochgeladen werden.', 'error');
        }
    }, [user, tenancy, showToast]);

    const removeDoc = useCallback(async (doc: TenancyDocument) => {
        try {
            const success = await deleteTenancyDocument(doc.tenancyDocumentId, doc.storagePath);
            if (!success) {
                showToast('Dokument konnte nicht gelöscht werden.', 'error');
                return;
            }
            setDocuments((prev) => prev.filter((d) => d.tenancyDocumentId !== doc.tenancyDocumentId));
        } catch {
            showToast('Dokument konnte nicht gelöscht werden.', 'error');
        }
    }, [showToast]);

    const statementReplaceFlow = useDocumentReplaceFlow<TenancyDocument>({
        upload: (file) => uploadDoc(file, 'Nebenkostenabrechnung'),
    });
    const adjustmentReplaceFlow = useDocumentReplaceFlow<TenancyDocument>({
        upload: (file) => uploadDoc(file, 'Nebenkosten-Anpassungsschreiben'),
    });

    const requestStatementUpload = (file: File) => statementReplaceFlow.requestUpload(file, statementDocs);
    const requestAdjustmentUpload = (file: File) => adjustmentReplaceFlow.requestUpload(file, adjustmentDocs);

    const handleViewDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Signed URLs are cross-origin, so a plain <a download> doesn't force a
    // download in every browser — fetch the bytes and save them locally.
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

    // ── PDF generation ───────────────────────────────────────────────────────
    // landlord is required too (matches the Mieterbescheinigung generator's
    // own gate) — without it landlordName/-Street/-City below all fall back
    // to '', producing a Nebenkostenabrechnung with a blank sender.
    const canGeneratePdf = tenancy != null && settlement != null && landlord != null;

    const buildStatementHtml = async (): Promise<string | null> => {
        if (!tenancy || !settlement) return null;
        const persons = await getTenancyPersonsByTenancy(tenancy.tenancyId);
        const tenantNames = persons
            .filter((p) => (p.lastName ?? '').trim() !== '' || (p.firstName ?? '').trim() !== '')
            .map((p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim());

        const costRows = costItems.map((item) => ({
            label: item.label,
            actualAmount: item.actualAmount === '' ? null : Number(item.actualAmount),
            actualShare: actualShareForItem(item),
            budgetAmount: item.budgetAmount === '' ? null : Number(item.budgetAmount),
            budgetShare: budgetShareForItem(item),
        }));

        return serviceChargeStatementHtml({
            landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '',
            landlordStreet: landlord ? `${landlord.street} ${landlord.houseNumber}` : '',
            landlordCity: landlord ? `${landlord.postalCode} ${landlord.city}` : '',
            propertyAddress: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
            unitLabel: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
            tenantNames: tenantNames.length > 0 ? tenantNames : ['Mieter'],
            issuePlace: landlord?.city || property.city,
            issueDate: formatDeDate(new Date().toISOString()),
            settlementYear,
            periodStart: settlement.periodStart,
            periodEnd: settlement.periodEnd,
            costRows,
            totalActualCosts: totalActualAllocable,
            totalBudgetCosts: totalBudgetAllocable,
            unitActualShare,
            unitBudgetShare,
            annualPrepayment,
            overUnderCoverage,
            currentMonthlyPrepayment,
            newMonthlyPrepayment,
            coldRent: tenancy.coldRent,
        });
    };

    const handlePreview = async () => {
        setIsLoadingPreview(true);
        try {
            const html = await buildStatementHtml();
            setPreviewHtml(html);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const closePreview = () => setPreviewHtml(null);

    const handleGeneratePdf = async () => {
        if (!user || !tenancy || !settlement) return;
        setIsGeneratingPdf(true);
        try {
            const html = await buildStatementHtml();
            if (!html) return;
            const blob = await htmlToPdfBlob(html);
            const file = new File([blob], `Nebenkostenabrechnung_${settlementYear}.pdf`, { type: 'application/pdf' });
            requestStatementUpload(file);
            downloadBlob(blob, file.name);
            showToast('Nebenkostenabrechnung als PDF erstellt.', 'success');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    // ── Anpassungsschreiben (Word) ───────────────────────────────────────────
    // Informs the tenant of the settlement outcome (Nachzahlung/Erstattung)
    // and the new NK-Vorauszahlung — as an editable .docx (not a PDF), so the
    // landlord can still adjust wording before sending it.
    const canGenerateAdjustmentDocx = tenancy != null && settlement != null && landlord != null;

    // Shared field-gathering for both the .docx builder and the HTML preview
    // (adjustmentLetterHtml) — same content, two different renderers.
    const buildAdjustmentContentParams = async () => {
        if (!tenancy || !settlement) return null;
        const persons = await getTenancyPersonsByTenancy(tenancy.tenancyId);
        const tenantNames = persons
            .filter((p) => (p.lastName ?? '').trim() !== '' || (p.firstName ?? '').trim() !== '')
            .map((p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim());

        return {
            landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '',
            landlordStreet: landlord ? `${landlord.street} ${landlord.houseNumber}` : '',
            landlordCity: landlord ? `${landlord.postalCode} ${landlord.city}` : '',
            propertyAddress: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
            unitLabel: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
            tenantNames: tenantNames.length > 0 ? tenantNames : ['Mieter'],
            issuePlace: landlord?.city || property.city,
            issueDate: formatDeDate(new Date().toISOString()),
            settlementYear,
            periodStart: settlement.periodStart,
            periodEnd: settlement.periodEnd,
            totalActualCosts: totalActualAllocable,
            unitActualShare,
            annualPrepayment,
            overUnderCoverage,
            currentMonthlyPrepayment,
            newMonthlyPrepayment,
            newPrepaymentEffectiveDate: format(new Date(settlementYear + 1, 0, 1), 'yyyy-MM-dd'),
        };
    };

    const buildAdjustmentLetterHtml = async (): Promise<string | null> => {
        const params = await buildAdjustmentContentParams();
        return params ? adjustmentLetterHtml(params) : null;
    };

    const handlePreviewAdjustment = async () => {
        setIsLoadingAdjustmentPreview(true);
        try {
            const html = await buildAdjustmentLetterHtml();
            setPreviewAdjustmentHtml(html);
        } finally {
            setIsLoadingAdjustmentPreview(false);
        }
    };

    const closeAdjustmentPreview = () => setPreviewAdjustmentHtml(null);

    const handleGenerateAdjustmentDocx = async () => {
        if (!user || !tenancy || !settlement) return;
        setIsGeneratingAdjustmentDocx(true);
        try {
            const params = await buildAdjustmentContentParams();
            if (!params) return;
            const blob = await buildAdjustmentDocxBlob(params);
            const file = new File([blob], `Anpassung_Nebenkostenvorauszahlung_${settlementYear}.docx`, {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });
            requestAdjustmentUpload(file);
            downloadBlob(blob, file.name);
            showToast('Anpassungsschreiben als Word-Dokument erstellt.', 'success');
        } finally {
            setIsGeneratingAdjustmentDocx(false);
        }
    };

    const backHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/service-charge-settlement`
        : `/existing-properties/${propertyId}`;

    return {
        // state
        isLoading, isSaving, isUploadingSource, isExtractingSettlement, error,
        isGeneratingPdf, isGeneratingAdjustmentDocx, isApplyingPrepayment,
        settlement, periodStart, setPeriodStart, periodEnd, setPeriodEnd,
        periodMode, setPeriodMode, setSettlementYear,
        tenancyPeriodSuggestions, applyTenancyPeriodSuggestion,
        pendingPeriod, confirmPeriodSwitch, cancelPeriodSwitch,
        pendingHref, goTo, confirmDiscard, cancelDiscard,
        savedSettlements, switchToPeriod,
        costItems, tenancy, landlord, useCaseMenuItems, backHref,
        previewHtml, isLoadingPreview,
        previewAdjustmentHtml, isLoadingAdjustmentPreview,
        // documents (generated/uploaded Nebenkostenabrechnung + Anpassungsschreiben)
        statementDocs, adjustmentDocs, statementReplaceFlow, adjustmentReplaceFlow,
        requestStatementUpload, requestAdjustmentUpload,
        handleViewDocument, handleDownloadDocument,
        pendingDeleteDoc, deletingDocId, requestDeleteDoc, cancelDeleteDoc, confirmDeleteDoc,
        pendingDeleteSettlement, isDeletingSettlement, requestDeleteSettlement, cancelDeleteSettlement, confirmDeleteSettlement,
        // computed
        isEditing, unitShare, totalArea, allocationKeys,
        totalActualAllocable, totalBudgetAllocable,
        actualSplit, budgetSplit,
        unitActualShare, unitBudgetShare,
        unitActualShareNonAllocable, unitBudgetShareNonAllocable,
        actualShareForItem, budgetShareForItem,
        annualPrepayment, currentMonthlyPrepayment, overUnderCoverage, settlementCoverage, budgetCoverage, budgetOverUnderCoverage,
        newMonthlyPrepayment, prepaymentDelta, prepaymentUntilSettlement, newTotalRent, settlementYear, tenantLabel,
        displayedPrepaymentDelta, displayedPrepaymentDeltaPercent, nextPrepaymentEffectiveDate,
        canGeneratePdf, canGenerateAdjustmentDocx, canApplyPrepayment,
        // handlers
        updateCostItemField, addCostItem, removeCostItem,
        computeSuggestion, applySuggestion, suggestAllShares, saveAllocationKey,
        handleSave, handleUploadSourceDocument, handleViewSourceDocument, handleRemoveSourceDocument,
        handleGeneratePdf, handlePreview, closePreview,
        handleGenerateAdjustmentDocx, handlePreviewAdjustment, closeAdjustmentPreview,
        handleApplyPrepayment,
    };
}
