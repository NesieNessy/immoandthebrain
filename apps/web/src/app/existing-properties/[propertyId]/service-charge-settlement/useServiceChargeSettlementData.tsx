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
    prorateAnnualPrepayment,
    splitByAllocable,
} from '@/lib/serviceCharge/settlementMath';
import { mergeExtractedCostItems, type ExtractedSettlementData } from '@/lib/serviceCharge/settlementExtraction';
import type {
    MaintenanceCosts,
    PersonalData,
    Property,
    PropertyUnit,
    ServiceChargeCostItem,
    ServiceChargeSettlement,
    Tenancy,
    TenancyAdjustmentHistoryEntry,
    TenancyDocument,
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
    const [documents, setDocuments] = useState<TenancyDocument[]>([]);
    const [pendingDeleteDoc, setPendingDeleteDoc] = useState<TenancyDocument | null>(null);
    const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
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

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const { getAggregatedSettlementData } = await import('@/lib/supabase/settlementAggregate.supabase');
            const { units: loadedUnits, settlement: currentSettlement, tenancy: currentTenancy, costItems: loadedCostItems } = await getAggregatedSettlementData(property.propertyId, unit.propertyUnitId);
            setUnits(loadedUnits);
            setTenancy(currentTenancy);
            setSettlement(currentSettlement);

            const [history, loadedMaintenanceCosts, loadedDocuments] = await Promise.all([
                currentTenancy ? getAdjustmentHistoryByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
                currentTenancy?.maintenanceCostsId ? getMaintenanceCostsById(currentTenancy.maintenanceCostsId) : Promise.resolve(null),
                currentTenancy ? getTenancyDocumentsByTenancy(currentTenancy.tenancyId) : Promise.resolve([]),
            ]);
            setDocuments(loadedDocuments);
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
                // Default the period to the tenant's Mietauszug date when
                // there is one — a settlement for a moved-out tenant almost
                // always needs to end there, not run through Dec 31.
                const moveOutDate = currentTenancy?.tenancyEndDate ? new Date(currentTenancy.tenancyEndDate) : null;
                const { start, end } = defaultSettlementPeriod(moveOutDate, new Date().getFullYear());
                setPeriodStart(start);
                setPeriodEnd(end);
                setPeriodModeState(isFullCalendarYear(start, end) ? 'year' : 'custom');
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
        if (item.actualShareOverride !== '') return Number(item.actualShareOverride) || 0;
        return Math.round((Number(item.actualAmount) || 0) * unitShare * 100) / 100;
    }, [unitShare]);
    const budgetShareForItem = useCallback((item: CostItemForm): number | null => {
        if (!item.allocable || item.budgetAmount === '') return null;
        if (item.budgetShareOverride !== '') return Number(item.budgetShareOverride) || 0;
        return Math.round((Number(item.budgetAmount) || 0) * unitShare * 100) / 100;
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
    // Same comparison as overUnderCoverage, but against next year's *budgeted*
    // share instead of the actual settlement — an annual € figure, so it's
    // the correct like-for-like counterpart to overUnderCoverage rather than
    // prepaymentDelta (a monthly rate change, not directly comparable).
    const budgetOverUnderCoverage = unitBudgetShare - annualPrepayment;

    // Budget plan (3) divided by 12, compared against the current monthly NK-Vorauszahlung.
    const newMonthlyPrepayment = totalBudgetAllocable > 0 ? Math.round((unitBudgetShare / 12) * 100) / 100 : null;
    const prepaymentDelta = newMonthlyPrepayment != null ? newMonthlyPrepayment - currentMonthlyPrepayment : null;
    const newTotalRent = (tenancy?.coldRent ?? 0) + (newMonthlyPrepayment ?? currentMonthlyPrepayment) + (tenancy?.parkingSpaceRent ?? 0);

    const settlementYear = periodEnd ? periodEnd.getFullYear() : new Date().getFullYear();

    // Shown as the avatar+name on the document box rows — same tenant the
    // generated Nebenkostenabrechnung/Anpassungsschreiben actually goes to.
    const tenantLabel = tenancy ? `${tenancy.tenantFirstName ?? ''} ${tenancy.tenantLastName ?? ''}`.trim() || 'Mieter' : undefined;

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
            // warmRent is persisted (not just derived on the fly) because the
            // generated Mietvertrag document reads tenancy.warmRent directly —
            // without updating it here it would still show the old total rent
            // after applying a new NK-Vorauszahlung.
            const newWarmRent = Math.round(((tenancy.coldRent ?? 0) + newMonthlyPrepayment + (tenancy.parkingSpaceRent ?? 0)) * 100) / 100;
            const updatedTenancy = await updateTenancy(tenancy.tenancyId, { miscRent: newMonthlyPrepayment, warmRent: newWarmRent });
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
    const statementDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkostenabrechnung'), [documents]);
    const adjustmentDocs = useMemo(() => documents.filter((d) => d.documentType === 'Nebenkosten-Anpassungsschreiben'), [documents]);

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
        remove: removeDoc,
    });
    const adjustmentReplaceFlow = useDocumentReplaceFlow<TenancyDocument>({
        upload: (file) => uploadDoc(file, 'Nebenkosten-Anpassungsschreiben'),
        remove: removeDoc,
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
    const canGenerateAdjustmentDocx = tenancy != null && settlement != null;

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
        costItems, tenancy, landlord, useCaseMenuItems, backHref,
        previewHtml, isLoadingPreview,
        previewAdjustmentHtml, isLoadingAdjustmentPreview,
        // documents (generated/uploaded Nebenkostenabrechnung + Anpassungsschreiben)
        statementDocs, adjustmentDocs, statementReplaceFlow, adjustmentReplaceFlow,
        requestStatementUpload, requestAdjustmentUpload,
        handleViewDocument, handleDownloadDocument,
        pendingDeleteDoc, deletingDocId, requestDeleteDoc, cancelDeleteDoc, confirmDeleteDoc,
        // computed
        isEditing, unitShare, totalArea,
        totalActualCostsAll, totalBudgetCostsAll,
        totalActualAllocable, totalBudgetAllocable,
        actualSplit, budgetSplit,
        unitActualShare, unitBudgetShare,
        actualShareForItem, budgetShareForItem,
        annualPrepayment, currentMonthlyPrepayment, overUnderCoverage, settlementCoverage, budgetCoverage, budgetOverUnderCoverage,
        newMonthlyPrepayment, prepaymentDelta, newTotalRent, settlementYear, tenantLabel,
        canGeneratePdf, canGenerateAdjustmentDocx, canApplyPrepayment,
        // handlers
        updateCostItemField, addCostItem, removeCostItem,
        handleSave, handleUploadSourceDocument, handleViewSourceDocument, handleRemoveSourceDocument,
        handleGeneratePdf, handlePreview, closePreview,
        handleGenerateAdjustmentDocx, handlePreviewAdjustment, closeAdjustmentPreview,
        handleApplyPrepayment,
    };
}
