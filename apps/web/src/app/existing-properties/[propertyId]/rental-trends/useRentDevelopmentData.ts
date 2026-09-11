"use client";

import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { addAdjustmentHistoryEntry, getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { getCurrentTenancyByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import type { Property, PropertyUnit, Tenancy, TenancyAdjustmentHistoryEntry } from '@immoandthebrain/types';
import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import {
    computeProposal558,
    computeProposal559,
    rolloverTargetDateIfDue,
    type Proposal558Result,
    type Proposal559Result,
} from './rentDevelopmentPlan';

function dayDiff(a: string, b: string): number {
    return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / (1000 * 60 * 60 * 24));
}

/** Keeps rolling `dateField`/`reminderField`/(optionally) `endDateField`
 *  forward one month at a time (via rolloverTargetDateIfDue) until the
 *  target date is no longer overdue — the "carried forward to the
 *  following month" behavior, applied lazily whenever the page loads. */
function rollForward(tenancy: Tenancy, dateField: string | null, reminderField: string | null, endDateField: string | null) {
    if (!dateField) return null;
    let current = dateField;
    let steps = 0;
    while (steps < 24) { // safety bound — should only ever loop a handful of times
        const next = rolloverTargetDateIfDue(current);
        if (!next) break;
        current = next;
        steps += 1;
    }
    if (current === dateField) return null;

    const deltaDays = dayDiff(dateField, current);
    const newReminder = reminderField ? format(addDays(parseISO(reminderField), deltaDays), 'yyyy-MM-dd') : null;
    const newEndDate = endDateField ? format(addDays(parseISO(endDateField), deltaDays), 'yyyy-MM-dd') : null;
    return { newDate: current, newReminder, newEndDate };
}

export function useRentDevelopmentData(propertyId: string, unitId: string) {
    const [property, setProperty] = useState<Property | null>(null);
    const [unit, setUnit] = useState<PropertyUnit | null>(null);
    const [hasMultipleUnits, setHasMultipleUnits] = useState(false);
    const [tenancy, setTenancy] = useState<Tenancy | null>(null);
    const [historyEntries, setHistoryEntries] = useState<TenancyAdjustmentHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isResolving, setIsResolving] = useState<'rent' | 'renovation' | null>(null);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const pId = parseInt(propertyId, 10);
        const uId = parseInt(unitId, 10);

        Promise.all([
            getPropertyById(pId),
            getPropertyUnitsByProperty(pId),
            getCurrentTenancyByUnit(uId),
        ]).then(async ([foundProperty, units, foundTenancy]) => {
            if (cancelled) return;
            setProperty(foundProperty);
            setUnit(units.find((u) => u.propertyUnitId === uId) ?? null);
            setHasMultipleUnits(units.length > 1);

            if (!foundTenancy) {
                setTenancy(null);
                setHistoryEntries([]);
                setIsLoading(false);
                return;
            }

            const history = await getAdjustmentHistoryByTenancy(foundTenancy.tenancyId);
            if (cancelled) return;

            // Lazy monthly rollover — if either pending proposal's target
            // date has already passed with no decision, carry it forward.
            const rentRoll = rollForward(foundTenancy, foundTenancy.nextRentAdjustmentDate ?? null, foundTenancy.rentAdjustmentReminderDate ?? null, null);
            const renovationRoll = rollForward(foundTenancy, foundTenancy.renovationAdjustmentStartDate ?? null, foundTenancy.renovationAdjustmentReminderDate ?? null, foundTenancy.renovationAdjustmentEndDate ?? null);

            let effectiveTenancy = foundTenancy;
            if (rentRoll || renovationRoll) {
                const updated = await updateTenancy(foundTenancy.tenancyId, {
                    ...(rentRoll ? { nextRentAdjustmentDate: rentRoll.newDate, rentAdjustmentReminderDate: rentRoll.newReminder } : {}),
                    ...(renovationRoll ? {
                        renovationAdjustmentStartDate: renovationRoll.newDate,
                        renovationAdjustmentEndDate: renovationRoll.newEndDate,
                        renovationAdjustmentReminderDate: renovationRoll.newReminder,
                    } : {}),
                });
                if (updated) effectiveTenancy = updated;
            }

            setTenancy(effectiveTenancy);
            setHistoryEntries(history);
            setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [propertyId, unitId, reloadToken]);

    const refresh = () => setReloadToken((t) => t + 1);

    // Only *applied* increases count toward the legal-cap history — a
    // generated-but-not-yet-accepted letter shouldn't reduce future room.
    const appliedRentIncreases = useMemo(
        () => historyEntries.filter((h) => h.adjustmentType === 'rent' && h.note?.includes('übernommen') && h.effectiveDate),
        [historyEntries],
    );
    const appliedRenovationIncreases = useMemo(
        () => historyEntries.filter((h) => h.adjustmentType === 'renovation' && h.note?.includes('übernommen') && h.effectiveDate),
        [historyEntries],
    );
    const lastRentIncrease = appliedRentIncreases[0] ?? null; // history comes back newest-first
    const lastRenovationIncrease = appliedRenovationIncreases[0] ?? null;

    const proposal558: Proposal558Result | null = useMemo(() => {
        if (!tenancy || !unit || !property) return null;
        return computeProposal558({
            coldRent: tenancy.coldRent ?? 0,
            livingAreaM2: unit.livingAreaM2 ?? 0,
            city: property.city,
            rentIndexPerM2: tenancy.rentIndexPerM2 ?? null,
            rentIncreaseIntervalMonths: tenancy.rentIncreaseIntervalMonths ?? null,
            lastIncreaseDate: lastRentIncrease?.effectiveDate ?? null,
            priorIncreases: appliedRentIncreases.map((h) => ({ effectiveDate: h.effectiveDate!, amount: h.amount ?? 0 })),
            manualOverrideAmount: tenancy.nextRentAdjustmentAmount ?? null,
        });
    }, [tenancy, unit, property, lastRentIncrease, appliedRentIncreases]);

    const proposal559: Proposal559Result | null = useMemo(() => {
        if (!tenancy || !unit) return null;
        return computeProposal559({
            coldRent: tenancy.coldRent ?? 0,
            livingAreaM2: unit.livingAreaM2 ?? 0,
            plannedRenovationCost: tenancy.plannedRenovationCost ?? null,
            lastIncrease: lastRenovationIncrease?.effectiveDate
                ? { effectiveDate: lastRenovationIncrease.effectiveDate, monthlyAmount: lastRenovationIncrease.amount ?? 0 }
                : null,
            manualOverrideAmount: tenancy.renovationAdjustmentAmount ?? null,
        });
    }, [tenancy, unit, lastRenovationIncrease]);

    const acceptRent = async () => {
        if (!tenancy || !proposal558) return;
        setIsResolving('rent');
        try {
            const amount = proposal558.proposedAmount;
            const newColdRent = (tenancy.coldRent ?? 0) + amount;
            const effectiveDate = tenancy.nextRentAdjustmentDate ?? format(new Date(), 'yyyy-MM-dd');
            const updated = await updateTenancy(tenancy.tenancyId, {
                coldRent: newColdRent,
                nextRentAdjustmentDate: null,
                nextRentAdjustmentAmount: null,
                rentAdjustmentReminderDate: null,
            });
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: tenancy.propertyId,
                adjustmentType: 'rent',
                effectiveDate,
                amount,
                note: 'Mietanpassung übernommen',
            });
            if (updated) setTenancy(updated);
            if (created) setHistoryEntries((prev) => [created, ...prev]);
        } finally {
            setIsResolving(null);
        }
    };

    const declineRent = async () => {
        if (!tenancy) return;
        setIsResolving('rent');
        try {
            const updated = await updateTenancy(tenancy.tenancyId, {
                nextRentAdjustmentDate: null,
                nextRentAdjustmentAmount: null,
                rentAdjustmentReminderDate: null,
            });
            if (updated) setTenancy(updated);
        } finally {
            setIsResolving(null);
        }
    };

    const deferRentToNextMonth = async () => {
        if (!tenancy || !proposal558) return;
        setIsResolving('rent');
        try {
            const currentDate = tenancy.nextRentAdjustmentDate ?? proposal558.earliestEffectiveDate;
            const currentReminder = tenancy.rentAdjustmentReminderDate ?? null;
            const newDate = format(addDays(parseISO(currentDate), 30), 'yyyy-MM-dd');
            const newReminder = currentReminder
                ? format(addDays(parseISO(currentReminder), dayDiff(currentDate, newDate)), 'yyyy-MM-dd')
                : null;
            const updated = await updateTenancy(tenancy.tenancyId, {
                nextRentAdjustmentDate: newDate,
                nextRentAdjustmentAmount: proposal558.proposedAmount,
                rentAdjustmentReminderDate: newReminder,
            });
            if (updated) setTenancy(updated);
        } finally {
            setIsResolving(null);
        }
    };

    const acceptRenovation = async () => {
        if (!tenancy || !proposal559) return;
        setIsResolving('renovation');
        try {
            const amount = proposal559.proposedAmount;
            const newColdRent = (tenancy.coldRent ?? 0) + amount;
            const effectiveDate = tenancy.renovationAdjustmentEndDate ?? tenancy.renovationAdjustmentStartDate ?? format(new Date(), 'yyyy-MM-dd');
            const updated = await updateTenancy(tenancy.tenancyId, {
                coldRent: newColdRent,
                renovationAdjustmentStartDate: null,
                renovationAdjustmentEndDate: null,
                renovationAdjustmentAmount: null,
                renovationAdjustmentReminderDate: null,
                renovationAdjustmentPlanned: false,
            });
            const created = await addAdjustmentHistoryEntry({
                tenancyId: tenancy.tenancyId,
                propertyId: tenancy.propertyId,
                adjustmentType: 'renovation',
                effectiveDate,
                amount,
                note: 'Sanierungsanpassung übernommen',
            });
            if (updated) setTenancy(updated);
            if (created) setHistoryEntries((prev) => [created, ...prev]);
        } finally {
            setIsResolving(null);
        }
    };

    const declineRenovation = async () => {
        if (!tenancy) return;
        setIsResolving('renovation');
        try {
            const updated = await updateTenancy(tenancy.tenancyId, {
                renovationAdjustmentStartDate: null,
                renovationAdjustmentEndDate: null,
                renovationAdjustmentAmount: null,
                renovationAdjustmentReminderDate: null,
                renovationAdjustmentPlanned: false,
            });
            if (updated) setTenancy(updated);
        } finally {
            setIsResolving(null);
        }
    };

    const deferRenovationToNextMonth = async () => {
        if (!tenancy || !proposal559) return;
        setIsResolving('renovation');
        try {
            const currentStart = tenancy.renovationAdjustmentStartDate ?? format(new Date(), 'yyyy-MM-dd');
            const currentEnd = tenancy.renovationAdjustmentEndDate ?? null;
            const currentReminder = tenancy.renovationAdjustmentReminderDate ?? null;
            const newStart = format(addDays(parseISO(currentStart), 30), 'yyyy-MM-dd');
            const shift = dayDiff(currentStart, newStart);
            const newEnd = currentEnd ? format(addDays(parseISO(currentEnd), shift), 'yyyy-MM-dd') : null;
            const newReminder = currentReminder ? format(addDays(parseISO(currentReminder), shift), 'yyyy-MM-dd') : null;
            const updated = await updateTenancy(tenancy.tenancyId, {
                renovationAdjustmentStartDate: newStart,
                renovationAdjustmentEndDate: newEnd,
                renovationAdjustmentAmount: proposal559.proposedAmount,
                renovationAdjustmentReminderDate: newReminder,
            });
            if (updated) setTenancy(updated);
        } finally {
            setIsResolving(null);
        }
    };

    const setManualRentAmount = async (amount: number | null) => {
        if (!tenancy) return;
        const updated = await updateTenancy(tenancy.tenancyId, { nextRentAdjustmentAmount: amount });
        if (updated) setTenancy(updated);
    };

    const setManualRenovationAmount = async (amount: number | null) => {
        if (!tenancy) return;
        const updated = await updateTenancy(tenancy.tenancyId, { renovationAdjustmentAmount: amount });
        if (updated) setTenancy(updated);
    };

    const updateBasisField = async (field: 'rentIndexPerM2' | 'rentIncreaseIntervalMonths' | 'plannedRenovationCost', value: number | null) => {
        if (!tenancy) return;
        const updated = await updateTenancy(tenancy.tenancyId, { [field]: value });
        if (updated) setTenancy(updated);
    };

    return {
        property, unit, hasMultipleUnits, tenancy, historyEntries, isLoading, isResolving, refresh,
        proposal558, proposal559,
        acceptRent, declineRent, deferRentToNextMonth, setManualRentAmount,
        acceptRenovation, declineRenovation, deferRenovationToNextMonth, setManualRenovationAmount,
        updateBasisField,
    };
}
