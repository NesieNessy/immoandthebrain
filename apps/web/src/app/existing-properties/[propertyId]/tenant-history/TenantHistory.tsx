"use client";
import { useCallback, useEffect, useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, PAGE_CONTAINER_CLASS, Table, type TableColumn } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit, getTenanciesByUnit } from '@/lib/supabase/tenancy.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit } from '@immonext/types';
import { useRouter } from 'next/navigation';

import { UnitHistoryTable } from './UnitHistoryTable';

interface UnitRow {
    unit: PropertyUnit;
    entryCount: number;
    lastTenant: string;
    lastMoveOut: string | null;
}

async function loadUnitRow(unit: PropertyUnit): Promise<UnitRow> {
    const [current, all] = await Promise.all([
        getCurrentTenancyByUnit(unit.propertyUnitId),
        getTenanciesByUnit(unit.propertyUnitId),
    ]);
    const past = all
        .filter((t) => t.tenancyId !== current?.tenancyId)
        .sort((a, b) => (b.tenancyStartDate ?? '').localeCompare(a.tenancyStartDate ?? ''));

    const mostRecent = past[0];
    if (!mostRecent) return { unit, entryCount: 0, lastTenant: '–', lastMoveOut: null };

    const persons = await getTenancyPersonsByTenancy(mostRecent.tenancyId);
    const primary = persons.find((p) => p.isPrimary) ?? persons[0];
    const lastTenant = primary ? `${primary.lastName ?? ''}, ${primary.firstName ?? ''}`.trim() : '–';

    return { unit, entryCount: past.length, lastTenant: lastTenant || '–', lastMoveOut: mostRecent.tenancyEndDate };
}

export default function TenantHistory({ propertyId }: { propertyId: string }) {
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
            const rows = await Promise.all(foundUnits.map(loadUnitRow));
            setUnitRows(rows);
        }
        setIsLoading(false);
    }, [propertyId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (isLoading) return <PropertyLoadingPage />;
    if (!property) return <PropertyNotFoundPage />;

    // Exactly one unit — skip the picker and go straight to its history.
    if (units.length <= 1) {
        const unit = units[0];
        if (!unit) return <PropertyNotFoundPage />;
        return <UnitHistoryTable propertyId={propertyId} property={property} unit={unit} hasMultipleUnits={false} />;
    }

    const columns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'unitLabel',
            label: 'Einheit',
            width: '28%',
            sortable: true,
            renderCell: (v) => <span className="font-medium text-foreground">{String(v)}</span>,
        },
        {
            key: 'lastTenant',
            label: 'Letzter Mieter',
            sortable: true,
        },
        {
            key: 'lastMoveOut',
            label: 'Letzter Auszug',
            sortable: true,
            renderCell: (v) => formatDeDate(v as string | null),
        },
        {
            key: 'entryCount',
            label: 'Einträge',
            sortable: true,
            align: 'right',
        },
    ];

    const tableData = unitRows.map((row) => ({
        propertyUnitId: row.unit.propertyUnitId,
        unitLabel: formatUnitLabel(row.unit.unitLabel, row.unit.floor, row.unit.locationNote),
        lastTenant: row.lastTenant,
        lastMoveOut: row.lastMoveOut,
        entryCount: row.entryCount,
    }));

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.TenantHistory)}
                />

                <div>
                    <Table
                        columns={columns}
                        data={tableData}
                        onRowClick={(row) => router.push(`/existing-properties/${propertyId}/tenant-history/${row.propertyUnitId}`)}
                        footerLeft={`${tableData.length} Einträge`}
                    />
                </div>
            </main>
        </div>
    );
}
