"use client";
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import {
    Button,
    CalendarField,
    Checkbox,
    ConfirmDeleteModal,
    Header,
    Icons,
    Modal,
    NumberField,
    PAGE_CONTAINER_CLASS,
    StickyActionBar,
    TextArea,
    TextField,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { deCurrencyFormatter } from '@/lib/utils';
import type { RenovationMeasureDefect, RenovationMeasureQuote } from '@immoandthebrain/types';
import { estimateRange, MEASURE_CATEGORY_ESTIMATES } from '../measureCategories';
import { useMeasureDetailData } from './useMeasureDetailData';

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

function toDate(value: string | null): Date | undefined {
    return value ? parseISO(value) : undefined;
}

function toDateInput(date: Date | undefined): string | null {
    return date ? format(date, 'yyyy-MM-dd') : null;
}

/** Card shell matching the app's established icon+title header pattern
 *  (see DocumentGeneratorParts.tsx's DataCard / RentalTrends.tsx's
 *  ProposalCardShell) instead of a bare SectionLabel inside plain padding. */
function MeasureCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{title}</span>
            </div>
            <div className="p-4 flex flex-col gap-4">{children}</div>
        </div>
    );
}

function StatusIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
    if (state === 'done') {
        return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"><Icons.Check className="w-4 h-4" /></span>;
    }
    if (state === 'active') {
        return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Icons.Check className="w-4 h-4" /></span>;
    }
    return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-muted-foreground" />;
}

export default function MeasureDetail({ propertyId, measureId }: { propertyId: string; measureId: string }) {
    const router = useRouter();
    const data = useMeasureDetailData(propertyId, measureId);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [quoteCompany, setQuoteCompany] = useState('');
    const [quoteCost, setQuoteCost] = useState('');
    const [quoteFile, setQuoteFile] = useState<File | null>(null);
    const [isAddingQuote, setIsAddingQuote] = useState(false);
    const [quotePendingDelete, setQuotePendingDelete] = useState<RenovationMeasureQuote | null>(null);

    const [defectInput, setDefectInput] = useState('');
    const [defectPendingDelete, setDefectPendingDelete] = useState<RenovationMeasureDefect | null>(null);

    const [priceSliderValue, setPriceSliderValue] = useState<number | null>(null);

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property || data.notFound || !data.measure) return <PropertyNotFoundPage />;

    const { property, measure, quotes, defects, isLocked } = data;
    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const backHref = `/existing-properties/${propertyId}/contractors`;

    const range = estimateRange(measure.category);
    const items = measure.category ? MEASURE_CATEGORY_ESTIMATES[measure.category] : undefined;
    const sliderValue = priceSliderValue ?? measure.estimatedCost ?? (range ? Math.round((range.min + range.max) / 2) : 0);

    const openQuoteModal = () => {
        setQuoteCompany('');
        setQuoteCost('');
        setQuoteFile(null);
        setQuoteModalOpen(true);
    };

    const confirmAddQuote = async () => {
        setIsAddingQuote(true);
        try {
            const ok = await data.addQuote(quoteCompany, quoteCost, quoteFile);
            if (ok) setQuoteModalOpen(false);
        } finally {
            setIsAddingQuote(false);
        }
    };

    const confirmAddDefect = async () => {
        if (defectInput.trim() === '') return;
        const ok = await data.addDefect(defectInput);
        if (ok) setDefectInput('');
    };

    const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void data.addPhoto(file);
    };

    // Step reached: 1 published, 2 quotes received, 3 commissioned, 4 completed.
    const step1State = measure.published ? 'done' : 'pending';
    const step2State = quotes.length > 0 ? 'done' : 'pending';
    const step3State = measure.quoteAccepted ? 'done' : 'pending';
    const step4State = measure.customerConfirmedCompleted ? 'done' : 'pending';

    return (
        <div className="min-h-screen bg-background pb-28">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[
                        { label: 'Bestandsobjekte', href: '/existing-properties' },
                        { label: address, href: `/existing-properties/${propertyId}` },
                        { label: 'Handwerkerleistungen', href: backHref },
                        { label: measure.title },
                    ]}
                />

                <div className="flex flex-col gap-6">
                    {/* ── Beschreibung & Schäden ──────────────────────────────── */}
                    <MeasureCard icon={Icons.AlertTriangle} title="Beschreibung & Schäden">
                        <TextArea
                            placeholder="Leichte Schäden im Badezimmer und Fußboden…"
                            disabled={isLocked}
                            value={measure.description ?? ''}
                            onChange={(e) => data.updateLocalField({ description: e.target.value })}
                            onBlur={() => void data.commitField({ description: measure.description })}
                        />
                        <div>
                            <p className="mb-2 text-sm text-muted-foreground">Bilder der Schäden hochladen</p>
                            <div className="flex flex-wrap gap-3">
                                {!isLocked && (
                                    <button
                                        type="button"
                                        onClick={() => photoInputRef.current?.click()}
                                        aria-label="Bild hochladen"
                                        className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                                    >
                                        <Icons.Plus className="w-5 h-5" />
                                    </button>
                                )}
                                <input ref={photoInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePhotoSelected} />
                                {data.photos.map((photo) => (
                                    <div key={photo.renovationMeasurePhotoId} className="relative group">
                                        <button
                                            type="button"
                                            onClick={() => void data.viewPhoto(photo)}
                                            title={photo.fileName}
                                            className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                                        >
                                            <Icons.Image className="w-6 h-6" />
                                        </button>
                                        {!isLocked && (
                                            <button
                                                type="button"
                                                onClick={() => void data.removePhoto(photo)}
                                                aria-label={`${photo.fileName} löschen`}
                                                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground cursor-pointer"
                                            >
                                                <Icons.X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </MeasureCard>

                    {/* ── Termine & Kosten ────────────────────────────────────── */}
                    <MeasureCard icon={Icons.Calendar} title="Termine & Kosten">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <CalendarField
                                label="Start Wunsch"
                                disabled={isLocked}
                                value={toDate(measure.preferredStartDate)}
                                onChange={(date) => data.commitField({ preferredStartDate: toDateInput(date) })}
                            />
                            <CalendarField
                                label="Start lt. Angebot"
                                disabled={isLocked}
                                value={toDate(measure.quotedStartDate)}
                                onChange={(date) => data.commitField({ quotedStartDate: toDateInput(date) })}
                            />
                            <CalendarField
                                label="Abschluss ist"
                                value={toDate(measure.actualCompletionDate)}
                                onChange={(date) => data.commitField({ actualCompletionDate: toDateInput(date) })}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <NumberField
                                label="Kosten kalkuliert"
                                unit="€"
                                min={0}
                                disabled={isLocked}
                                value={measure.estimatedCost ?? ''}
                                onChange={(e) => data.updateLocalField({ estimatedCost: e.target.value === '' ? null : Number(e.target.value) })}
                                onBlur={() => void data.commitField({ estimatedCost: measure.estimatedCost })}
                            />
                            <NumberField
                                label="Kosten lt. Angebot"
                                unit="€"
                                min={0}
                                disabled={isLocked}
                                value={measure.quotedCost ?? ''}
                                onChange={(e) => data.updateLocalField({ quotedCost: e.target.value === '' ? null : Number(e.target.value) })}
                                onBlur={() => void data.commitField({ quotedCost: measure.quotedCost })}
                            />
                        </div>
                    </MeasureCard>

                    {/* ── Preisindikation ─────────────────────────────────────── */}
                    {items && range && (
                        <MeasureCard icon={Icons.Calculator} title={`KI-Schätzung ${measure.category}sanierung (je nach Region & Qualität)`}>
                            <div className="flex items-start gap-4">
                                <div className="flex-1 min-w-0 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                                                <th className="text-left font-medium pb-2">Maßnahme</th>
                                                <th className="text-right font-medium pb-2">Geschätzte Kosten</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {items.map((item) => (
                                                <tr key={item.label}>
                                                    <td className="py-1.5 text-foreground">{item.label}</td>
                                                    <td className="py-1.5 text-right text-foreground whitespace-nowrap">{euro(item.min)} – {euro(item.max)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-border text-sm">
                                        <span className="text-muted-foreground">Gesamtschätzung</span>
                                        <span className="font-semibold text-primary">{euro(range.min)} – {euro(range.max)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-border p-4">
                                <p className="text-sm text-foreground mb-3">Mit welchem Preis möchten Sie weiterrechnen?</p>
                                <input
                                    type="range"
                                    min={range.min}
                                    max={range.max}
                                    step={100}
                                    value={sliderValue}
                                    disabled={isLocked}
                                    onChange={(e) => setPriceSliderValue(Number(e.target.value))}
                                    onMouseUp={() => void data.commitField({ estimatedCost: sliderValue })}
                                    onTouchEnd={() => void data.commitField({ estimatedCost: sliderValue })}
                                    className="w-full accent-primary cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                                    <span>{euro(range.min)}</span>
                                    <span className="text-base font-semibold text-primary">{euro(sliderValue)}</span>
                                    <span>{euro(range.max)}</span>
                                </div>
                            </div>
                        </MeasureCard>
                    )}

                    {/* ── Status & Fortschritt ────────────────────────────────── */}
                    <MeasureCard icon={Icons.Wrench} title="Status & Fortschritt">
                        <div className="flex flex-col">
                            {/* Step 1 */}
                            <div className="flex gap-3 pb-6">
                                <div className="flex flex-col items-center">
                                    <StatusIcon state={step1State} />
                                    <div className="w-px flex-1 bg-border mt-1" />
                                </div>
                                <div className="flex-1 min-w-0 pb-2 flex flex-col gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Ausschreibung erfolgt</p>
                                        <p className="text-xs text-muted-foreground">Maßnahme wurde im Handwerkerportal ausgeschrieben</p>
                                    </div>
                                    <div>
                                        <Button
                                            label={measure.published ? 'Im Handwerkerportal veröffentlicht' : 'Im Handwerkerportal veröffentlichen'}
                                            icon={<BUTTON_DETAILS.Publish.icon className="w-4 h-4" />}
                                            variant={measure.published ? 'outline' : 'primary'}
                                            size="sm"
                                            disabled={isLocked}
                                            onClick={() => data.togglePublished()}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div className="flex gap-3 pb-6">
                                <div className="flex flex-col items-center">
                                    <StatusIcon state={step2State} />
                                    <div className="w-px flex-1 bg-border mt-1" />
                                </div>
                                <div className="flex-1 min-w-0 pb-2 flex flex-col gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Angebote liegen vor</p>
                                        <p className="text-xs text-muted-foreground">Wählen Sie das Angebot aus, das beauftragt werden soll</p>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        {quotes.map((quote, index) => (
                                            <div key={quote.renovationMeasureQuoteId} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30">
                                                <button
                                                    type="button"
                                                    onClick={() => void data.acceptQuote(quote)}
                                                    disabled={isLocked && !quote.accepted}
                                                    aria-pressed={quote.accepted}
                                                    aria-label={`Angebot ${String.fromCharCode(65 + index)} auswählen`}
                                                    className="shrink-0 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
                                                >
                                                    {quote.accepted
                                                        ? <Icons.CheckCircle2 className="w-5 h-5 text-primary" />
                                                        : <span className="block w-5 h-5 rounded-full border-2 border-border" />}
                                                </button>
                                                <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                                                    Angebot {String.fromCharCode(65 + index)} – {quote.companyName}
                                                    {quote.cost != null && <span className="text-muted-foreground"> · {euro(quote.cost)}</span>}
                                                </span>
                                                {quote.documentPath && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void data.viewQuoteDocument(quote)}
                                                        className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                                                    >
                                                        <Icons.FileText className="w-3.5 h-3.5" />
                                                        {quote.documentFileName ?? 'Dokument'}
                                                    </button>
                                                )}
                                                {!isLocked && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuotePendingDelete(quote)}
                                                        aria-label="Angebot löschen"
                                                        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                                    >
                                                        <Icons.Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {!isLocked && (
                                            <Button label="Angebot hinzufügen" icon={<Icons.Plus className="w-4 h-4" />} variant="outline" size="sm" onClick={openQuoteModal} />
                                        )}
                                    </div>

                                    <TextArea
                                        label="Rückfragen des Handwerks"
                                        optional
                                        placeholder="Rückfrage zum Fliesentyp…"
                                        disabled={isLocked}
                                        value={measure.craftsmanNotes ?? ''}
                                        onChange={(e) => data.updateLocalField({ craftsmanNotes: e.target.value })}
                                        onBlur={() => void data.commitField({ craftsmanNotes: measure.craftsmanNotes })}
                                    />
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div className="flex gap-3 pb-6">
                                <div className="flex flex-col items-center">
                                    <StatusIcon state={step3State} />
                                    <div className="w-px flex-1 bg-border mt-1" />
                                </div>
                                <div className="flex-1 min-w-0 pb-2">
                                    <p className="text-sm font-semibold text-foreground">Auftrag beauftragt</p>
                                    <p className="text-xs text-muted-foreground">Ausgewähltes Angebot wurde dem Handwerker beauftragt</p>
                                </div>
                            </div>

                            {/* Step 4 */}
                            <div className="flex gap-3">
                                <StatusIcon state={step4State} />
                                <div className="flex-1 min-w-0 flex flex-col gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Auftrag abgeschlossen</p>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Checkbox
                                            label="Handwerker bestätigt"
                                            checked={measure.craftsmanConfirmedCompleted}
                                            onChange={() => data.toggleCraftsmanConfirmed()}
                                        />
                                        <Checkbox
                                            label="Kunde bestätigt"
                                            checked={measure.customerConfirmedCompleted}
                                            disabled={!measure.craftsmanConfirmedCompleted}
                                            onChange={() => data.toggleCustomerConfirmed()}
                                        />
                                    </div>

                                    <div>
                                        <p className="mb-2 text-sm font-medium text-foreground">Mängel</p>
                                        <div className="flex flex-col gap-2">
                                            {defects.map((defect) => (
                                                <div key={defect.renovationMeasureDefectId} className="flex items-center gap-2">
                                                    <span className="flex-1 px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-foreground">{defect.description}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDefectPendingDelete(defect)}
                                                        aria-label="Mangel löschen"
                                                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                                    >
                                                        <Icons.Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <TextField
                                                placeholder="Mangel beschreiben…"
                                                value={defectInput}
                                                onChange={(e) => setDefectInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmAddDefect(); } }}
                                            />
                                        </div>
                                        <div className="mt-2">
                                            <Button label="Mangel hinzufügen" icon={<Icons.Plus className="w-4 h-4" />} variant="outline" size="sm" onClick={() => void confirmAddDefect()} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </MeasureCard>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                primaryLabel="Handwerkerleistungen speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon className="w-4 h-4" />}
                onPrimary={() => router.push(backHref)}
            />

            <Modal
                open={quoteModalOpen}
                onClose={() => setQuoteModalOpen(false)}
                title="Angebot hinzufügen"
                icon={<Icons.Plus className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={() => setQuoteModalOpen(false)} />
                        <Button
                            label="Hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="primary"
                            disabled={quoteCompany.trim() === '' || isAddingQuote}
                            onClick={() => void confirmAddQuote()}
                        />
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <TextField label="Firma" placeholder="z.B. Mustermann GmbH" value={quoteCompany} onChange={(e) => setQuoteCompany(e.target.value)} />
                    <NumberField label="Kosten lt. Angebot" optional unit="€" min={0} value={quoteCost} onChange={(e) => setQuoteCost(e.target.value)} />
                    <div>
                        <label className="block mb-2 text-sm text-foreground">Angebotsdokument (optional)</label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setQuoteFile(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-2 file:border-primary file:text-primary file:bg-transparent file:cursor-pointer"
                        />
                    </div>
                </div>
            </Modal>

            <ConfirmDeleteModal
                open={quotePendingDelete !== null}
                onCancel={() => setQuotePendingDelete(null)}
                onConfirm={() => { if (quotePendingDelete) void data.removeQuote(quotePendingDelete); setQuotePendingDelete(null); }}
                title="Angebot löschen?"
            >
                <p className="text-sm text-muted-foreground">
                    {quotePendingDelete ? `Angebot von „${quotePendingDelete.companyName}" wird unwiderruflich gelöscht.` : ''}
                </p>
            </ConfirmDeleteModal>

            <ConfirmDeleteModal
                open={defectPendingDelete !== null}
                onCancel={() => setDefectPendingDelete(null)}
                onConfirm={() => { if (defectPendingDelete) void data.removeDefect(defectPendingDelete); setDefectPendingDelete(null); }}
                title="Mangel löschen?"
            >
                <p className="text-sm text-muted-foreground">Dieser Eintrag wird unwiderruflich gelöscht.</p>
            </ConfirmDeleteModal>
        </div>
    );
}
