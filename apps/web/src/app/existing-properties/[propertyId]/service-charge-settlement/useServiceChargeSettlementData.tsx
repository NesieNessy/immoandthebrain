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
import { format, parseISO } from 'date-fns';
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
    /** Anteil Wohnung for this row — manual entry, never derived from
     *  actualAmount. Empty string means "not entered yet". */
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
    // "Wert vorschlagen" inputs: explicit keys persist across periods (fetched
    // by unit); previousCostItems is a label -> row lookup for the settlement
    // immediately preceding the one currently loaded.
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
    // not reachable via the year chevron. Must never mix in another unit's
    // settlements (they're per unit, not shared across a building).
    const [savedSettlements, setSavedSettlements] = useState<ServiceChargeSettlement[]>([]);
    const refreshSavedSettlements = useCallback(async () => {
        setSavedSettlements(await getSettlementsByUnit(property.propertyId, unit.propertyUnitId));
    }, [property.propertyId, unit.propertyUnitId]);
    useEffect(() => { void refreshSavedSettlements(); }, [refreshSavedSettlements]);

    // `explicitPeriod` means "load the settlement for exactly this period"
    // (browsing history via the year picker) vs. the initial "most recent" load.
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

            if (currentSettlement) {
                const start = new Date(currentSettlement.periodStart);
                const end = new Date(currentSettlement.periodEnd);
                resolvedStart = start;
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
                const loadedItems = (loadedCostItems ?? []).map(toCostItemForm);
                // A settlement can exist with no saved cost items yet (e.g. created
                // just by uploading a source document) — show the full standard
                // BetrKV list to fill in, not an empty table.
                const items = loadedItems.length > 0 ? loadedItems : defaultItems();
                setCostItems(items);
                // Snapshot what was actually loaded (including the default template),
                // not an empty string, so isEditing stays false until something
                // changes — previously an untouched page was always "dirty" and
                // triggered the discard-confirmation dialog on every navigation.
                setOriginalSnapshot(serializeCostItems(items, start, end));
            } else if (explicitPeriod) {
                // Navigated to a period with no saved settlement yet — start a
                // fresh draft for exactly that period.
                resolvedStart = explicitPeriod.start;
                setPeriodStart(explicitPeriod.start);
                setPeriodEnd(explicitPeriod.end);
                setPeriodModeState(isFullCalendarYear(explicitPeriod.start, explicitPeriod.end) ? 'year' : 'custom');
                const items = defaultItems();
                setCostItems(items);
                setOriginalSnapshot(serializeCostItems(items, explicitPeriod.start, explicitPeriod.end));
            } else {
                // Default period ends at the tenant's move-out date, if any.
                const moveOutDate = currentTenancy?.tenancyEndDate ? new Date(currentTenancy.tenancyEndDate) : null;
                const { start, end } = defaultSettlementPeriod(moveOutDate, new Date().getFullYear());
                resolvedStart = start;
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
                const items = defaultItems();
                setCostItems(items);
                setOriginalSnapshot(serializeCostItems(items, start, end));
            }
            setDeletedCostItemIds([]);

            // "Wert vorschlagen" inputs: this unit's explicit allocation keys,
            // and a label -> row lookup for the settlement preceding this period.
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
    // Guards against silently discarding an unsaved edit when switching years.
    const [pendingPeriod, setPendingPeriod] = useState<{ start: Date; end: Date } | null>(null);
    // Same guard, but for leaving the page entirely (breadcrumbs, back, use-case menu).
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        getPersonalData(user.id).then((data) => { if (!cancelled) setLandlord(data ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    // Every tenancy this unit has ever had — backs "Mietzeitraum übernehmen"
    // so a landlord can pick a past tenant's period, not just the current one.
    const [unitTenancies, setUnitTenancies] = useState<Tenancy[]>([]);
    useEffect(() => {
        let cancelled = false;
        getTenanciesByUnit(unit.propertyUnitId).then((rows) => { if (!cancelled) setUnitTenancies(rows); });
        return () => { cancelled = true; };
    }, [unit.propertyUnitId]);

    // Pure snapshot comparison. Must NOT also force true when `settlement` is
    // null — a fresh draft period has no settlement yet by definition, but
    // treating that as "dirty" previously made every untouched draft
    // spuriously trigger the discard-confirmation dialog.
    const isEditing = serializeCostItems(costItems, periodStart, periodEnd) !== originalSnapshot;

    // Routes any navigation away from an unsaved edit through a confirm step.
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
        // parseISO, not new Date(): a bare 'yyyy-MM-dd' string passed to the
        // Date constructor is UTC midnight, i.e. 01:00/02:00 local here.
        setPeriodStart(parseISO(suggestion.startDateStr));
        setPeriodEnd(parseISO(suggestion.endDateStr));
    };
    // Replaces periodStart/periodEnd, costItems and settlement wholesale (see
    // `load`'s explicitPeriod branch), so it's guarded like other unsaved-edit navigation.
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

    // Per-row Anteil Wohnung: always manual, never derived from
    // actualAmount/budgetAmount — total property cost never automatically
    // implies one apartment's share of it.
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
    // Anteil Wohnung of the non-allocable rows, kept separate from
    // unitActualShare/unitBudgetShare (which must only include allocable
    // items, since those feed the Nachzahlung/Guthaben math) but still
    // summed for display so entered values aren't hidden behind a "–".
    const unitActualShareNonAllocable = useMemo(
        () => costItems.reduce((sum, item) => sum + (!item.allocable && item.actualShareOverride !== '' ? Number(item.actualShareOverride) || 0 : 0), 0),
        [costItems],
    );
    const unitBudgetShareNonAllocable = useMemo(
        () => costItems.reduce((sum, item) => sum + (!item.allocable && item.budgetShareOverride !== '' ? Number(item.budgetShareOverride) || 0 : 0), 0),
        [costItems],
    );

    const currentMonthlyPrepayment = tenancy?.miscRent ?? 0;

    // "Wert vorschlagen" resolves per cost item label (see
    // suggestShareForCostItem), since different items use different
    // allocation keys (ownership share, consumption, unit count, ...):
    // explicit key first, else this unit's own previous-settlement ratio for
    // that label, else no suggestion.
    // (2) Annual total from the tenant's NK-Vorauszahlung, prorated for any
    // miscRent change during the period and clipped to days actually
    // occupied — a period spanning before move-in or after move-out must not
    // charge/credit prepayment for months nobody was renting.
    const annualPrepayment = useMemo(() => {
        if (!periodStart || !periodEnd) return currentMonthlyPrepayment * 12;
        const history = miscRentHistory
            .filter((entry): entry is TenancyAdjustmentHistoryEntry & { effectiveDate: string; amount: number } => entry.effectiveDate != null && entry.amount != null)
            .map((entry) => ({ effectiveDate: entry.effectiveDate, amount: entry.amount }));
        const tenancyStart = tenancy?.tenancyStartDate ? new Date(tenancy.tenancyStartDate) : null;
        const tenancyEnd = tenancy?.tenancyEndDate ? new Date(tenancy.tenancyEndDate) : null;
        return prorateAnnualPrepayment(currentMonthlyPrepayment, history, periodStart, periodEnd, tenancyStart, tenancyEnd);
    }, [currentMonthlyPrepayment, miscRentHistory, periodStart, periodEnd, tenancy?.tenancyStartDate, tenancy?.tenancyEndDate]);

    // Monthly rate actually billed for this settlement, frozen to periodEnd —
    // unlike currentMonthlyPrepayment (the live rate the "übernehmen" button
    // acts on), this must never change once a period is loaded.
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
    // Like-for-like annual € counterpart to overUnderCoverage, but against
    // next year's budgeted share — not comparable to prepaymentDelta (a monthly rate change).
    const budgetOverUnderCoverage = unitBudgetShare - annualPrepayment;

    // Budget plan (3) divided by 12, compared against the current monthly NK-Vorauszahlung.
    // Floored at 0: a monthly prepayment is never negative, so bad input
    // (e.g. a mistyped Anteil Wohnung) can't make "übernehmen" write a
    // negative miscRent onto the tenancy.
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.max(0, Math.round((unitBudgetShare / 12) * 100) / 100) : null;
    // The new rate totalled over this same period — the "Neue" card's
    // footnote, comparable to annualPrepayment (same proration). A
    // hypothetical flat rate, so no history is passed in.
    const newAnnualPrepayment = useMemo(() => {
        if (newMonthlyPrepayment == null || !periodStart || !periodEnd) return null;
        const tenancyStart = tenancy?.tenancyStartDate ? new Date(tenancy.tenancyStartDate) : null;
        const tenancyEnd = tenancy?.tenancyEndDate ? new Date(tenancy.tenancyEndDate) : null;
        return prorateAnnualPrepayment(newMonthlyPrepayment, [], periodStart, periodEnd, tenancyStart, tenancyEnd);
    }, [newMonthlyPrepayment, periodStart, periodEnd, tenancy?.tenancyStartDate, tenancy?.tenancyEndDate]);
    // Drives the "übernehmen" button; compared against the live tenancy rate
    // since that's what the button writes to (disabled once they match).
    const prepaymentDelta = newMonthlyPrepayment != null ? newMonthlyPrepayment - currentMonthlyPrepayment : null;
    // Drives the "Bisherige"/"Neue" cards' difference display; computed
    // against prepaymentUntilSettlement (the frozen, as-billed rate those
    // cards show), not currentMonthlyPrepayment. Can legitimately differ from
    // prepaymentDelta if another change took effect since this period ended.
    const displayedPrepaymentDelta = newMonthlyPrepayment != null ? Math.round((newMonthlyPrepayment - prepaymentUntilSettlement) * 100) / 100 : null;
    const displayedPrepaymentDeltaPercent = displayedPrepaymentDelta != null && prepaymentUntilSettlement > 0
        ? Math.round((displayedPrepaymentDelta / prepaymentUntilSettlement) * 1000) / 10
        : null;
    const newTotalRent = (tenancy?.coldRent ?? 0) + (newMonthlyPrepayment ?? currentMonthlyPrepayment) + (tenancy?.parkingSpaceRent ?? 0);
    // Takes effect the day after this settlement's period ends — not always
    // Jan 1, since "Individueller Zeitraum" can end anywhere.
    const nextPrepaymentEffectiveDate = periodEnd
        ? new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1)
        : new Date(new Date().getFullYear() + 1, 0, 1);

    const settlementYear = periodEnd ? periodEnd.getFullYear() : new Date().getFullYear();

    // One-click "Individueller Zeitraum" starting points, one per tenant this
    // unit has ever had (not just current) — never applied automatically,
    // only offered. Each is clipped to [settlementYear Jan 1, Dec 31] rather
    // than the tenancy's raw start/end, since a Nebenkostenabrechnung is
    // always a single calendar year (or the partial year of a move-in/out).
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

    // Must include every tenancy_person (a couple, roommates), not just
    // tenancy.tenantFirstName/tenantLastName (the single denormalized primary
    // tenant) — otherwise the document recipient silently drops co-tenants.
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

    // Opt-in "Wert vorschlagen" — never runs automatically and never
    // overwrites an existing value. "Allocable" never enters the ratio
    // decision; it only governs what's later charged to the tenant.
    //
    // Learned-ratio source differs by column: budget (Wirtschaftsplan) checks
    // this same settlement's already-filled actual (Abrechnung) side for the
    // label first, since that's more recent than any earlier settlement;
    // actual has no such same-settlement fallback and only looks at a truly
    // previous settlement.
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

    // Each icon only touches its own column; always overwrites that one
    // field (an explicit click asks for a fresh number). The bulk action
    // below is the "don't overwrite" counterpart.
    const applySuggestion = useCallback((index: number, column: 'actual' | 'budget') => {
        const suggestion = computeSuggestion(index, column);
        if (!suggestion) return;
        setCostItems((prev) => prev.map((it, i) => (i === index
            ? { ...it, ...(column === 'actual' ? { actualShareOverride: String(suggestion.value) } : { budgetShareOverride: String(suggestion.value) }) }
            : it)));
    }, [computeSuggestion]);

    // Bulk version — unlike the per-row buttons, only fills rows still empty
    // and only where a suggestion exists; never fabricates a number.
    // keysOverride lets setOverallAllocationKey run this against keys it just
    // created, without waiting for the setAllocationKeys state update to land.
    const suggestAllShares = useCallback((keysOverride?: ServiceChargeAllocationKey[]) => {
        const keys = keysOverride ?? allocationKeys;
        setCostItems((prev) => prev.map((item) => {
            const actualSuggestion = item.actualShareOverride === '' && item.actualAmount !== ''
                ? suggestShareForCostItem(Number(item.actualAmount) || 0, item.label, keys, historyCandidatesFor(item, 'actual'))
                : null;
            const budgetSuggestion = item.budgetShareOverride === '' && item.budgetAmount !== ''
                ? suggestShareForCostItem(Number(item.budgetAmount) || 0, item.label, keys, historyCandidatesFor(item, 'budget'))
                : null;
            return {
                ...item,
                actualShareOverride: actualSuggestion ? String(actualSuggestion.value) : item.actualShareOverride,
                budgetShareOverride: budgetSuggestion ? String(budgetSuggestion.value) : item.budgetShareOverride,
            };
        }));
    }, [allocationKeys, historyCandidatesFor]);

    // Persists an explicit allocation key for one cost item label, so future
    // suggestions for it no longer depend on prior-period history existing.
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

    // "Verteilerschlüssel für alle festlegen" — sets the same key on every
    // label at once, but only labels without their own key already (so e.g.
    // a consumption-based heating key is never overwritten). Runs the bulk
    // suggestion afterwards so empty fields pick the new key up immediately.
    const setOverallAllocationKey = async (numerator: number, denominator: number, allocationType: string | null): Promise<void> => {
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return;
        const labels = Array.from(new Set(costItems.map((item) => item.label.trim()).filter((label) => label !== '')));
        const labelsWithoutKey = labels.filter((label) => !allocationKeys.some((k) => k.label.trim().toLowerCase() === label.toLowerCase()));
        const created = await Promise.all(labelsWithoutKey.map((label) => createAllocationKey({
            propertyUnitId: unit.propertyUnitId,
            propertyId: property.propertyId,
            label,
            numerator,
            denominator,
            allocationType,
        })));
        const newKeys = created.filter((k): k is ServiceChargeAllocationKey => k != null);
        if (newKeys.length > 0) setAllocationKeys((prev) => [...prev, ...newKeys]);
        suggestAllShares([...allocationKeys, ...newKeys]);
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

            // Anteil Wohnung can never legitimately exceed Gesamtobjekt — a
            // value that does is always a typo, not a real figure. Checked
            // per row, per column (Abrechnung / Wirtschaftsplan are independent).
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

            // Gesamtobjekt and Anteil Wohnung form a pair per column — one
            // filled without the other is always incomplete and must not save silently.
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
            // True once `activeSettlement` is a row that didn't exist when this
            // edit session started — none of the current cost-item rows' ids
            // belong to it, so every item must be (re)created, and
            // deletedCostItemIds (which target the OTHER settlement) must not apply.
            let isNewSettlementForThisSave = false;
            // The loaded settlement's own period was edited — the saved-
            // settlements menu labels need refreshing, but the cost items
            // still belong to this same row.
            let periodChangedInPlace = false;

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
                // periodStart/periodEnd come back from the API as full ISO
                // datetime strings, not bare "yyyy-MM-dd" — comparing raw
                // strings always mismatched, so saving an unchanged settlement
                // wrongly took this branch and hit itself as PERIOD_CONFLICT.
                // Both sides must go through the same formatting first.
                format(new Date(activeSettlement.periodStart), 'yyyy-MM-dd') !== periodStartStr
                || format(new Date(activeSettlement.periodEnd), 'yyyy-MM-dd') !== periodEndStr
            ) {
                // The loaded settlement's period was edited — update it in place
                // (keeping its cost items and source document). Browsing to
                // another period goes through switchToPeriod, which reloads, so
                // reaching here always means "edit this one". Refuse only when
                // a *different* settlement already occupies the new period.
                const conflict = await getSettlementByPeriod(property.propertyId, unit.propertyUnitId, periodStartStr, periodEndStr);
                if (conflict && conflict.serviceChargeSettlementId !== activeSettlement.serviceChargeSettlementId) {
                    throw new Error('PERIOD_CONFLICT');
                }
                const updated = await updateSettlement(activeSettlement.serviceChargeSettlementId, {
                    periodStart: periodStartStr,
                    periodEnd: periodEndStr,
                });
                if (!updated) throw new Error('updateSettlement failed');
                activeSettlement = updated;
                setSettlement(updated);
                periodChangedInPlace = true;
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
            if (isNewSettlementForThisSave || periodChangedInPlace) void refreshSavedSettlements();
            showToast('Nebenkostenabrechnung gespeichert.', 'success');
        } catch (err) {
            console.error('Nebenkostenabrechnung speichern fehlgeschlagen', err);
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
    // Deletes the currently loaded settlement; cost items cascade-delete at the DB level.
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
    // Commits the recommended monthly prepayment to the tenancy, logs it to
    // adjustment history for future proration, and writes the allocable/non-
    // allocable split into the tenancy's maintenance_costs record.
    const canApplyPrepayment = tenancy != null && newMonthlyPrepayment != null && prepaymentDelta !== 0;

    const handleApplyPrepayment = async () => {
        if (!tenancy || newMonthlyPrepayment == null || prepaymentDelta == null) return;
        setIsApplyingPrepayment(true);
        setError(null);
        try {
            // warmRent is persisted because the generated Mietvertrag reads
            // tenancy.warmRent directly, not a derived value.
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

            // Must hold this unit's share, not the whole building's totals —
            // shown as this tenant's own Nebenkosten breakdown on Vertragsdaten.
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
    // wait for an explicit save — lazily creates the settlement row the same
    // way handleSave does, without touching the period fields.
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
    // Documents vary too widely in layout for a fixed parser, so the file is
    // sent to Claude with a structured-output tool call instead. Result only
    // pre-fills the still-editable form state; nothing persists until save.
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
            // 'yyyy-MM-dd' from the extraction — see applyTenancyPeriodSuggestion.
            const start = parseISO(extracted.periodStart);
            const end = parseISO(extracted.periodEnd);
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
    // Every file is its own row. Uploading over an existing document pauses
    // on a confirm (see useDocumentReplaceFlow) rather than deleting it automatically.
    const statementDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkostenabrechnung' && !d.supersededAt), [documents]);
    const adjustmentDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkosten-Anpassungsschreiben' && !d.supersededAt), [documents]);

    // Server upserts by (tenancy, documentType, tenancyPersonId), returning
    // the same id with fresh contents — replace by id to avoid a stale duplicate.
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

    // Signed URLs are cross-origin, so <a download> doesn't force a download
    // in every browser — fetch the bytes and save them locally instead.
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
    // landlord is required too — without it, landlordName/-Street/-City below
    // fall back to '', producing a document with a blank sender.
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
    // Generated as an editable .docx (not a PDF) so the landlord can adjust wording.
    const canGenerateAdjustmentDocx = tenancy != null && settlement != null && landlord != null;

    // Shared field-gathering for the .docx builder and the HTML preview — same content, two renderers.
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
        newMonthlyPrepayment, newAnnualPrepayment, prepaymentDelta, prepaymentUntilSettlement, newTotalRent, settlementYear, tenantLabel,
        displayedPrepaymentDelta, displayedPrepaymentDeltaPercent, nextPrepaymentEffectiveDate,
        canGeneratePdf, canGenerateAdjustmentDocx, canApplyPrepayment,
        // handlers
        updateCostItemField, addCostItem, removeCostItem,
        computeSuggestion, applySuggestion, suggestAllShares, saveAllocationKey, setOverallAllocationKey,
        handleSave, handleUploadSourceDocument, handleViewSourceDocument, handleRemoveSourceDocument,
        handleGeneratePdf, handlePreview, closePreview,
        handleGenerateAdjustmentDocx, handlePreviewAdjustment, closeAdjustmentPreview,
        handleApplyPrepayment,
    };
}
