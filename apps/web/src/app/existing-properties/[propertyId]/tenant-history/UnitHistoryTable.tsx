"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, Header, Icons, Modal, PAGE_CONTAINER_CLASS, Table, TextFieldWithIcon, useToast, type BreadcrumbItem, type MenuItem, type TableColumn } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { getAdjustmentHistoryByTenancy } from '@/lib/supabase/tenancy_adjustment_history.supabase';
import { deleteTenancy, getCurrentTenancyByUnit, getTenanciesByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { findOverlappingTenancy } from '@/lib/tenancy/tenancyOverlap';
import { deleteTenancyDocument, getTenancyDocumentsByTenancy, getTenancyDocumentUrl } from '@/lib/supabase/tenancy_document.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import { formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit, Tenancy, TenancyDocument, TenancyPerson } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { Circle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { euro } from '../tenant-data/useTenantUnitData';
import { formatDuration, personName } from './tenantHistoryFormatting';

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
    const { showToast } = useToast();
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
                    case 'mietdauer':
                        return formatDuration(r.tenancy.tenancyStartDate, r.tenancy.tenancyEndDate).toLowerCase().includes(lower);
                    case 'mieteBeginn':
                        return euro(r.rentStart).toLowerCase().includes(lower);
                    case 'mieteEnde':
                        return euro(r.rentEnd).toLowerCase().includes(lower);
                    case 'unterlagen':
                        return r.documents.some((doc) => doc.documentType.toLowerCase().includes(lower));
                    default:
                        return true;
                }
            });
        }
        return filtered;
    }, [rows, search, columnFilters]);

    const handleViewDocument = async (doc: TenancyDocument) => {
        const url = await getTenancyDocumentUrl(doc.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Clears the tenancy's end date to make it current again, ending today any tenancy
    // that's currently active. An open-ended reactivated tenancy can also overlap other,
    // non-current tenancies, so we simulate the change and check all of them for overlap first.
    const handleConfirmReactivate = async () => {
        if (!reactivateRow) return;
        setIsReactivating(true);
        try {
            const allTenancies = await getTenanciesByUnit(unit.propertyUnitId);
            const current = await getCurrentTenancyByUnit(unit.propertyUnitId);
            const willEndCurrentToday = current != null && current.tenancyId !== reactivateRow.tenancy.tenancyId;
            const todayStr = format(new Date(), 'yyyy-MM-dd');

            const candidateTenancies = allTenancies
                .filter((t): t is Tenancy & { tenancyStartDate: string } => t.tenancyStartDate != null)
                .map((t) => (willEndCurrentToday && t.tenancyId === current!.tenancyId ? { ...t, tenancyEndDate: todayStr } : t));
            const reactivateStart = reactivateRow.tenancy.tenancyStartDate;
            if (!reactivateStart) throw new Error('Dieses Mietverhältnis hat kein Einzugsdatum und kann nicht reaktiviert werden.');
            const overlap = findOverlappingTenancy(candidateTenancies, reactivateStart, null, reactivateRow.tenancy.tenancyId);
            if (overlap) {
                const overlapLabel = `${overlap.tenantFirstName ?? ''} ${overlap.tenantLastName ?? ''}`.trim() || 'ein anderes Mietverhältnis';
                const overlapEndLabel = overlap.tenancyEndDate ? formatDeDate(overlap.tenancyEndDate) : 'laufend';
                throw new Error(`Reaktivieren würde sich mit „${overlapLabel}" (${formatDeDate(overlap.tenancyStartDate)} – ${overlapEndLabel}) überschneiden. Bitte zuerst dessen Zeitraum anpassen.`);
            }

            if (willEndCurrentToday) {
                const endedCurrent = await updateTenancy(current!.tenancyId, { tenancyEndDate: todayStr });
                if (!endedCurrent) throw new Error('updateTenancy failed');
            }
            const reactivated = await updateTenancy(reactivateRow.tenancy.tenancyId, { tenancyEndDate: null, isRented: true });
            if (!reactivated) throw new Error('updateTenancy failed');
            setReactivateRow(null);
            await load();
            showToast('Mietverhältnis reaktiviert.', 'success');
        } catch (err) {
            const message = err instanceof Error && err.message && err.message !== 'updateTenancy failed' ? err.message : 'Mietverhältnis konnte nicht reaktiviert werden.';
            showToast(message, 'error');
        } finally {
            setIsReactivating(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteRow) return;
        setIsDeleting(true);
        try {
            const documentResults = await Promise.all(deleteRow.documents.map((doc) => deleteTenancyDocument(doc.tenancyDocumentId, doc.storagePath)));
            if (documentResults.some((ok) => !ok)) throw new Error('deleteTenancyDocument failed');
            const deleted = await deleteTenancy(deleteRow.tenancy.tenancyId);
            if (!deleted) throw new Error('deleteTenancy failed');
            setDeleteRow(null);
            await load();
            showToast('Mietverhältnis gelöscht.', 'success');
        } catch {
            showToast('Mietverhältnis konnte nicht gelöscht werden.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    // Read-only: reflects actions taken in the Mieterauszug flow (Abnahmeprotokoll
    // erstellen / Mietkaution auflösen), not toggled by hand here.
    const statusIcon = (value: boolean, doneLabel: string, openLabel: string) => (
        <span
            title={value ? doneLabel : openLabel}
            className="inline-flex items-center justify-center p-1"
        >
            {value ? <Icons.CheckCircle2 className="w-4 h-4 text-success" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
        </span>
    );

    const openRow = (row: HistoryRow) => router.push(`/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}/${row.tenancy.tenancyId}`);

    const rowMenuItems = (row: HistoryRow): MenuItem[] => [
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
            filterable: true,
            renderCell: (_v, row) => {
                const t = (row.historyRow as HistoryRow).tenancy;
                return formatDuration(t.tenancyStartDate, t.tenancyEndDate);
            },
        },
        {
            key: 'mieteBeginn',
            label: 'Miete Beginn',
            filterable: true,
            renderCell: (_v, row) => euro((row.historyRow as HistoryRow).rentStart),
        },
        {
            key: 'mieteEnde',
            label: 'Miete Ende',
            filterable: true,
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
                return statusIcon(Boolean(t.acceptanceProtocol), 'Abnahmeprotokoll erstellt', 'Kein Abnahmeprotokoll erstellt');
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
                return statusIcon(Boolean(t.depositPaidOut), 'Mietkaution ausgezahlt', 'Mietkaution noch nicht ausgezahlt');
            },
        },
        {
            key: 'unterlagen',
            label: 'Unterlagen',
            filterable: true,
            renderCell: (_v, row) => {
                const docs = (row.historyRow as HistoryRow).documents;
                if (docs.length === 0) return <span className="text-xs text-muted-foreground">–</span>;
                return (
                    <div className="flex flex-col gap-1">
                        {docs.map((doc) => (
                            <button
                                key={doc.tenancyDocumentId}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleViewDocument(doc); }}
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
                        onRowClick={(row) => openRow(row.historyRow as HistoryRow)}
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
