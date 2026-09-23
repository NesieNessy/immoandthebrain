"use client";
import { useCallback, useEffect, useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, PAGE_CONTAINER_CLASS, Table, Tag, type TableColumn } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getAggregatedSettlementData } from '@/lib/supabase/settlementAggregate.supabase';
import { getCurrentTenancyByUnit } from '@/lib/supabase/tenancy.supabase';
import { getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { computeUnitSettlementSummary, type CoverageDirection } from '@/lib/serviceCharge/settlementMath';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';

import { euro } from '../tenant-data/useTenantUnitData';
import { ServiceChargeSettlementView } from './ServiceChargeSettlementView';

interface UnitRow {
    unit: PropertyUnit;
    /** null = no settlement recorded yet for this unit, or it has no current
     *  tenancy to compare a prepayment against. */
    annualPrepayment: number | null;
    overUnderCoverage: number | null;
    settlementCoverage: CoverageDirection | null;
}

// Settlements are per unit, not shared across a building — each row loads
// its own settlement + cost items instead of every unit reusing the same
// property-wide fetch (the old behavior, which meant every unit's Anteil
// Wohnung/coverage figures here were actually just whichever unit the
// shared cost items happened to have been entered for).
async function loadUnitRow(propertyId: number, unit: PropertyUnit): Promise<UnitRow> {
    const { settlement, costItems } = await getAggregatedSettlementData(propertyId, unit.propertyUnitId);
    if (!settlement) return { unit, annualPrepayment: null, overUnderCoverage: null, settlementCoverage: null };

    const tenancy = await getCurrentTenancyByUnit(unit.propertyUnitId);
    if (!tenancy) return { unit, annualPrepayment: null, overUnderCoverage: null, settlementCoverage: null };

    const history = await getAdjustmentHistoryByTenancy(tenancy.tenancyId);
    const miscRentHistory = history
        .filter((entry): entry is typeof entry & { effectiveDate: string; amount: number } =>
            entry.adjustmentType === 'miscRent' && entry.effectiveDate != null && entry.amount != null)
        .map((entry) => ({ effectiveDate: entry.effectiveDate, amount: entry.amount }));

    const summary = computeUnitSettlementSummary({
        costItems: costItems.map((item) => ({
            actualAmount: item.actualAmount,
            budgetAmount: item.budgetAmount,
            allocable: item.allocable,
            actualShareOverride: item.actualShareOverride,
            budgetShareOverride: item.budgetShareOverride,
        })),
        unitLivingAreaM2: unit.livingAreaM2,
        totalLivingAreaM2: unit.livingAreaM2 ?? 0,
        currentMonthlyPrepayment: tenancy.miscRent ?? 0,
        miscRentHistory,
        periodStart: new Date(settlement.periodStart),
        periodEnd: new Date(settlement.periodEnd),
        tenancyStart: tenancy.tenancyStartDate ? new Date(tenancy.tenancyStartDate) : null,
        tenancyEnd: tenancy.tenancyEndDate ? new Date(tenancy.tenancyEndDate) : null,
    });

    return {
        unit,
        annualPrepayment: summary.annualPrepayment,
        overUnderCoverage: summary.overUnderCoverage,
        settlementCoverage: summary.settlementCoverage,
    };
}

export default function ServiceChargeSettlement({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const load = useCallback(async () => {
        const id = parseInt(propertyId, 10);
        const [foundProperty, foundUnits] = await Promise.all([
            getPropertyById(id),
            getPropertyUnitsByProperty(id),
        ]);
        setProperty(foundProperty);
        setUnits(foundUnits);

        if (foundUnits.length > 1) {
            const rows = await Promise.all(foundUnits.map((unit) => loadUnitRow(id, unit)));
            setUnitRows(rows);
        }
        setIsLoading(false);
    }, [propertyId]);

    useEffect(() => {
        void load();
    }, [load]);


    if (isLoading) return <PropertyLoadingPage />;
    if (!property) return <PropertyNotFoundPage />;

    // Exactly one unit — skip the picker and go straight to it. The
    // settlement's cost data is property-wide either way (see the data hook);
    // this just decides whether a unit-picker step is needed first.
    if (units.length <= 1) {
        const unit = units[0];
        if (!unit) return <PropertyNotFoundPage />;
        return <ServiceChargeSettlementView propertyId={propertyId} property={property} unit={unit} hasMultipleUnits={false} />;
    }

    const columns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'unitLabel',
            label: 'Einheit',
            width: '32%',
            sortable: true,
            renderCell: (v) => <span className="font-medium text-foreground">{String(v)}</span>,
        },
        {
            key: 'livingAreaM2',
            label: 'Wohnfläche',
            sortable: true,
            align: 'right',
            renderCell: (v) => v != null ? `${v} m²` : '–',
        },
        {
            key: 'annualPrepayment',
            label: 'Vorauszahlung Mieter',
            sortable: true,
            align: 'right',
            renderCell: (v) => v != null ? euro(v as number) : '–',
        },
        {
            key: 'overUnderCoverage',
            label: 'Nachzahlung / Guthaben',
            sortable: true,
            align: 'right',
            renderCell: (_v, row) => {
                const coverage = row.overUnderCoverage as number | null;
                const direction = row.settlementCoverage as CoverageDirection | null;
                if (coverage == null || direction == null) return <span className="text-muted-foreground">Keine Abrechnung</span>;
                if (direction === 'balanced') return <Tag label="Ausgeglichen" variant="muted" />;
                const label = direction === 'shortfall' ? `Nachzahlung ${euro(Math.abs(coverage))}` : `Guthaben ${euro(Math.abs(coverage))}`;
                return <Tag label={label} variant={direction === 'shortfall' ? 'warning' : 'success'} />;
            },
        },
    ];

    const tableData = units.map((unit) => {
        const row = unitRows.find((r) => r.unit.propertyUnitId === unit.propertyUnitId);
        return {
            propertyUnitId: unit.propertyUnitId,
            unitLabel: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
            livingAreaM2: unit.livingAreaM2,
            annualPrepayment: row?.annualPrepayment ?? null,
            overUnderCoverage: row?.overUnderCoverage ?? null,
            settlementCoverage: row?.settlementCoverage ?? null,
        };
    });

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.ServiceChargeSettlement)}
                />

                <div>
                    <Table
                        columns={columns}
                        data={tableData}
                        onRowClick={(row) => router.push(`/existing-properties/${propertyId}/service-charge-settlement/${row.propertyUnitId}`)}
                        footerLeft={`${tableData.length} Einträge`}
                    />
                </div>
            </main>
        </div>
    );
}
