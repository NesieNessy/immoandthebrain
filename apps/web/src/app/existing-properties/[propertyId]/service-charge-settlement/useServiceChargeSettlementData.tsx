"use client";

import { useToast } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createUseCaseMenuItems } from '@/lib/propertyUseCaseMenu';
import { getPersonalData } from '@/lib/supabase/personal_data.supabase';
import {
    createCostItem,
    deleteCostItem,
    updateCostItem,
} from '@/lib/supabase/service_charge_cost_item.supabase';
import {
    createSettlement,
    getSettlementSourceDocumentUrl,
    removeSettlementSourceDocument,
    updateSettlement,
    uploadSettlementSourceDocument,
} from '@/lib/supabase/service_charge_settlement.supabase';
import { updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { addAdjustmentHistoryEntry, getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { createMaintenanceCosts, getMaintenanceCostsById, updateMaintenanceCosts } from '@/lib/supabase/maintenance_costs.supabase';
import { formatDeDate } from '@/lib/utils';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import {
    compareBudgetCoverage,
    compareSettlementCoverage,
    prorateAnnualPrepayment,
    splitByAllocable,
} from '@/lib/serviceCharge/settlementMath';
import type {
    MaintenanceCosts,
    PersonalData,
    Property,
    PropertyUnit,
    ServiceChargeCostItem,
    ServiceChargeSettlement,
    Tenancy,
    TenancyAdjustmentHistoryEntry,
} from '@immonext/types';
import { format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DEFAULT_COST_ITEMS, euro } from '../tenant-data/useTenantUnitData';
import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { serviceChargeStatementHtml } from './serviceChargeStatementLetter';

export interface CostItemForm {
    id: number | null;
    label: string;
    allocable: boolean;
    actualAmount: string;
    budgetAmount: string;
    /** Manual override of the computed Anteil Wohnung for this row — empty
     *  string means "use the automatic actualAmount * unit share calculation". */
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

/** A settlement period counts as "whole year" when it spans exactly Jan 1 –
 *  Dec 31 of a single year — the common case, vs. a shorter custom range
 *  (e.g. a tenant moved in/out mid-year). */
function isFullCalendarYear(start: Date, end: Date): boolean {
    return start.getMonth() === 0 && start.getDate() === 1
        && end.getMonth() === 11 && end.getDate() === 31
        && start.getFullYear() === end.getFullYear();
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
    const [miscRentHistory, setMiscRentHistory] = useState<TenancyAdjustmentHistoryEntry[]>([]);
    const [maintenanceCosts, setMaintenanceCosts] = useState<MaintenanceCosts | null>(null);
    const [landlord, setLandlord] = useState<PersonalData | null | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingSource, setIsUploadingSource] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isApplyingPrepayment, setIsApplyingPrepayment] = useState(false);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { getAggregatedSettlementData } = await import('@/lib/supabase/settlementAggregate.supabase');
            const { units: loadedUnits, settlement: currentSettlement, tenancy: currentTenancy, costItems: loadedCostItems } = await getAggregatedSettlementData(property.propertyId, unit.propertyUnitId);
            setUnits(loadedUnits);
            setTenancy(currentTenancy);
            setSettlement(currentSettlement);

            const [history, loadedMaintenanceCosts] = await Promise.all([
                currentTenancy ? getAdjustmentHistoryByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
                currentTenancy?.maintenanceCostsId ? getMaintenanceCostsById(currentTenancy.maintenanceCostsId) : Promise.resolve(null),
            ]);
            setMiscRentHistory(history.filter((entry) => entry.adjustmentType === 'miscRent'));
            setMaintenanceCosts(loadedMaintenanceCosts);

            const defaultItems = () => DEFAULT_COST_ITEMS.map((item) => ({ id: null, label: item.label, allocable: item.allocable, actualAmount: '', budgetAmount: '', actualShareOverride: '', budgetShareOverride: '' }));

            if (currentSettlement) {
                const start = new Date(currentSettlement.periodStart);
                const end = new Date(currentSettlement.periodEnd);
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
                setOriginalSnapshot(loadedItems.length > 0 ? serializeCostItems(items, new Date(currentSettlement.periodStart), new Date(currentSettlement.periodEnd)) : '');
            } else {
                const currentYear = new Date().getFullYear();
                setPeriodStart(new Date(currentYear, 0, 1));
                setPeriodEnd(new Date(currentYear, 11, 31));
                setPeriodModeState('year');
                setCostItems(defaultItems());
                setOriginalSnapshot('');
            }
            setDeletedCostItemIds([]);
        } catch {
            setError('Die Nebenkostenabrechnung konnte nicht geladen werden.');
        } finally {
            setIsLoading(false);
        }
    }, [property.propertyId, unit.propertyUnitId]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        getPersonalData(user.id).then((data) => { if (!cancelled) setLandlord(data ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    const useCaseMenuItems = createUseCaseMenuItems(propertyId, 'ServiceChargeSettlement', (route) => router.push(route));

    const isEditing = !settlement || serializeCostItems(costItems, periodStart, periodEnd) !== originalSnapshot;

    // ── Abrechnungszeitraum: whole calendar year vs. a shorter custom range ──
    const setPeriodMode = (mode: 'year' | 'custom') => {
        setPeriodModeState(mode);
        if (mode === 'year') {
            const year = periodEnd?.getFullYear() ?? periodStart?.getFullYear() ?? new Date().getFullYear();
            setPeriodStart(new Date(year, 0, 1));
            setPeriodEnd(new Date(year, 11, 31));
        }
    };
    const setSettlementYear = (year: number) => {
        setPeriodStart(new Date(year, 0, 1));
        setPeriodEnd(new Date(year, 11, 31));
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
    const totalActualCostsAll = actualSplit.total;
    const totalBudgetCostsAll = budgetSplit.total;
    const totalActualAllocable = actualSplit.allocable;
    const totalBudgetAllocable = budgetSplit.allocable;

    // Per-row Anteil Wohnung: the automatic amount * unitShare calculation,
    // unless the row carries a manual override (different cost items often
    // use a different Verteilerschlüssel than living-area proportion).
    const actualShareForItem = useCallback((item: CostItemForm): number | null => {
        if (!item.allocable || item.actualAmount === '') return null;
        if (item.actualShareOverride !== '') return Number(item.actualShareOverride);
        return Math.round(Number(item.actualAmount) * unitShare * 100) / 100;
    }, [unitShare]);
    const budgetShareForItem = useCallback((item: CostItemForm): number | null => {
        if (!item.allocable || item.budgetAmount === '') return null;
        if (item.budgetShareOverride !== '') return Number(item.budgetShareOverride);
        return Math.round(Number(item.budgetAmount) * unitShare * 100) / 100;
    }, [unitShare]);

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

    const currentMonthlyPrepayment = tenancy?.miscRent ?? 0;
    // (2) Annual total from the tenant's NK-Vorauszahlung, prorated for any
    // miscRent change that took effect during the settlement period.
    const annualPrepayment = useMemo(() => {
        if (!periodStart || !periodEnd) return currentMonthlyPrepayment * 12;
        const history = miscRentHistory
            .filter((entry): entry is TenancyAdjustmentHistoryEntry & { effectiveDate: string; amount: number } => entry.effectiveDate != null && entry.amount != null)
            .map((entry) => ({ effectiveDate: entry.effectiveDate, amount: entry.amount }));
        return prorateAnnualPrepayment(currentMonthlyPrepayment, history, periodStart, periodEnd);
    }, [currentMonthlyPrepayment, miscRentHistory, periodStart, periodEnd]);

    // (1) vs (2): shortfall = "Nachzahlung durch Mieter", surplus = "Guthaben des Mieters".
    const settlementCoverage = compareSettlementCoverage(unitActualShare, annualPrepayment);
    const overUnderCoverage = unitActualShare - annualPrepayment;

    // (2) vs (3): shortfall = prepayment too low (increase), surplus = prepayment too high (decrease).
    const budgetCoverage = compareBudgetCoverage(annualPrepayment, unitBudgetShare);

    // Budget plan (3) divided by 12, compared against the current monthly NK-Vorauszahlung.
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.round((unitBudgetShare / 12) * 100) / 100 : null;
    const prepaymentDelta = newMonthlyPrepayment != null ? newMonthlyPrepayment - currentMonthlyPrepayment : null;
    const newTotalRent = (tenancy?.coldRent ?? 0) + (newMonthlyPrepayment ?? currentMonthlyPrepayment) + (tenancy?.parkingSpaceRent ?? 0);

    const settlementYear = periodEnd ? periodEnd.getFullYear() : new Date().getFullYear();

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

    // ── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const currentYear = new Date().getFullYear();
            const periodStartStr = periodStart ? format(periodStart, 'yyyy-MM-dd') : format(new Date(currentYear, 0, 1), 'yyyy-MM-dd');
            const periodEndStr = periodEnd ? format(periodEnd, 'yyyy-MM-dd') : format(new Date(currentYear, 11, 31), 'yyyy-MM-dd');

            let activeSettlement = settlement;
            if (!activeSettlement) {
                activeSettlement = await createSettlement({
                    propertyId: property.propertyId,
                    periodStart: periodStartStr,
                    periodEnd: periodEndStr,
                    sourceDocumentName: null,
                    sourceDocumentPath: null,
                });
                if (!activeSettlement) throw new Error('Konnte Abrechnung nicht anlegen.');
                setSettlement(activeSettlement);
            } else if (activeSettlement.periodStart !== periodStartStr || activeSettlement.periodEnd !== periodEndStr) {
                const updated = await updateSettlement(activeSettlement.serviceChargeSettlementId, { periodStart: periodStartStr, periodEnd: periodEndStr });
                if (updated) { activeSettlement = updated; setSettlement(updated); }
            }

            await Promise.all(deletedCostItemIds.map((id) => deleteCostItem(id)));

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
                if (item.id != null) {
                    const updated = await updateCostItem(item.id, payload);
                    savedItems.push(updated ? toCostItemForm(updated) : item);
                } else {
                    const created = await createCostItem(payload);
                    savedItems.push(created ? toCostItemForm(created) : item);
                }
            }
            setCostItems(savedItems);
            setDeletedCostItemIds([]);
            setOriginalSnapshot(serializeCostItems(savedItems, periodStart, periodEnd));
            showToast('Nebenkostenabrechnung gespeichert.', 'success');
        } catch {
            setError('Die Nebenkostenabrechnung konnte nicht gespeichert werden.');
        } finally {
            setIsSaving(false);
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
            const updatedTenancy = await updateTenancy(tenancy.tenancyId, { miscRent: newMonthlyPrepayment });
            if (updatedTenancy) setTenancy(updatedTenancy);

            const effectiveDate = format(new Date(settlementYear + 1, 0, 1), 'yyyy-MM-dd');
            const historyEntry = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: property.propertyId,
                adjustmentType: 'miscRent',
                effectiveDate,
                amount: prepaymentDelta,
                note: 'NK-Vorauszahlung aus Nebenkostenabrechnung übernommen',
            });
            if (historyEntry) setMiscRentHistory((prev) => [historyEntry, ...prev]);

            const mcPayload = {
                costBreakdown: true,
                allocableCosts: budgetSplit.allocable,
                nonAllocableCosts: budgetSplit.nonAllocable,
                totalCosts: budgetSplit.total,
                allocableCostsProjection: true,
                nonAllocableCostsProjection: true,
                totalCostsProjection: true,
                costItems: costItems.map((item, index) => ({
                    id: item.id != null ? String(item.id) : `new-${index}`,
                    label: item.label,
                    amount: Number(item.budgetAmount) || 0,
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
                if (tenancyWithCosts) setTenancy(tenancyWithCosts);
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
            periodStart: periodStart ? format(periodStart, 'yyyy-MM-dd') : format(new Date(currentYear, 0, 1), 'yyyy-MM-dd'),
            periodEnd: periodEnd ? format(periodEnd, 'yyyy-MM-dd') : format(new Date(currentYear, 11, 31), 'yyyy-MM-dd'),
            sourceDocumentName: null,
            sourceDocumentPath: null,
        });
        if (created) setSettlement(created);
        return created;
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

    // ── PDF generation ───────────────────────────────────────────────────────
    const canGeneratePdf = tenancy != null && settlement != null;

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
            await uploadTenancyDocument(user.id, file, {
                tenancyId: tenancy.tenancyId,
                tenancyPersonId: null,
                documentType: 'Nebenkostenabrechnung',
            });
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
            showToast('Nebenkostenabrechnung als PDF erstellt.', 'success');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const backHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/service-charge-settlement`
        : `/existing-properties/${propertyId}`;

    return {
        // state
        isLoading, isSaving, isUploadingSource, isGeneratingPdf, isApplyingPrepayment, error,
        settlement, periodStart, setPeriodStart, periodEnd, setPeriodEnd,
        periodMode, setPeriodMode, setSettlementYear,
        costItems, tenancy, landlord, useCaseMenuItems, backHref,
        previewHtml, isLoadingPreview,
        // computed
        isEditing, unitShare, totalArea,
        totalActualCostsAll, totalBudgetCostsAll,
        totalActualAllocable, totalBudgetAllocable,
        actualSplit, budgetSplit,
        unitActualShare, unitBudgetShare,
        actualShareForItem, budgetShareForItem,
        annualPrepayment, currentMonthlyPrepayment, overUnderCoverage, settlementCoverage, budgetCoverage,
        newMonthlyPrepayment, prepaymentDelta, newTotalRent, settlementYear,
        canGeneratePdf, canApplyPrepayment,
        // handlers
        updateCostItemField, addCostItem, removeCostItem,
        handleSave, handleUploadSourceDocument, handleViewSourceDocument, handleRemoveSourceDocument,
        handleGeneratePdf, handlePreview, closePreview, handleApplyPrepayment,
    };
}
