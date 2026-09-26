"use client";
import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import { FileDropZone } from '@/components/features/FileDropZone';
import { FileLinkList, isImageFileName, type FileLink } from '@/components/features/FileLinkList';
import { FormPanel } from '@/components/features/FormPanel';
import { PriceRangeSlider } from '@/components/features/PriceRangeSlider';
import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { RenovationMeasurePicker } from '@/components/features/RenovationMeasurePicker';
import {
    Button,
    CalendarField,
    Checkbox,
    ConfirmDeleteModal,
    Header,
    Icons,
    NumberField,
    PAGE_CONTAINER_CLASS,
    SectionLabel,
    StatTile,
    Table,
    Tag,
    TextArea,
    type TableColumn,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { categoryLabel, midpoint } from '@/lib/renovation/catalog';
import { deNumberFormatter, formatEuro } from '@/lib/utils';
import type { RenovationMeasure } from '@immoandthebrain/types';
import { format, parseISO } from 'date-fns';
import { MeasureWorkPanel } from './MeasureWorkPanel';
import {
    EMPTY_NEW_MEASURE,
    formFromMeasure,
    measurePriceRange,
    newMeasurePriceRange,
    newMeasureTitle,
    type NewMeasureForm,
} from './measureForm';
import { canConfirmCustomerCompletion, isLocked, summarizeMeasures } from './measureStatus';
import { useRenovationMeasuresData } from './useRenovationMeasuresData';

const EMPTY = <span className="text-muted-foreground">–</span>;

function formatCost(value: number | null) {
    return value == null ? EMPTY : formatEuro(value);
}

function formatDate(value: string | null) {
    return value ? format(parseISO(value), 'dd.MM.yyyy') : EMPTY;
}

/** The last column of both tables: shows whether the row's panel is open. */
function ExpandChevron({ open, what }: { open: boolean; what: string }) {
    return (
        <Icons.ChevronDown
            className={`mx-auto h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            aria-label={open ? `${what} schließen` : `${what} öffnen`}
        />
    );
}

/** Title, category tag and the full description of a measure. */
function MeasureSummary({ measure }: { measure: RenovationMeasure }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5 whitespace-normal">
            <span className="break-words font-semibold text-foreground">{measure.title}</span>
            {measure.category && <span><Tag label={categoryLabel(measure.category)} variant="info" /></span>}
            {/* Free text of any length — wraps and is always shown in full. */}
            {measure.description && <span className="whitespace-pre-line break-words text-muted-foreground">{measure.description}</span>}
        </div>
    );
}

/** Small label/value pairs stacked in one cell (e.g. the costs of a measure). */
function ValueList({ items }: { items: { label: string; value: ReactNode }[] }) {
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 whitespace-nowrap text-sm">
            {items.map((item) => (
                <div key={item.label} className="contents">
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="text-right text-foreground">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

function costItems(measure: RenovationMeasure, range: { min: number; max: number } | null) {
    return [
        { label: 'Indikation', value: range ? `${deNumberFormatter.format(range.min)} – ${formatEuro(range.max)}` : EMPTY },
        { label: 'Veranschlagt', value: formatCost(measure.estimatedCost) },
        { label: 'Lt. Angebot', value: formatCost(measure.quotedCost) },
    ];
}

function dateItems(measure: RenovationMeasure) {
    return [
        { label: 'Start Wunsch', value: formatDate(measure.preferredStartDate) },
        { label: 'Start lt. Angebot', value: formatDate(measure.quotedStartDate) },
        { label: 'Abschluss', value: formatDate(measure.actualCompletionDate) },
    ];
}

interface MeasureRow extends Record<string, unknown> {
    key: string;
    measure: RenovationMeasure;
}

/** What the measure files bucket accepts (renovation-measure-files). */
const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/** A round status mark (✓ when set) — as a button when it can be toggled. */
function StatusMark({ checked, label, disabled, title, onToggle }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    title?: string;
    onToggle?: () => void;
}) {
    const mark = checked
        ? <Icons.CheckCircle2 className="h-5 w-5 text-success" />
        : <span className="block h-5 w-5 rounded-full border-2 border-border transition-colors hover:border-primary" />;
    if (!onToggle) return <span className="mx-auto flex justify-center" role="img" aria-label={label}>{mark}</span>;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={disabled}
            aria-pressed={checked}
            aria-label={label}
            title={title}
            className="mx-auto flex cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
            {mark}
        </button>
    );
}

/**
 * Handwerkerleistungen — everything on one page, like Sanierung: the add/edit
 * form above "Erfasste Maßnahmen", and "Status & Beauftragung" below, where a
 * click on a measure opens its Angebote, Rückfragen and Mängel.
 */
export default function Contractors({ propertyId }: { propertyId: string }) {
    const searchParams = useSearchParams();
    const data = useRenovationMeasuresData(propertyId);
    /** null = form closed; 'new' = "Neue Maßnahme"; a number = editing that measure. */
    const [formTarget, setFormTarget] = useState<'new' | number | null>(null);
    const [form, setForm] = useState<NewMeasureForm>(EMPTY_NEW_MEASURE);
    /** Files chosen in the form — uploaded when it is saved. */
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    /** The measure whose panel is open in "Status & Beauftragung" (?measure=<id> opens one). */
    const [expandedId, setExpandedId] = useState<number | null>(() => {
        const requested = Number(searchParams.get('measure'));
        return Number.isInteger(requested) && requested > 0 ? requested : null;
    });
    /** The measure whose description and Belege are open in "Erfasste Maßnahmen". */
    const [detailsId, setDetailsId] = useState<number | null>(null);
    const formRef = useRef<HTMLDivElement>(null);

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const { property, measures, hasMultipleUnits, contextUnit } = data;
    const { totalEstimated, quotedCount, totalQuoted, deviation } = summarizeMeasures(measures);

    const editing = typeof formTarget === 'number' ? measures.find((m) => m.renovationMeasureId === formTarget) ?? null : null;
    const locked = editing ? isLocked(editing) : false;
    // Same measure as saved → its stored range; a newly chosen one → the catalog's.
    const priceRange = editing && newMeasureTitle(form) === editing.title && form.category === (editing.category ?? '')
        ? measurePriceRange(editing, data.pricingContext)
        : newMeasurePriceRange(form, data.pricingContext);
    const sliderValue = form.estimatedCost !== '' ? Number(form.estimatedCost) : priceRange ? midpoint(priceRange) : 0;

    const setField = (patch: Partial<NewMeasureForm>) => setForm((prev) => ({ ...prev, ...patch }));

    const scrollToForm = () => requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    const resetForm = () => {
        setForm(editing ? formFromMeasure(editing) : EMPTY_NEW_MEASURE);
        setNewFiles([]);
    };

    const openNew = () => {
        setForm(EMPTY_NEW_MEASURE);
        setNewFiles([]);
        setFormTarget('new');
        scrollToForm();
    };

    const openEdit = (measure: RenovationMeasure) => {
        setForm(formFromMeasure(measure));
        setNewFiles([]);
        setFormTarget(measure.renovationMeasureId);
        scrollToForm();
    };

    const closeForm = () => {
        setForm(EMPTY_NEW_MEASURE);
        setNewFiles([]);
        setFormTarget(null);
    };

    const submitForm = async () => {
        setIsSubmitting(true);
        try {
            if (editing) {
                if (await data.saveMeasure(editing, form, newFiles)) closeForm();
            } else if (await data.addMeasure(form, newFiles)) {
                // Like Sanierung: the form stays open, ready for the next one.
                setForm(EMPTY_NEW_MEASURE);
                setNewFiles([]);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const localFileKey = (file: File, index: number) => `local:${index}:${file.name}`;

    const openLocalFile = (key: string) => {
        const file = newFiles.find((candidate, index) => localFileKey(candidate, index) === key);
        if (file) window.open(URL.createObjectURL(file), '_blank', 'noopener,noreferrer');
    };

    /** A measure's saved files as links (Belege). */
    const savedFileLinks = (measure: RenovationMeasure): FileLink[] => data.photosOf(measure.renovationMeasureId).map((photo) => ({
        key: String(photo.renovationMeasurePhotoId),
        name: photo.fileName,
        isImage: isImageFileName(photo.fileName),
    }));

    const photoByKey = (measure: RenovationMeasure, key: string) =>
        data.photosOf(measure.renovationMeasureId).find((photo) => String(photo.renovationMeasurePhotoId) === key);

    const commitFor = (measure: RenovationMeasure) => (patch: Partial<RenovationMeasure>) => data.commitField(measure.renovationMeasureId, patch);

    // ── Erfasste Maßnahmen ──────────────────────────────────────────────
    const columns: TableColumn<MeasureRow>[] = [
        {
            key: 'actions',
            label: 'Aktion',
            width: '80px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            icon={<Icons.MoreVertical />}
                            aria-label={`Aktionen für ${m.title}`}
                            menuItems={[
                                { label: 'Bearbeiten', icon: <Icons.Rename />, onClick: () => openEdit(m) },
                                { label: 'Löschen', icon: <Icons.Trash2 />, destructive: true, disabled: isLocked(m), onClick: () => data.requestDeleteMeasure(m) },
                            ]}
                        />
                    </div>
                );
            },
        },
        // Costs and dates each in their own column, so measures can be
        // compared at a glance. Description and Belege aren't compared — they
        // open on demand below the row, which keeps the table narrow enough
        // to fit without scrolling. Read-only; changed in the form above.
        {
            key: 'title',
            label: 'Maßnahme',
            renderCell: (_v, row) => (
                <div className="flex min-w-0 flex-col items-start gap-1 whitespace-normal">
                    <span className="break-words font-semibold text-foreground">{row.measure.title}</span>
                    {row.measure.category && <Tag label={categoryLabel(row.measure.category)} variant="info" />}
                </div>
            ),
        },
        {
            key: 'priceIndication',
            label: 'Preisindikation',
            width: '170px',
            align: 'right',
            // Same range and formatting as Sanierung's KI-Indikation; none for a free-text measure.
            renderCell: (_v, row) => {
                const range = measurePriceRange(row.measure, data.pricingContext);
                return range ? (
                    <span title="Kostenspanne auf Basis von Kategorie, Wohnfläche und PLZ-Regionalfaktor">
                        <span className="text-muted-foreground">{deNumberFormatter.format(range.min)} – </span>
                        <span className="font-semibold text-primary">{formatEuro(range.max)}</span>
                    </span>
                ) : EMPTY;
            },
        },
        { key: 'estimatedCost', label: 'Kosten veranschl.', width: '140px', align: 'right', renderCell: (_v, row) => formatCost(row.measure.estimatedCost) },
        { key: 'quotedCost', label: 'Kosten lt. Angebot', width: '145px', align: 'right', renderCell: (_v, row) => formatCost(row.measure.quotedCost) },
        { key: 'preferredStartDate', label: 'Start Wunsch', width: '120px', renderCell: (_v, row) => formatDate(row.measure.preferredStartDate) },
        { key: 'quotedStartDate', label: 'Start lt. Angebot', width: '140px', renderCell: (_v, row) => formatDate(row.measure.quotedStartDate) },
        { key: 'actualCompletionDate', label: 'Abschluss ist', width: '120px', renderCell: (_v, row) => formatDate(row.measure.actualCompletionDate) },
        {
            key: 'expand',
            label: '',
            width: '56px',
            align: 'center',
            renderCell: (_v, row) => <ExpandChevron open={detailsId === row.measure.renovationMeasureId} what="Beschreibung & Belege" />,
        },
    ];

    /** Description and Belege of a measure, opened below its row. */
    const renderMeasureDetails = (row: MeasureRow) => {
        const m = row.measure;
        if (detailsId !== m.renovationMeasureId) return null;
        const files = savedFileLinks(m);
        return (
            <div className="grid gap-4 whitespace-normal md:grid-cols-[2fr_1fr]" onClick={(e) => e.stopPropagation()}>
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beschreibung</p>
                    {m.description
                        ? <p className="whitespace-pre-line break-words text-foreground">{m.description}</p>
                        : EMPTY}
                </div>
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Belege</p>
                    <FileLinkList files={files} onOpen={(file) => { const photo = photoByKey(m, file.key); if (photo) void data.viewPhoto(photo); }} />
                </div>
            </div>
        );
    };

    /** Phones: one card per measure instead of the table. */
    const renderMeasureCard = (row: MeasureRow) => {
        const m = row.measure;
        const files = savedFileLinks(m);
        return (
            <div onClick={() => openEdit(m)} className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                <div className="flex items-start justify-between gap-3">
                    <MeasureSummary measure={m} />
                    {columns[0].renderCell?.(undefined, row)}
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <ValueList items={costItems(m, measurePriceRange(m, data.pricingContext))} />
                    <ValueList items={dateItems(m)} />
                </div>
                {files.length > 0 && (
                    <div className="border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
                        <FileLinkList files={files} onOpen={(file) => { const photo = photoByKey(m, file.key); if (photo) void data.viewPhoto(photo); }} />
                    </div>
                )}
            </div>
        );
    };

    // ── Status & Beauftragung ───────────────────────────────────────────
    // Like Sanierung's "Auswertung & Planung": where each measure stands. A
    // click on a row opens its Angebote, Rückfragen and Mängel below it.
    const statusColumns: TableColumn<MeasureRow>[] = [
        {
            key: 'title',
            label: 'Maßnahme',
            renderCell: (_v, row) => (
                <div className="flex min-w-0 flex-col items-start gap-1 whitespace-normal">
                    <span className="break-words font-semibold text-foreground">{row.measure.title}</span>
                    {row.measure.category && <Tag label={categoryLabel(row.measure.category)} variant="info" />}
                </div>
            ),
        },
        {
            key: 'published',
            label: 'Auftrag veröffentlichen',
            width: '190px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <span className="inline-flex justify-center" title="Im Handwerkerportal ausschreiben" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={m.published}
                            disabled={isLocked(m)}
                            onChange={() => data.togglePublished(m)}
                            aria-label={`${m.title} im Handwerkerportal veröffentlichen`}
                        />
                    </span>
                );
            },
        },
        {
            key: 'quoteReceived',
            label: 'Angebot',
            width: '100px',
            align: 'center',
            renderCell: (_v, row) => (
                <StatusMark checked={row.measure.quotedCost != null} label={row.measure.quotedCost != null ? 'Angebot erhalten' : 'Kein Angebot erhalten'} />
            ),
        },
        {
            key: 'quoteAccepted',
            label: 'Beauftragt',
            width: '110px',
            align: 'center',
            // Set by choosing an Angebot in the measure's panel (and undone there).
            renderCell: (_v, row) => (
                <StatusMark checked={row.measure.quoteAccepted} label={row.measure.quoteAccepted ? `${row.measure.title} beauftragt` : `${row.measure.title} nicht beauftragt`} />
            ),
        },
        {
            key: 'craftsmanConfirmedCompleted',
            label: 'Handwerker bestätigt',
            width: '170px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
                    <StatusMark
                        checked={m.craftsmanConfirmedCompleted}
                        label={m.craftsmanConfirmedCompleted ? `${m.title}: Bestätigung des Handwerkers zurücknehmen` : `${m.title}: vom Handwerker bestätigt`}
                        onToggle={() => data.toggleCraftsmanConfirmed(m)}
                    />
                );
            },
        },
        {
            key: 'customerConfirmedCompleted',
            label: 'Abgeschlossen',
            width: '130px',
            align: 'center',
            renderCell: (_v, row) => {
                const m = row.measure;
                const canConfirm = canConfirmCustomerCompletion(m);
                return (
                    <StatusMark
                        checked={m.customerConfirmedCompleted}
                        label={m.customerConfirmedCompleted ? `${m.title} als nicht abgeschlossen markieren` : `${m.title} als abgeschlossen bestätigen`}
                        disabled={!canConfirm}
                        title={!canConfirm ? (m.craftsmanConfirmedCompleted ? 'Bitte zuerst das Abschlussdatum setzen' : 'Bitte zuerst „Handwerker bestätigt" setzen') : undefined}
                        onToggle={() => data.toggleCustomerConfirmed(m)}
                    />
                );
            },
        },
        {
            key: 'expand',
            label: '',
            width: '56px',
            align: 'center',
            renderCell: (_v, row) => <ExpandChevron open={expandedId === row.measure.renovationMeasureId} what="Angebote & Mängel" />,
        },
    ];

    const tableData: MeasureRow[] = measures.map((measure) => ({ key: String(measure.renovationMeasureId), measure }));

    const fileLinksInForm: FileLink[] = [
        ...(editing ? savedFileLinks(editing) : []),
        ...newFiles.map((file, index) => ({ key: localFileKey(file, index), name: file.name, isImage: isImageFileName(file.name) })),
    ];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(
                        property,
                        propertyId,
                        ExistingPropertiesUseCases.Contractors,
                        hasMultipleUnits && contextUnit
                            ? { label: formatUnitLabel(contextUnit.unitLabel, contextUnit.floor, contextUnit.locationNote), href: `/existing-properties/${propertyId}/${contextUnit.propertyUnitId}` }
                            : undefined,
                    )}
                />

                <div className="flex flex-col gap-8">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatTile label="Maßnahmen gesamt" value={measures.length} caption="erfasst" />
                        <StatTile label="Kosten veranschlagt" value={formatEuro(totalEstimated)} caption="kalkuliert" />
                        <StatTile
                            label="Kosten lt. Angebot"
                            value={quotedCount > 0 ? formatEuro(totalQuoted) : '–'}
                            valueClassName="text-primary"
                            caption={`${quotedCount} von ${measures.length} mit Angebot`}
                        />
                        <StatTile
                            label="Abweichung"
                            value={quotedCount === 0 ? '–' : `${deviation > 0 ? '+' : ''}${formatEuro(deviation)}`}
                            valueClassName={quotedCount === 0 ? undefined : deviation > 0 ? 'text-warning' : deviation < 0 ? 'text-success' : undefined}
                            caption="Angebot vs. Kalkulation"
                        />
                    </div>

                    <section className="flex flex-col gap-3">
                        <SectionLabel>Erfasste Maßnahmen</SectionLabel>
                        {/* Only while the form is closed — once open, it's closed by
                            the ✕ in its own header, right where the form is. */}
                        {formTarget === null && (
                            <div className="flex justify-end">
                                <Button label="Maßnahme hinzufügen" icon={<Icons.Plus />} variant="outline" size="sm" aria-controls="measure-form" onClick={openNew} />
                            </div>
                        )}

                        {formTarget !== null && (
                            <FormPanel
                                id="measure-form"
                                ref={formRef}
                                icon={editing ? <Icons.Rename /> : <Icons.Plus />}
                                title={editing ? 'Maßnahme bearbeiten' : 'Neue Maßnahme'}
                                onClose={closeForm}
                                footer={(
                                    <>
                                        {editing
                                            ? <Button variant="outline" size="sm" label={BUTTON_DETAILS.Cancel.label} icon={<Icons.X />} onClick={closeForm} />
                                            : <Button variant="outline" size="sm" label="Zurücksetzen" icon={<Icons.RotateCcw />} onClick={resetForm} />}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            label={editing ? 'Übernehmen' : 'Hinzufügen'}
                                            icon={editing ? <Icons.Check /> : <Icons.Plus />}
                                            disabled={newMeasureTitle(form) === ''}
                                            loading={isSubmitting}
                                            onClick={() => void submitForm()}
                                        />
                                    </>
                                )}
                            >
                                {locked && (
                                    <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground md:col-span-2">
                                        <Icons.Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                        Beauftragt — Maßnahme, Kosten, Starttermine und Beschreibung sind gesperrt. Zum Ändern die Beauftragung unter „Status & Beauftragung“ aufheben.
                                    </p>
                                )}
                                <RenovationMeasurePicker
                                    category={form.category}
                                    measure={form.measure}
                                    onCategoryChange={(category) => setField({ category })}
                                    onMeasureChange={(measure) => setField({ measure })}
                                    allowCustom
                                    customTitle={form.customTitle}
                                    onCustomTitleChange={(customTitle) => setField({ customTitle })}
                                    disabled={locked}
                                />
                                <div className="md:col-span-2">
                                    <TextArea
                                        label="Beschreibung"
                                        optional
                                        disabled={locked}
                                        value={form.description}
                                        onChange={(e) => setField({ description: e.target.value })}
                                        maxLength={1500}
                                        rows={3}
                                        placeholder="Schaden oder Modernisierungswunsch beschreiben. Bilder und Text können kombiniert werden."
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <p className="mb-2 text-sm font-medium text-foreground">
                                        Bilder & Unterlagen <span className="font-normal text-muted-foreground">(optional)</span>
                                    </p>
                                    <FileDropZone
                                        title="Bilder und Unterlagen hochladen"
                                        description="Schadensfotos, Pläne, Kostendokumente · PNG, JPG, WEBP, PDF"
                                        accept={UPLOAD_ACCEPT}
                                        isUploading={isSubmitting}
                                        onFiles={(files) => setNewFiles((prev) => [...prev, ...files])}
                                    >
                                        {fileLinksInForm.length > 0 && (
                                            <FileLinkList
                                                files={fileLinksInForm}
                                                onOpen={(file) => {
                                                    if (file.key.startsWith('local:')) openLocalFile(file.key);
                                                    else if (editing) { const photo = photoByKey(editing, file.key); if (photo) void data.viewPhoto(photo); }
                                                }}
                                                onRemove={(file) => {
                                                    if (file.key.startsWith('local:')) setNewFiles((prev) => prev.filter((candidate, index) => localFileKey(candidate, index) !== file.key));
                                                    else if (editing) { const photo = photoByKey(editing, file.key); if (photo) void data.removePhoto(photo); }
                                                }}
                                            />
                                        )}
                                    </FileDropZone>
                                </div>
                                <NumberField
                                    label="Kosten veranschlagt"
                                    optional
                                    unit="€"
                                    min={0}
                                    disabled={locked}
                                    placeholder={priceRange ? String(midpoint(priceRange)) : undefined}
                                    value={form.estimatedCost}
                                    onChange={(e) => setField({ estimatedCost: e.target.value })}
                                />
                                <NumberField
                                    label="Kosten lt. Angebot"
                                    optional
                                    unit="€"
                                    min={0}
                                    disabled={locked}
                                    value={form.quotedCost}
                                    onChange={(e) => setField({ quotedCost: e.target.value })}
                                />
                                <div className="grid gap-4 sm:grid-cols-3 md:col-span-2">
                                    <CalendarField label="Start Wunsch" optional disabled={locked} value={form.preferredStartDate} onChange={(date) => setField({ preferredStartDate: date })} />
                                    <CalendarField label="Start lt. Angebot" optional disabled={locked} value={form.quotedStartDate} onChange={(date) => setField({ quotedStartDate: date })} />
                                    <CalendarField label="Abschluss ist" optional value={form.actualCompletionDate} onChange={(date) => setField({ actualCompletionDate: date })} />
                                </div>
                                {priceRange && !locked && (
                                    <div className="flex flex-col gap-2 md:col-span-2">
                                        <p className="text-sm font-medium text-foreground">Mit welchem Preis möchtest du weiterrechnen?</p>
                                        <PriceRangeSlider
                                            min={priceRange.min}
                                            max={priceRange.max}
                                            value={sliderValue}
                                            onChange={(value) => setField({ estimatedCost: String(value) })}
                                            format={formatEuro}
                                            hint="Wird als „Kosten veranschlagt“ übernommen."
                                        />
                                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                            <Icons.Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            Kostenspanne auf Basis von Kategorie, Wohnfläche und PLZ-Regionalfaktor — dieselbe Preisindikation wie in der Detailbewertung.
                                        </p>
                                    </div>
                                )}
                            </FormPanel>
                        )}

                        <Table
                            columns={columns}
                            data={tableData}
                            // Like "Status & Beauftragung": a click opens the row's panel
                            // (editing is "Bearbeiten" in the ⋮ menu).
                            onRowClick={(row) => setDetailsId((current) => current === row.measure.renovationMeasureId ? null : row.measure.renovationMeasureId)}
                            getRowClassName={(row) => (detailsId === row.measure.renovationMeasureId ? 'bg-primary/5' : undefined)}
                            renderExpandedRow={renderMeasureDetails}
                            renderMobileCard={renderMeasureCard}
                            emptyMessage="Noch keine Sanierungsmaßnahmen erfasst."
                            footerLeft={`${measures.length} ${measures.length === 1 ? 'Eintrag' : 'Einträge'}`}
                        />
                    </section>

                    {measures.length > 0 && (
                        <section className="flex flex-col gap-3">
                            <SectionLabel>Status & Beauftragung</SectionLabel>
                            <Table
                                columns={statusColumns}
                                data={tableData}
                                onRowClick={(row) => setExpandedId((current) => current === row.measure.renovationMeasureId ? null : row.measure.renovationMeasureId)}
                                getRowClassName={(row) => (expandedId === row.measure.renovationMeasureId ? 'bg-primary/5' : undefined)}
                                renderExpandedRow={(row) => expandedId === row.measure.renovationMeasureId
                                    ? <MeasureWorkPanel measure={row.measure} commit={commitFor(row.measure)} />
                                    : null}
                                emptyMessage="Noch keine Sanierungsmaßnahmen erfasst."
                                footerLeft="Klick auf eine Maßnahme öffnet Angebote, Rückfragen und Mängel."
                            />
                        </section>
                    )}
                </div>
            </main>

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
