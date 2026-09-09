"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, Header, Icons, Modal, PAGE_CONTAINER_CLASS, Table, TextFieldWithIcon, type BreadcrumbItem, type MenuItem, type TableColumn } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { deleteTenancy, getCurrentTenancyByUnit, getTenanciesByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { deleteTenancyDocument, getTenancyDocumentsByTenancy, getTenancyDocumentUrl } from '@/lib/supabase/tenancy_document.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit, Tenancy, TenancyDocument, TenancyPerson } from '@immoandthebrain/types';
import { differenceInCalendarMonths, format } from 'date-fns';
import { Circle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { euro } from '../tenant-data/useTenantUnitData';

interface HistoryRow {
    tenancy: Tenancy;
    primary: TenancyPerson | undefined;
    others: TenancyPerson[];
    rentStart: number | null;
    rentEnd: number | null;
    documents: TenancyDocument[];
}

const BOOLEAN_FILTER_OPTIONS = [
    { value: 'true', label: 'Erledigt' },
    { value: 'false', label: 'Offen' },
];

function personName(p: TenancyPerson | undefined): string {
    if (!p) return '–';
    return `${p.lastName ?? ''}, ${p.firstName ?? ''}`.trim();
}

function formatDuration(start: string | null, end: string | null): string {
    if (!start || !end) return '–';
    const totalMonths = differenceInCalendarMonths(new Date(end), new Date(start));
    if (totalMonths < 0) return '–';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return years > 0 ? `${years} J. ${months} Mo.` : `${months} Mo.`;
}

async function loadHistoryRow(tenancy: Tenancy): Promise<HistoryRow> {
    const [persons, history, documents] = await Promise.all([
        getTenancyPersonsByTenancy(tenancy.tenancyId),
        getAdjustmentHistoryByTenancy(tenancy.tenancyId),
        getTenancyDocumentsByTenancy(tenancy.tenancyId),
    ]);
    const primary = persons.find((p) => p.isPrimary) ?? persons[0];
    const others = persons.filter((p) => p !== primary);
    const rentIncrease = history
        .filter((h) => h.adjustmentType === 'rent')
        .reduce((sum, h) => sum + (h.amount ?? 0), 0);
    const rentEnd = tenancy.coldRent;
    const rentStart = rentEnd != null ? rentEnd - rentIncrease : null;
    return { tenancy, primary, others, rentStart, rentEnd, documents };
}

interface UnitHistoryTableProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
}

export function UnitHistoryTable({ propertyId, property, unit, hasMultipleUnits }: UnitHistoryTableProps) {
    const router = useRouter();
    const [rows, setRows] = useState<HistoryRow[] | null>(null);
    const [search, setSearch] = useState('');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [reactivateRow, setReactivateRow] = useState<HistoryRow | null>(null);
    const [isReactivating, setIsReactivating] = useState(false);
    const [deleteRow, setDeleteRow] = useState<HistoryRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const load = useCallback(async () => {
        const [current, all] = await Promise.all([
            getCurrentTenancyByUnit(unit.propertyUnitId),
            getTenanciesByUnit(unit.propertyUnitId),
        ]);
        const past = all
            .filter((t) => t.tenancyId !== current?.tenancyId)
            .sort((a, b) => (b.tenancyStartDate ?? '').localeCompare(a.tenancyStartDate ?? ''));
        const loaded = await Promise.all(past.map(loadHistoryRow));
        setRows(loaded);
    }, [unit.propertyUnitId]);

    useEffect(() => {
        void load();
    }, [load]);

    const currentTenantHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;

    const breadcrumbItems: BreadcrumbItem[] = hasMultipleUnits
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
            { label: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote), href: currentTenantHref },
            { label: 'Mieterhistorie' },
        ]
        : [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
            { label: 'Mieterhistorie' },
        ];

    const handleColumnFilterChange = (key: string, value: string) => {
        setColumnFilters((prev) => ({ ...prev, [key]: value }));
    };

    const filteredRows = useMemo(() => {
        if (!rows) return [];
        const q = search.trim().toLowerCase();
        let filtered = q
            ? rows.filter((r) => [personName(r.primary), ...r.others.map(personName)].join(' ').toLowerCase().includes(q))
            : rows;

        for (const [key, val] of Object.entries(columnFilters)) {
            if (!val) continue;
            const lower = val.toLowerCase();
            filtered = filtered.filter((r) => {
                switch (key) {
                    case 'mieter':
                        return [personName(r.primary), ...r.others.map(personName)].join(' ').toLowerCase().includes(lower);
                    case 'einzug':
                        return formatDeDate(r.tenancy.tenancyStartDate).toLowerCase().includes(lower);
                    case 'auszug':
                        return formatDeDate(r.tenancy.tenancyEndDate).toLowerCase().includes(lower);
                    case 'abnahmeprotokoll':
                        return String(Boolean(r.tenancy.acceptanceProtocol)) === val;
                    case 'kautionAusgezahlt':
                        return String(Boolean(r.tenancy.depositPaidOut)) === val;
                    default:
                        return true;
                }
            });
        }
        return filtered;
    }, [rows, search, columnFilters]);

    const handleToggle = async (tenancyId: number, field: 'acceptanceProtocol' | 'depositPaidOut', current: boolean) => {
        setRows((prev) => prev?.map((r) => (r.tenancy.tenancyId === tenancyId ? { ...r, tenancy: { ...r.tenancy, [field]: !current } } : r)) ?? null);
        await updateTenancy(tenancyId, { [field]: !current });
    };

    const handleViewDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Clears the tenancy's move-out so it becomes the unit's current tenancy
    // again — undoes an accidental tenant change/tenant move-out. If another
    // tenancy is currently active on this unit, that one is ended (today)
    // first so the unit doesn't end up with two open-ended tenancies.
    const handleConfirmReactivate = async () => {
        if (!reactivateRow) return;
        setIsReactivating(true);
        try {
            const current = await getCurrentTenancyByUnit(unit.propertyUnitId);
            if (current && current.tenancyId !== reactivateRow.tenancy.tenancyId) {
                await updateTenancy(current.tenancyId, { tenancyEndDate: format(new Date(), 'yyyy-MM-dd') });
            }
            await updateTenancy(reactivateRow.tenancy.tenancyId, { tenancyEndDate: null, isRented: true });
            setReactivateRow(null);
            await load();
        } finally {
            setIsReactivating(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteRow) return;
        setIsDeleting(true);
        try {
            await Promise.all(deleteRow.documents.map((doc) => deleteTenancyDocument(doc.tenancyDocumentId, doc.storagePath)));
            await deleteTenancy(deleteRow.tenancy.tenancyId);
            setDeleteRow(null);
            await load();
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleCell = (tenancyId: number, field: 'acceptanceProtocol' | 'depositPaidOut', value: boolean) => (
        <button
            type="button"
            onClick={() => void handleToggle(tenancyId, field, value)}
            aria-label={value ? 'Als offen markieren' : 'Als erledigt markieren'}
            className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted/50 transition-colors cursor-pointer"
        >
            {value ? <Icons.CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
        </button>
    );

    const rowMenuItems = (row: HistoryRow): MenuItem[] => [
        {
            label: 'Ansehen',
            icon: <Icons.Eye className="w-4 h-4" />,
            onClick: () => router.push(`/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}/${row.tenancy.tenancyId}`),
        },
        {
            label: 'Reaktivieren',
            icon: <RotateCcw className="w-4 h-4" />,
            onClick: () => setReactivateRow(row),
        },
        {
            label: BUTTON_DETAILS.Delete.label,
            icon: <Icons.Trash2 className="w-4 h-4" />,
            destructive: true,
            onClick: () => setDeleteRow(row),
        },
    ];

    const columns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'actions',
            label: '',
            width: '48px',
            renderCell: (_v, row) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <Button
                        iconOnly
                        icon={<Icons.MoreVertical className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        menuItems={rowMenuItems(row.historyRow as HistoryRow)}
                    />
                </div>
            ),
        },
        {
            key: 'mieter',
            label: 'Mieter',
            filterable: true,
            renderCell: (_v, row) => {
                const r = row.historyRow as HistoryRow;
                return (
                    <div>
                        <div className="font-medium text-foreground">{personName(r.primary)}</div>
                        {r.others.map((p) => (
                            <div key={p.tenancyPersonId} className="text-xs text-muted-foreground">→ {personName(p)}</div>
                        ))}
                    </div>
                );
            },
        },
        {
            key: 'einzug',
            label: 'Einzug',
            filterable: true,
            renderCell: (_v, row) => formatDeDate((row.historyRow as HistoryRow).tenancy.tenancyStartDate),
        },
        {
            key: 'auszug',
            label: 'Auszug',
            filterable: true,
            renderCell: (_v, row) => formatDeDate((row.historyRow as HistoryRow).tenancy.tenancyEndDate),
        },
        {
            key: 'mietdauer',
            label: 'Mietdauer',
            renderCell: (_v, row) => {
                const t = (row.historyRow as HistoryRow).tenancy;
                return formatDuration(t.tenancyStartDate, t.tenancyEndDate);
            },
        },
        {
            key: 'mieteBeginn',
            label: 'Miete Beginn',
            renderCell: (_v, row) => euro((row.historyRow as HistoryRow).rentStart),
        },
        {
            key: 'mieteEnde',
            label: 'Miete Ende',
            renderCell: (_v, row) => euro((row.historyRow as HistoryRow).rentEnd),
        },
        {
            key: 'abnahmeprotokoll',
            label: 'Abnahmeprotokoll',
            align: 'center',
            filterable: true,
            filterOptions: BOOLEAN_FILTER_OPTIONS,
            renderCell: (_v, row) => {
                const t = (row.historyRow as HistoryRow).tenancy;
                return toggleCell(t.tenancyId, 'acceptanceProtocol', Boolean(t.acceptanceProtocol));
            },
        },
        {
            key: 'kautionAusgezahlt',
            label: 'Kaution ausgezahlt',
            align: 'center',
            filterable: true,
            filterOptions: BOOLEAN_FILTER_OPTIONS,
            renderCell: (_v, row) => {
                const t = (row.historyRow as HistoryRow).tenancy;
                return toggleCell(t.tenancyId, 'depositPaidOut', Boolean(t.depositPaidOut));
            },
        },
        {
            key: 'unterlagen',
            label: 'Unterlagen',
            renderCell: (_v, row) => {
                const docs = (row.historyRow as HistoryRow).documents;
                if (docs.length === 0) return <span className="text-xs text-muted-foreground">–</span>;
                return (
                    <div className="flex flex-col gap-1">
                        {docs.map((doc) => (
                            <button
                                key={doc.tenancyDocumentId}
                                type="button"
                                onClick={() => void handleViewDocument(doc)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer text-left"
                            >
                                <Icons.FileText className="w-3 h-3 shrink-0" />
                                {doc.documentType}
                            </button>
                        ))}
                    </div>
                );
            },
        },
    ];

    const tableData = filteredRows.map((r) => ({ historyRow: r }));

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={breadcrumbItems}
                />

                <div className="space-y-3">
                    <div className="max-w-sm">
                        <TextFieldWithIcon
                            type="search"
                            icon={Icons.Search}
                            placeholder="Mieterhistorie durchsuchen"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <Table
                        columns={columns}
                        data={tableData}
                        columnFilters={columnFilters}
                        onColumnFilterChange={handleColumnFilterChange}
                        emptyMessage="Für diese Wohneinheit liegt noch keine Mieterhistorie vor."
                        footerLeft={`${tableData.length} Einträge`}
                        pageSize={10}
                    />
                </div>
            </main>

            <Modal
                open={reactivateRow !== null}
                onClose={() => setReactivateRow(null)}
                title="Mietverhältnis reaktivieren?"
                icon={<RotateCcw />}
                footer={
                    <>
                        <Button
                            label={BUTTON_DETAILS.Cancel.label}
                            variant="outline"
                            disabled={isReactivating}
                            onClick={() => setReactivateRow(null)}
                        />
                        <Button
                            label="Reaktivieren"
                            variant="primary"
                            disabled={isReactivating}
                            onClick={() => void handleConfirmReactivate()}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    {reactivateRow ? `${personName(reactivateRow.primary)} wird wieder als aktueller Mieter dieser Wohneinheit geführt (Auszug wird entfernt).` : ''}
                    {' '}Ein derzeit aktives Mietverhältnis auf dieser Einheit wird dabei mit dem heutigen Datum als beendet markiert.
                </p>
            </Modal>

            <ConfirmDeleteModal
                open={deleteRow !== null}
                onCancel={() => setDeleteRow(null)}
                onConfirm={() => void handleConfirmDelete()}
                title="Eintrag löschen?"
                confirmDisabled={isDeleting}
            >
                <p className="text-sm text-muted-foreground">
                    {deleteRow
                        ? `Möchtest du den Mieterhistorie-Eintrag von ${personName(deleteRow.primary)} wirklich löschen? Mieterdaten und hinterlegte Unterlagen für dieses Mietverhältnis werden unwiderruflich entfernt.`
                        : ''}
                </p>
            </ConfirmDeleteModal>
        </div>
    );
}
