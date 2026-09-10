"use client";
import { useCallback, useEffect, useState } from 'react';

import { BESTANDSOBJEKTE_BREADCRUMB_ROOT, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Button, Header, Icons, PAGE_CONTAINER_CLASS, Table, Tag, TextFieldWithIcon, type SortDirection, type TableColumn } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit } from '@/lib/supabase/tenancy.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';

import PropertyHub from './PropertyHub';

type UnitStatus = 'Vermietet' | 'Unvermietet';

interface UnitRow {
    unit: PropertyUnit;
    tenantName: string;
    moveInDate: string | null;
    coldRent: number | null;
    status: UnitStatus;
}

const STATUS_FILTER_OPTIONS = [
    { value: 'Vermietet', label: 'Vermietet' },
    { value: 'Unvermietet', label: 'Unvermietet' },
];

async function loadUnitRow(unit: PropertyUnit): Promise<UnitRow> {
    const tenancy = await getCurrentTenancyByUnit(unit.propertyUnitId);
    if (!tenancy) {
        return { unit, tenantName: '–', moveInDate: null, coldRent: null, status: 'Unvermietet' };
    }

    const persons = await getTenancyPersonsByTenancy(tenancy.tenancyId);
    const primary = persons.find((p) => p.isPrimary) ?? persons[0];
    const others = persons.filter((p) => p !== primary);
    const tenantName = primary
        ? `${primary.lastName ?? ''}, ${[primary.firstName, ...others.map((p) => p.firstName)].filter(Boolean).join(' & ')}`.trim()
        : '–';

    return {
        unit,
        tenantName: tenantName || '–',
        moveInDate: primary?.moveInDate ?? null,
        coldRent: tenancy.coldRent,
        status: 'Vermietet',
    };
}

/**
 * Entry point for a property. With exactly one unit it goes straight into
 * that unit's hub — there's no picking to do. With several, it shows the
 * units table first so the whole hub (Mieterdaten, Mietvertrag,
 * Nebenkostenabrechnung, …) can be entered already scoped to one unit.
 * With none yet, it falls through to the hub in property-only mode so
 * "Neue Einheit" is still reachable.
 */
export default function PropertyEntry({ propertyId }: { propertyId: string }) {
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

    // Exactly one unit — no picking needed, go straight to its hub.
    useEffect(() => {
        if (!isLoading && units.length === 1) {
            router.replace(`/existing-properties/${propertyId}/${units[0].propertyUnitId}`);
        }
    }, [isLoading, units, propertyId, router]);

    if (isLoading || (!isLoading && units.length === 1)) return <PropertyLoadingPage />;

    if (!property) return <PropertyNotFoundPage />;

    // No units yet — show the hub in property-only mode so setup actions
    // (Objektdaten, Neue Einheit, …) stay reachable.
    if (units.length === 0) {
        return <PropertyHub propertyId={propertyId} unitId={null} />;
    }

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

    const tableData = (() => {
        const raw = unitRows.map((row) => ({
            propertyUnitId: row.unit.propertyUnitId,
            unitLabel: formatUnitLabel(row.unit.unitLabel, row.unit.floor, row.unit.locationNote),
            tenantName: row.tenantName,
            moveInDate: row.moveInDate,
            coldRent: row.coldRent,
            status: row.status,
        }));

        const query = search.trim().toLowerCase();
        let filtered = query
            ? raw.filter((row) => `${row.unitLabel} ${row.tenantName}`.toLowerCase().includes(query))
            : raw;

        for (const [key, val] of Object.entries(columnFilters)) {
            if (!val) continue;
            const lower = val.toLowerCase();
            filtered = filtered.filter((row) =>
                String(row[key as keyof typeof row] ?? '').toLowerCase().includes(lower)
            );
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
            width: '28%',
            sortable: true,
            filterable: true,
            renderCell: (v) => <span className="font-medium text-foreground">{String(v)}</span>,
        },
        {
            key: 'tenantName',
            label: 'Aktueller Mieter',
            width: '28%',
            sortable: true,
            filterable: true,
        },
        {
            key: 'moveInDate',
            label: 'Einzug',
            sortable: true,
            filterable: true,
            renderCell: (v) => formatDeDate(v as string | null),
        },
        {
            key: 'coldRent',
            label: 'Nettomiete',
            sortable: true,
            filterable: true,
            renderCell: (v) => v != null ? `${deCurrencyFormatter.format(v as number)} €` : '–',
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
                    items={[
                        BESTANDSOBJEKTE_BREADCRUMB_ROOT,
                        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}` },
                    ]}                />

                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="max-w-sm flex-1 min-w-[220px]">
                            <TextFieldWithIcon
                                type="search"
                                icon={Icons.Search}
                                placeholder="Einheiten durchsuchen"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button
                            label="Einheit hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="primary"
                            hideLabelOnMobile
                            onClick={() => router.push(`/existing-properties/${propertyId}/tenant-data/new`)}
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
                        onRowClick={(row) => router.push(`/existing-properties/${propertyId}/${row.propertyUnitId}`)}
                        footerLeft={`${tableData.length} Einheiten`}
                        pageSize={10}
                    />
                </div>
            </main>
        </div>
    );
}
