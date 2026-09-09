"use client";
import { useCallback, useEffect, useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, Icons, PAGE_CONTAINER_CLASS, Table, Tag, TextFieldWithIcon, type SortDirection, type TableColumn } from '@/components/ui';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit } from '@/lib/supabase/tenancy.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import type { Property, PropertyUnit } from '@immonext/types';
import { useRouter } from 'next/navigation';

import { TenantMoveOutView } from './TenantMoveOutView';

type UnitStatus = 'Vermietet' | 'Unvermietet';

interface UnitRow {
    unit: PropertyUnit;
    tenantName: string;
    status: UnitStatus;
}

const STATUS_FILTER_OPTIONS = [
    { value: 'Vermietet', label: 'Vermietet' },
    { value: 'Unvermietet', label: 'Unvermietet' },
];

async function loadUnitRow(unit: PropertyUnit): Promise<UnitRow> {
    const tenancy = await getCurrentTenancyByUnit(unit.propertyUnitId);
    if (!tenancy) return { unit, tenantName: '–', status: 'Unvermietet' };

    const persons = await getTenancyPersonsByTenancy(tenancy.tenancyId);
    const primary = persons.find((p) => p.isPrimary) ?? persons[0];
    const others = persons.filter((p) => p !== primary);
    const tenantName = primary
        ? `${primary.lastName ?? ''}, ${[primary.firstName, ...others.map((p) => p.firstName)].filter(Boolean).join(' & ')}`.trim()
        : '–';

    return { unit, tenantName: tenantName || '–', status: 'Vermietet' };
}

export default function TenantMoveOut({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null>(null);
    const [units, setUnits] = useState<PropertyUnit[]>([]);
    const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortKey, setSortKey] = useState<string>('unitLabel');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');

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

    useEffect(() => { void load(); }, [load]);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const handleColumnFilterChange = (key: string, value: string) => {
        setColumnFilters((prev) => ({ ...prev, [key]: value }));
    };

    if (isLoading) return <PropertyLoadingPage />;
    if (!property) return <PropertyNotFoundPage />;

    // Exactly one unit — skip the overview and go straight to it.
    if (units.length <= 1) {
        const unit = units[0];
        if (!unit) return <PropertyNotFoundPage />;
        return <TenantMoveOutView propertyId={propertyId} property={property} unit={unit} hasMultipleUnits={false} />;
    }

    const tableData = (() => {
        const raw = unitRows.map((row) => ({
            propertyUnitId: row.unit.propertyUnitId,
            unitLabel: formatUnitLabel(row.unit.unitLabel, row.unit.floor, row.unit.locationNote),
            tenantName: row.tenantName,
            status: row.status,
        }));

        const query = search.trim().toLowerCase();
        let filtered = query
            ? raw.filter((row) => `${row.unitLabel} ${row.tenantName}`.toLowerCase().includes(query))
            : raw;

        for (const [key, val] of Object.entries(columnFilters)) {
            if (!val) continue;
            const lower = val.toLowerCase();
            filtered = filtered.filter((row) => String(row[key as keyof typeof row] ?? '').toLowerCase().includes(lower));
        }

        return [...filtered].sort((a, b) => {
            const av = a[sortKey as keyof typeof a];
            const bv = b[sortKey as keyof typeof a];
            if (av === null || av === undefined) return 1;
            if (bv === null || bv === undefined) return -1;
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    })();

    const columns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'unitLabel',
            label: 'Einheit',
            width: '32%',
            sortable: true,
            filterable: true,
            renderCell: (v) => <span className="font-medium text-foreground">{String(v)}</span>,
        },
        {
            key: 'tenantName',
            label: 'Aktueller Mieter',
            width: '32%',
            sortable: true,
            filterable: true,
        },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            filterable: true,
            filterOptions: STATUS_FILTER_OPTIONS,
            renderCell: (v) => {
                const status = v as UnitStatus;
                return <Tag label={status} variant={status === 'Vermietet' ? 'success' : 'muted'} />;
            },
        },
    ];

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.TenantMoveOut)}
                />

                <div className="space-y-3">
                    <div className="max-w-sm flex-1 min-w-[220px]">
                        <TextFieldWithIcon
                            type="search"
                            icon={Icons.Search}
                            placeholder="Einheiten durchsuchen"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Table
                        columns={columns}
                        data={tableData}
                        sortKey={sortKey}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        columnFilters={columnFilters}
                        onColumnFilterChange={handleColumnFilterChange}
                        onRowClick={(row) => router.push(`/existing-properties/${propertyId}/tenant-move-out/${row.propertyUnitId}`)}
                        footerLeft={`${tableData.length} Einträge`}
                        pageSize={10}
                    />
                </div>
            </main>
        </div>
    );
}
