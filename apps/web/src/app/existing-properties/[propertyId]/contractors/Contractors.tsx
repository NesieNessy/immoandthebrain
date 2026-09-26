"use client";
import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { FileDropZone } from '@/components/features/FileDropZone';
import { FileLinkList, isImageFileName, type FileLink } from '@/components/features/FileLinkList';
import { FormPanel } from '@/components/features/FormPanel';
import { PriceIndicationHint } from '@/components/features/PriceIndicationHint';
import { PriceRangeSlider } from '@/components/features/PriceRangeSlider';
import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { RenovationMeasurePicker } from '@/components/features/RenovationMeasurePicker';
import {
    Button,
    CalendarField,
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
import { parseISO } from 'date-fns';
import { MeasureStatusCard } from './MeasureStatusCard';
import {
    EMPTY_NEW_MEASURE,
    formFromMeasure,
    distributeEstimates,
    measurePriceRange,
    newMeasurePriceRange,
    newMeasureTitle,
    planSlider,
    type NewMeasureForm,
} from './measureForm';
import { isLocked, summarizeMeasures } from './measureStatus';
import { useRenovationMeasuresData } from './useRenovationMeasuresData';

const EMPTY = <span className="text-muted-foreground">–</span>;

interface MeasureRow extends Record<string, unknown> {
    key: string;
    measure: RenovationMeasure;
}

/** What the measure files bucket accepts (renovation-measure-files). */
const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

/**
 * Handwerkerleistungen — everything on one page, like Sanierung:
 *  - the add/edit form above "Erfasste Maßnahmen" (the same table as
 *    Sanierung's "Erfasste Modernisierungen"),
 *  - "Kosten & Termine" to compare the measures' figures side by side,
 *  - "Status & Beauftragung": one card per measure with its progress steps,
 *    opening its Angebote, Rückfragen and Mängel.
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
    const rangeOf = (m: RenovationMeasure) => measurePriceRange(m, data.pricingContext);
    const slider = planSlider(measures, rangeOf);

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

    // ── Erfasste Maßnahmen — as Sanierung's "Erfasste Modernisierungen" ──
    const columns: TableColumn<MeasureRow>[] = [
        {
            key: 'actions',
            label: 'Aktion',
            width: '80px',
            renderCell: (_v, row) => {
                const m = row.measure;
                return (
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
                );
            },
        },
        {
            key: 'category',
            label: 'Kategorie',
            width: '150px',
            renderCell: (_v, row) => row.measure.category ? <Tag label={categoryLabel(row.measure.category)} variant="info" /> : EMPTY,
        },
        {
            key: 'title',
            label: 'Maßnahme',
            width: '22%',
            renderCell: (_v, row) => <span className="block whitespace-normal break-words font-medium">{row.measure.title}</span>,
        },
        {
            key: 'description',
            label: 'Beschreibung',
            // Free text of any length — wraps and is always shown in full.
            renderCell: (_v, row) => row.measure.description
                ? <span className="block whitespace-pre-line break-words text-muted-foreground">{row.measure.description}</span>
                : EMPTY,
        },
        {
            key: 'files',
            label: 'Belege',
            width: '22%',
            renderCell: (_v, row) => (
                <div className="whitespace-normal">
                    <FileLinkList
                        files={savedFileLinks(row.measure)}
                        onOpen={(file) => { const photo = photoByKey(row.measure, file.key); if (photo) void data.viewPhoto(photo); }}
                    />
                </div>
            ),
        },
    ];

    // ── Kosten & Termine — the figures, one column each, to compare ────
    const costInput = (m: RenovationMeasure, field: 'estimatedCost' | 'quotedCost', label: string) => {
        const range = field === 'estimatedCost' ? rangeOf(m) : null;
        return (
            <NumberField
                aria-label={label}
                unit="€"
                min={0}
                disabled={isLocked(m)}
                placeholder={range ? String(midpoint(range)) : undefined}
                value={m[field] ?? ''}
                onChange={(e) => data.updateLocalField(m.renovationMeasureId, { [field]: e.target.value === '' ? null : Number(e.target.value) })}
                onBlur={() => void data.persistField(m.renovationMeasureId, { [field]: m[field] })}
            />
        );
    };

    const dateInput = (m: RenovationMeasure, field: 'preferredStartDate' | 'quotedStartDate' | 'actualCompletionDate', label: string) => (
        <CalendarField
            aria-label={label}
            disabled={field !== 'actualCompletionDate' && isLocked(m)}
            value={m[field] ? parseISO(m[field]!) : undefined}
            onChange={(date) => data.setDate(m, field, date)}
        />
    );

    const costColumns: TableColumn<MeasureRow>[] = [
        {
            key: 'title',
            label: 'Maßnahme',
            renderCell: (_v, row) => (
                <>
                    <span className="block whitespace-normal break-words font-semibold">{row.measure.title}</span>
                    {row.measure.category && <span className="block text-xs text-muted-foreground">{categoryLabel(row.measure.category)}</span>}
                </>
            ),
        },
        {
            key: 'priceIndication',
            label: 'Preisindikation',
            width: '170px',
            align: 'right',
            // Same range and formatting as Sanierung's Preisindikation; none for a free-text measure.
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
        // Entered right here, like "Angesetzt" and "Zeitpunkt" in Sanierung.
        // Costs are saved when the field is left, dates when picked. Once
        // commissioned, only the completion date stays editable (as on the server).
        {
            key: 'estimatedCost',
            label: 'Kosten veranschl.',
            width: '160px',
            renderCell: (_v, row) => costInput(row.measure, 'estimatedCost', `Kosten veranschlagt für ${row.measure.title}`),
        },
        {
            key: 'quotedCost',
            label: 'Kosten lt. Angebot',
            width: '160px',
            renderCell: (_v, row) => costInput(row.measure, 'quotedCost', `Kosten laut Angebot für ${row.measure.title}`),
        },
        {
            key: 'preferredStartDate',
            label: 'Start Wunsch',
            width: '175px',
            renderCell: (_v, row) => dateInput(row.measure, 'preferredStartDate', `Wunschstart für ${row.measure.title}`),
        },
        {
            key: 'quotedStartDate',
            label: 'Start lt. Angebot',
            width: '175px',
            renderCell: (_v, row) => dateInput(row.measure, 'quotedStartDate', `Start laut Angebot für ${row.measure.title}`),
        },
        {
            key: 'actualCompletionDate',
            label: 'Abschluss ist',
            width: '175px',
            renderCell: (_v, row) => dateInput(row.measure, 'actualCompletionDate', `Tatsächlicher Abschluss für ${row.measure.title}`),
        },
    ];

    // Footer, like Sanierung's Gesamtsumme: the totals of both cost columns.
    const costFooter = (
        <span className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-foreground">
            <span className="font-medium">
                Summe veranschlagt: <span className="text-base font-semibold text-primary">{formatEuro(totalEstimated)}</span>
            </span>
            <span className="font-medium">
                Summe lt. Angebot: <span className="text-base font-semibold">{quotedCount > 0 ? formatEuro(totalQuoted) : '–'}</span>
            </span>
        </span>
    );

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
                                        Beauftragt — Maßnahme und Beschreibung sind gesperrt. Zum Ändern die Beauftragung unter „Status & Beauftragung“ aufheben.
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
                                {/* Like Sanierung: the indication for the chosen measure — its costs
                                    and dates are then set in "Kosten & Termine". */}
                                {priceRange && (
                                    <div className="md:col-span-2">
                                        <PriceIndicationHint range={priceRange} />
                                    </div>
                                )}
                            </FormPanel>
                        )}

                        <Table
                            columns={columns}
                            data={tableData}
                            emptyMessage="Noch keine Sanierungsmaßnahmen erfasst."
                            footerLeft={`${measures.length} ${measures.length === 1 ? 'Eintrag' : 'Einträge'}`}
                        />
                    </section>

                    {measures.length > 0 && (
                        <>
                            <section className="flex flex-col gap-3">
                                <SectionLabel>Kosten & Termine</SectionLabel>
                                <Table
                                    columns={costColumns}
                                    data={tableData}
                                    emptyMessage="Noch keine Sanierungsmaßnahmen erfasst."
                                    footerLeft={costFooter}
                                />
                            </section>

                            {/* ── Preiswahl, as in Sanierung ─────────────────────── */}
                            {slider && (
                                <section className="flex flex-col gap-3">
                                    <SectionLabel>Mit welchem Preis möchtest du weiterrechnen?</SectionLabel>
                                    <PriceRangeSlider
                                        min={slider.min}
                                        max={slider.max}
                                        value={slider.value}
                                        // Moves every measure within its own range (shown live), saved on release.
                                        onChange={(value) => void data.applyEstimates(distributeEstimates(measures, rangeOf, value), false)}
                                        onCommit={(value) => void data.applyEstimates(distributeEstimates(measures, rangeOf, value), true)}
                                        format={formatEuro}
                                        hint="Setzt „Kosten veranschlagt“ aller noch nicht beauftragten Maßnahmen mit Preisindikation."
                                    />
                                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                        <Icons.Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        Kostenspanne auf Basis von Kategorie, Wohnfläche und PLZ-Regionalfaktor.
                                    </p>
                                </section>
                            )}

                            <section className="flex flex-col gap-3">
                                <SectionLabel>Status & Beauftragung</SectionLabel>
                                <div className="flex flex-col gap-3">
                                    {measures.map((m) => (
                                        <MeasureStatusCard
                                            key={m.renovationMeasureId}
                                            measure={m}
                                            open={expandedId === m.renovationMeasureId}
                                            onToggleOpen={() => setExpandedId((current) => current === m.renovationMeasureId ? null : m.renovationMeasureId)}
                                            onTogglePublished={() => data.togglePublished(m)}
                                            onToggleCraftsman={() => data.toggleCraftsmanConfirmed(m)}
                                            onToggleCustomer={() => data.toggleCustomerConfirmed(m)}
                                            commit={(patch) => data.commitField(m.renovationMeasureId, patch)}
                                        />
                                    ))}
                                </div>
                            </section>
                        </>
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
