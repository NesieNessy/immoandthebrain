"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { buildPropertyUseCaseBreadcrumb, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import {
    Button,
    CalendarField,
    ConfirmDeleteModal,
    Dropdown,
    Header,
    Icons,
    Modal,
    NumberField,
    PAGE_CONTAINER_CLASS,
    SectionLabel,
    Table,
    TextField,
    type MenuItem,
    type TableColumn,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { deCurrencyFormatter } from '@/lib/utils';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { format, parseISO } from 'date-fns';
import { MEASURE_CATEGORIES } from './measureCategories';
import { EMPTY_NEW_MEASURE, useRenovationMeasuresData, type NewMeasureForm } from './useRenovationMeasuresData';

const CATEGORY_OPTIONS = [{ value: '', label: 'Bitte wählen...' }, ...MEASURE_CATEGORIES];

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

function toDate(value: string | null): Date | undefined {
    return value ? parseISO(value) : undefined;
}

function toDateInput(date: Date | undefined): string | null {
    return date ? format(date, 'yyyy-MM-dd') : null;
}

function isLocked(measure: RenovationMeasure): boolean {
    return measure.quoteAccepted;
}

interface MeasureRow extends Record<string, unknown> {
    key: string;
    measure: RenovationMeasure;
}

export default function Contractors({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const data = useRenovationMeasuresData(propertyId);
    const [addOpen, setAddOpen] = useState(false);
    const [newMeasure, setNewMeasure] = useState<NewMeasureForm>(EMPTY_NEW_MEASURE);
    const [isAdding, setIsAdding] = useState(false);

    const openMeasure = (measure: RenovationMeasure) => {
        router.push(`/existing-properties/${propertyId}/contractors/${measure.renovationMeasureId}`);
    };

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const { property, measures } = data;

    const totalEstimated = measures.reduce((sum, m) => sum + (m.estimatedCost ?? 0), 0);
    const quotedMeasures = measures.filter((m) => m.quotedCost != null);
    const totalQuoted = quotedMeasures.reduce((sum, m) => sum + (m.quotedCost ?? 0), 0);
    const deviation = quotedMeasures.reduce((sum, m) => sum + ((m.quotedCost ?? 0) - (m.estimatedCost ?? 0)), 0);

    const openAddModal = () => {
        setNewMeasure(EMPTY_NEW_MEASURE);
        setAddOpen(true);
    };

    const confirmAdd = async () => {
        setIsAdding(true);
        try {
            const ok = await data.addMeasure(newMeasure);
            if (ok) {
                setAddOpen(false);
                setNewMeasure(EMPTY_NEW_MEASURE);
            }
        } finally {
            setIsAdding(false);
        }
    };

    const rowMenuItems = (measure: RenovationMeasure): MenuItem[] => [
        {
            label: 'Öffnen',
            icon: <Icons.Eye className="w-4 h-4" />,
            onClick: () => openMeasure(measure),
        },
        {
            label: BUTTON_DETAILS.Delete.label,
            icon: <BUTTON_DETAILS.Delete.icon className="w-4 h-4" />,
            destructive: true,
            disabled: isLocked(measure),
            onClick: () => data.requestDeleteMeasure(measure),
        },
    ];

    const columns: TableColumn<MeasureRow>[] = [
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
                        aria-label={`${row.measure.title}: Aktionen`}
                        menuItems={rowMenuItems(row.measure)}
                    />
                </div>
            ),
        },
        {
            key: 'title',
            label: 'Maßnahme',
            width: '160px',
            renderCell: (_v, row) => <span className="font-semibold text-foreground">{row.measure.title}</span>,
        },
        {
            key: 'estimatedCost',
            label: 'Kosten veranschl.',
            width: '180px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <NumberField
                        aria-label={`Kosten veranschlagt für ${m.title}`}
                        unit="€"
                        min={0}
                        disabled={isLocked(m)}
                        value={m.estimatedCost ?? ''}
                        onChange={(e) => data.updateLocalField(m.renovationMeasureId, { estimatedCost: e.target.value === '' ? null : Number(e.target.value) })}
                        onBlur={() => void data.persistField(m.renovationMeasureId, { estimatedCost: m.estimatedCost })}
                    />
                );
            },
        },
        {
            key: 'quotedCost',
            label: 'Kosten lt. Angebot',
            width: '180px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <NumberField
                        aria-label={`Kosten laut Angebot für ${m.title}`}
                        unit="€"
                        min={0}
                        disabled={isLocked(m)}
                        value={m.quotedCost ?? ''}
                        onChange={(e) => data.updateLocalField(m.renovationMeasureId, { quotedCost: e.target.value === '' ? null : Number(e.target.value) })}
                        onBlur={() => void data.persistField(m.renovationMeasureId, { quotedCost: m.quotedCost })}
                    />
                );
            },
        },
        {
            key: 'preferredStartDate',
            label: 'Start Wunsch',
            width: '190px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <CalendarField
                        aria-label={`Wunschstart für ${m.title}`}
                        disabled={isLocked(m)}
                        value={toDate(m.preferredStartDate)}
                        onChange={(date) => {
                            const patch = { preferredStartDate: toDateInput(date) };
                            data.updateLocalField(m.renovationMeasureId, patch);
                            void data.persistField(m.renovationMeasureId, patch);
                        }}
                    />
                );
            },
        },
        {
            key: 'quotedStartDate',
            label: 'Start lt. Angebot',
            width: '190px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <CalendarField
                        aria-label={`Start laut Angebot für ${m.title}`}
                        disabled={isLocked(m)}
                        value={toDate(m.quotedStartDate)}
                        onChange={(date) => {
                            const patch = { quotedStartDate: toDateInput(date) };
                            data.updateLocalField(m.renovationMeasureId, patch);
                            void data.persistField(m.renovationMeasureId, patch);
                        }}
                    />
                );
            },
        },
        {
            key: 'actualCompletionDate',
            label: 'Abschluss ist',
            width: '190px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <CalendarField
                        aria-label={`Tatsächlicher Abschluss für ${m.title}`}
                        value={toDate(m.actualCompletionDate)}
                        onChange={(date) => {
                            const next = toDateInput(date);
                            // Clearing the completion date can't leave a stale
                            // customer confirmation behind it.
                            const patch = next ? { actualCompletionDate: next } : { actualCompletionDate: next, customerConfirmedCompleted: false };
                            data.updateLocalField(m.renovationMeasureId, patch);
                            void data.persistField(m.renovationMeasureId, patch);
                        }}
                    />
                );
            },
        },
        {
            key: 'published',
            label: 'Veröffentlichen',
            width: '170px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                return m.published ? (
                    <Button label="Veröffentlicht" size="sm" variant="outline" icon={<Icons.Check className="w-4 h-4" />} disabled={isLocked(m)} onClick={() => data.togglePublished(m)} />
                ) : (
                    <Button label={BUTTON_DETAILS.Publish.label} size="sm" variant="primary" icon={<BUTTON_DETAILS.Publish.icon className="w-4 h-4" />} disabled={isLocked(m)} onClick={() => data.togglePublished(m)} />
                );
            },
        },
        {
            key: 'quoteReceived',
            label: 'Angebot',
            width: '100px',
            align: 'center',
            renderCell: (_v, row) => {
                const received = row.measure.quotedCost != null;
                return received
                    ? <Icons.CheckCircle2 className="w-5 h-5 text-success mx-auto" aria-label="Angebot erhalten" />
                    : <span className="block w-5 h-5 mx-auto rounded-full border-2 border-border" aria-label="Kein Angebot erhalten" />;
            },
        },
        {
            key: 'quoteAccepted',
            label: 'Beauftragt',
            width: '100px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <button
                        type="button"
                        onClick={() => data.toggleQuoteAccepted(m)}
                        aria-pressed={m.quoteAccepted}
                        aria-label={m.quoteAccepted ? `${m.title} als nicht beauftragt markieren` : `${m.title} als beauftragt markieren`}
                        className="mx-auto flex items-center justify-center cursor-pointer"
                    >
                        {m.quoteAccepted
                            ? <Icons.CheckCircle2 className="w-5 h-5 text-success" />
                            : <span className="block w-5 h-5 rounded-full border-2 border-border hover:border-primary transition-colors" />}
                    </button>
                );
            },
        },
        {
            key: 'customerConfirmedCompleted',
            label: 'Abgeschlossen',
            width: '120px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                const canConfirm = m.craftsmanConfirmedCompleted;
                return (
                    <button
                        type="button"
                        onClick={() => data.toggleCustomerConfirmed(m)}
                        disabled={!canConfirm}
                        aria-pressed={m.customerConfirmedCompleted}
                        aria-label={m.customerConfirmedCompleted ? `${m.title} als nicht abgeschlossen markieren` : `${m.title} als abgeschlossen bestätigen`}
                        title={!canConfirm ? 'Bitte zuerst „Handwerker bestätigt" in der Detailansicht setzen' : undefined}
                        className="mx-auto flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {m.customerConfirmedCompleted
                            ? <Icons.CheckCircle2 className="w-5 h-5 text-success" />
                            : <span className="block w-5 h-5 rounded-full border-2 border-border hover:border-primary transition-colors" />}
                    </button>
                );
            },
        },
    ];

    const tableData: MeasureRow[] = measures.map((measure) => ({ key: String(measure.renovationMeasureId), measure }));

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(property, propertyId, ExistingPropertiesUseCases.Contractors)}
                />

                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                        <SectionLabel>Übersicht</SectionLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Maßnahmen gesamt</p>
                                <p className="mt-2 text-2xl font-semibold text-foreground">{measures.length}</p>
                            </div>
                            <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Kosten veranschlagt</p>
                                <p className="mt-2 text-2xl font-semibold text-foreground">{euro(totalEstimated)}</p>
                            </div>
                            <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Kosten lt. Angebot</p>
                                <p className="mt-2 text-2xl font-semibold text-primary">{quotedMeasures.length > 0 ? euro(totalQuoted) : '–'}</p>
                            </div>
                            <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Abweichung</p>
                                <p className={`mt-2 text-2xl font-semibold ${quotedMeasures.length === 0 ? 'text-foreground' : deviation > 0 ? 'text-warning' : deviation < 0 ? 'text-success' : 'text-foreground'}`}>
                                    {quotedMeasures.length === 0 ? '–' : `${deviation > 0 ? '+' : ''}${euro(deviation)}`}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Maßnahmen</SectionLabel>
                        <div className="mt-3 flex justify-end">
                            <Button label="Maßnahme hinzufügen" icon={<Icons.Plus className="w-4 h-4" />} variant="outline" size="sm" onClick={openAddModal} />
                        </div>
                        <div className="mt-3">
                            <Table
                                columns={columns}
                                data={tableData}
                                emptyMessage="Noch keine Sanierungsmaßnahmen erfasst."
                                footerLeft={`${measures.length} Einträge`}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card">
                        <span className="text-sm text-muted-foreground">Gesamtkosten veranschlagt</span>
                        <span className="flex items-center gap-2">
                            {quotedMeasures.length > 0 && (
                                <span className={`inline-flex items-center gap-1 text-sm ${deviation > 0 ? 'text-warning' : deviation < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                    {deviation !== 0 && (deviation > 0 ? <Icons.TrendingUp className="w-3.5 h-3.5" /> : <Icons.TrendingDown className="w-3.5 h-3.5" />)}
                                    {deviation > 0 ? '+' : ''}{euro(deviation)} über Angebot
                                </span>
                            )}
                            <span className="text-lg font-semibold text-foreground">{euro(totalEstimated)}</span>
                        </span>
                    </div>
                </div>
            </main>

            <Modal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                title="Maßnahme hinzufügen"
                icon={<Icons.Plus className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={() => setAddOpen(false)} />
                        <Button
                            label="Hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="primary"
                            disabled={newMeasure.title.trim() === '' || isAdding}
                            onClick={() => void confirmAdd()}
                        />
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <TextField
                        label="Maßnahme"
                        placeholder="z.B. Fußboden"
                        value={newMeasure.title}
                        onChange={(e) => setNewMeasure((prev) => ({ ...prev, title: e.target.value }))}
                    />
                    <Dropdown
                        label="Kategorie"
                        optional
                        options={CATEGORY_OPTIONS}
                        value={newMeasure.category}
                        onChange={(e) => setNewMeasure((prev) => ({ ...prev, category: e.target.value }))}
                    />
                    <NumberField
                        label="Kosten veranschlagt"
                        optional
                        unit="€"
                        min={0}
                        value={newMeasure.estimatedCost}
                        onChange={(e) => setNewMeasure((prev) => ({ ...prev, estimatedCost: e.target.value }))}
                    />
                    <CalendarField
                        label="Start Wunsch"
                        optional
                        value={newMeasure.preferredStartDate}
                        onChange={(date) => setNewMeasure((prev) => ({ ...prev, preferredStartDate: date }))}
                    />
                </div>
            </Modal>

            <ConfirmDeleteModal
                open={data.measurePendingDelete !== null}
                onCancel={data.cancelDeleteMeasure}
                onConfirm={() => void data.confirmDeleteMeasure()}
                title="Maßnahme löschen?"
                confirmDisabled={data.isDeleting}
            >
                <p className="text-sm text-muted-foreground">
                    {data.measurePendingDelete ? `„${data.measurePendingDelete.title}" wird unwiderruflich gelöscht.` : ''}
                </p>
            </ConfirmDeleteModal>
        </div>
    );
}
