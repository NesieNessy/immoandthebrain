"use client";
import { useState } from 'react';

import { Button, ConfirmDeleteModal, Icons, Modal, NumberField, TextArea, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { formatEuro } from '@/lib/utils';
import type { RenovationMeasure, RenovationMeasureDefect, RenovationMeasureQuote } from '@immoandthebrain/types';
import { isLocked as isMeasureLocked } from './measureStatus';
import { useMeasureWork } from './useMeasureWork';

/**
 * A measure's work in progress, opened under its row in "Status &
 * Beauftragung": the Angebote (choosing one commissions the measure),
 * Rückfragen des Handwerks and Mängel.
 */
export function MeasureWorkPanel({ measure, commit }: {
    measure: RenovationMeasure;
    commit: (patch: Partial<RenovationMeasure>) => void;
}) {
    const work = useMeasureWork(measure, commit);
    const locked = isMeasureLocked(measure);

    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [quoteCompany, setQuoteCompany] = useState('');
    const [quoteCost, setQuoteCost] = useState('');
    const [quoteFile, setQuoteFile] = useState<File | null>(null);
    const [isAddingQuote, setIsAddingQuote] = useState(false);
    const [quotePendingDelete, setQuotePendingDelete] = useState<RenovationMeasureQuote | null>(null);
    const [notes, setNotes] = useState(measure.craftsmanNotes ?? '');
    const [defectInput, setDefectInput] = useState('');
    const [defectPendingDelete, setDefectPendingDelete] = useState<RenovationMeasureDefect | null>(null);

    const openQuoteModal = () => {
        setQuoteCompany('');
        setQuoteCost('');
        setQuoteFile(null);
        setQuoteModalOpen(true);
    };

    const confirmAddQuote = async () => {
        setIsAddingQuote(true);
        try {
            if (await work.addQuote(quoteCompany, quoteCost, quoteFile)) setQuoteModalOpen(false);
        } finally {
            setIsAddingQuote(false);
        }
    };

    const confirmAddDefect = async () => {
        if (defectInput.trim() === '') return;
        if (await work.addDefect(defectInput)) setDefectInput('');
    };

    if (work.isLoading) {
        return (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icons.Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Angebote und Mängel werden geladen…
            </p>
        );
    }

    return (
        // Clicks inside the panel must not bubble up to the row (which toggles it).
        <div className="grid gap-6 whitespace-normal md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            {/* ── Angebote & Rückfragen ───────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">Angebote</p>
                    <p className="text-xs text-muted-foreground">
                        {locked ? 'Beauftragt mit dem ausgewählten Angebot.' : 'Wähle das Angebot aus, das beauftragt werden soll.'}
                    </p>
                </div>
                {work.quotes.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Angebote.</p>}
                {work.quotes.map((quote, index) => (
                    <div key={quote.renovationMeasureQuoteId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
                        <button
                            type="button"
                            onClick={() => void work.acceptQuote(quote)}
                            disabled={locked}
                            aria-pressed={quote.accepted}
                            aria-label={`Angebot ${String.fromCharCode(65 + index)} auswählen`}
                            className="flex shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
                        >
                            {quote.accepted
                                ? <Icons.CheckCircle2 className="h-5 w-5 text-primary" />
                                : <span className="block h-5 w-5 rounded-full border-2 border-border" />}
                        </button>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            Angebot {String.fromCharCode(65 + index)} – {quote.companyName}
                            {quote.cost != null && <span className="text-muted-foreground"> · {formatEuro(quote.cost)}</span>}
                        </span>
                        {quote.documentPath && (
                            <button
                                type="button"
                                onClick={() => void work.viewQuoteDocument(quote)}
                                className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-primary hover:underline"
                            >
                                <Icons.FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                {quote.documentFileName ?? 'Dokument'}
                            </button>
                        )}
                        {!locked && (
                            <button
                                type="button"
                                onClick={() => setQuotePendingDelete(quote)}
                                aria-label="Angebot löschen"
                                className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                                <Icons.Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                ))}
                <div className="flex flex-wrap gap-2">
                    {locked
                        ? <Button label="Beauftragung aufheben" icon={<Icons.RotateCcw />} variant="outline" size="sm" onClick={() => void work.withdrawAcceptance()} />
                        : <Button label="Angebot hinzufügen" icon={<Icons.Plus />} variant="outline" size="sm" onClick={openQuoteModal} />}
                </div>

                <TextArea
                    label="Rückfragen des Handwerks"
                    optional
                    placeholder="Rückfrage zum Fliesentyp…"
                    disabled={locked}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => { if (notes !== (measure.craftsmanNotes ?? '')) commit({ craftsmanNotes: notes.trim() || null }); }}
                />
            </div>

            {/* ── Mängel ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <div>
                    <p className="text-sm font-semibold text-foreground">Mängel</p>
                    <p className="text-xs text-muted-foreground">Was nach Abschluss noch nachgebessert werden muss.</p>
                </div>
                {work.defects.map((defect) => (
                    <div key={defect.renovationMeasureDefectId} className="flex items-center gap-2">
                        <span className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground">{defect.description}</span>
                        <button
                            type="button"
                            onClick={() => setDefectPendingDelete(defect)}
                            aria-label="Mangel löschen"
                            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Icons.Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                <TextField
                    placeholder="Mangel beschreiben…"
                    aria-label="Mangel beschreiben"
                    value={defectInput}
                    onChange={(e) => setDefectInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmAddDefect(); } }}
                />
                <div>
                    <Button label="Mangel hinzufügen" icon={<Icons.Plus />} variant="outline" size="sm" disabled={defectInput.trim() === ''} onClick={() => void confirmAddDefect()} />
                </div>
            </div>

            <Modal
                open={quoteModalOpen}
                onClose={() => setQuoteModalOpen(false)}
                title="Angebot hinzufügen"
                icon={<Icons.Plus className="h-5 w-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={() => setQuoteModalOpen(false)} />
                        <Button
                            label="Hinzufügen"
                            icon={<Icons.Plus className="h-4 w-4" />}
                            variant="primary"
                            disabled={quoteCompany.trim() === ''}
                            loading={isAddingQuote}
                            onClick={() => void confirmAddQuote()}
                        />
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <TextField label="Firma" placeholder="z.B. Mustermann GmbH" value={quoteCompany} onChange={(e) => setQuoteCompany(e.target.value)} />
                    <NumberField label="Kosten lt. Angebot" optional unit="€" min={0} value={quoteCost} onChange={(e) => setQuoteCost(e.target.value)} />
                    <div>
                        <label className="mb-2 block text-sm text-foreground">Angebotsdokument (optional)</label>
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setQuoteFile(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-2 file:border-primary file:bg-transparent file:px-3 file:py-1.5 file:text-primary"
                        />
                    </div>
                </div>
            </Modal>

            <ConfirmDeleteModal
                open={quotePendingDelete !== null}
                onCancel={() => setQuotePendingDelete(null)}
                onConfirm={() => { if (quotePendingDelete) void work.removeQuote(quotePendingDelete); setQuotePendingDelete(null); }}
                title="Angebot löschen?"
            >
                <p className="text-sm text-muted-foreground">
                    {quotePendingDelete ? `Angebot von „${quotePendingDelete.companyName}" wird unwiderruflich gelöscht.` : ''}
                </p>
            </ConfirmDeleteModal>

            <ConfirmDeleteModal
                open={defectPendingDelete !== null}
                onCancel={() => setDefectPendingDelete(null)}
                onConfirm={() => { if (defectPendingDelete) void work.removeDefect(defectPendingDelete); setDefectPendingDelete(null); }}
                title="Mangel löschen?"
            >
                <p className="text-sm text-muted-foreground">Dieser Eintrag wird unwiderruflich gelöscht.</p>
            </ConfirmDeleteModal>
        </div>
    );
}
