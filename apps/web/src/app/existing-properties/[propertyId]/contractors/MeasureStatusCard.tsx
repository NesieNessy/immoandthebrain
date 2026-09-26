"use client";

import { Button, Checkbox, Icons, Tag } from '@/components/ui';
import { categoryLabel } from '@/lib/renovation/catalog';
import { cn } from '@/lib/utils';
import type { RenovationMeasure } from '@immoandthebrain/types';
import type { ReactNode } from 'react';
import { MeasureWorkPanel } from './MeasureWorkPanel';
import { canConfirmCustomerCompletion, isLocked } from './measureStatus';

/** A round status mark (✓ when reached) — a button when it can be toggled. */
function StatusMark({ checked, label, disabled, title, onToggle }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    title?: string;
    onToggle?: () => void;
}) {
    const mark = checked
        ? <Icons.CheckCircle2 className="h-6 w-6 text-success" />
        : <span className="block h-6 w-6 rounded-full border-2 border-border transition-colors hover:border-primary" />;
    if (!onToggle) return <span className="flex" role="img" aria-label={label}>{mark}</span>;
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={checked}
            aria-label={label}
            title={title}
            className="flex cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        >
            {mark}
        </button>
    );
}

/** One step of the progress line: its mark, name and a short hint. */
function Step({ done, mark, name, hint }: { done: boolean; mark: ReactNode; name: string; hint: string }) {
    return (
        <li className="relative flex gap-3 sm:flex-col sm:items-start sm:gap-2">
            {mark}
            <div className="min-w-0">
                <p className={cn('text-sm font-medium', done ? 'text-foreground' : 'text-muted-foreground')}>{name}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
        </li>
    );
}

/**
 * "Status & Beauftragung" of one measure: where it stands as a line of steps
 * (Veröffentlicht → Angebot → Beauftragt → Handwerker bestätigt →
 * Abgeschlossen), each with its control, and its Angebote, Rückfragen and
 * Mängel below when opened.
 */
export function MeasureStatusCard({ measure, open, onToggleOpen, onTogglePublished, onToggleCraftsman, onToggleCustomer, commit }: {
    measure: RenovationMeasure;
    open: boolean;
    onToggleOpen: () => void;
    onTogglePublished: () => void;
    onToggleCraftsman: () => void;
    onToggleCustomer: () => void;
    commit: (patch: Partial<RenovationMeasure>) => void;
}) {
    const m = measure;
    const locked = isLocked(m);
    const canConfirm = canConfirmCustomerCompletion(m);
    const hasQuote = m.quotedCost != null;

    return (
        <article aria-label={m.title} className={cn('rounded-lg border bg-card', open ? 'border-primary/40' : 'border-border')}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-words font-semibold text-foreground">{m.title}</span>
                    {m.category && <Tag label={categoryLabel(m.category)} variant="info" />}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    label="Angebote, Rückfragen & Mängel"
                    icon={<Icons.ChevronDown className={cn('transition-transform', open && 'rotate-180')} />}
                    aria-expanded={open}
                    onClick={onToggleOpen}
                />
            </div>

            <ol className="grid gap-4 px-4 py-4 sm:grid-cols-5">
                <Step
                    done={m.published}
                    name="Veröffentlicht"
                    hint="Im Handwerkerportal ausgeschrieben"
                    mark={(
                        <span className="flex h-6 items-center" title="Im Handwerkerportal ausschreiben">
                            <Checkbox
                                checked={m.published}
                                disabled={locked}
                                onChange={onTogglePublished}
                                aria-label={`${m.title} im Handwerkerportal veröffentlichen`}
                            />
                        </span>
                    )}
                />
                <Step
                    done={hasQuote}
                    name="Angebot"
                    hint={hasQuote ? 'Kosten lt. Angebot liegen vor' : 'Angebote unten erfassen'}
                    mark={<StatusMark checked={hasQuote} label={hasQuote ? 'Angebot erhalten' : 'Kein Angebot erhalten'} />}
                />
                <Step
                    done={m.quoteAccepted}
                    name="Beauftragt"
                    hint={m.quoteAccepted ? 'Angebot ausgewählt' : 'Angebot unten auswählen'}
                    mark={<StatusMark checked={m.quoteAccepted} label={m.quoteAccepted ? `${m.title} beauftragt` : `${m.title} nicht beauftragt`} />}
                />
                <Step
                    done={m.craftsmanConfirmedCompleted}
                    name="Handwerker bestätigt"
                    hint="Handwerker meldet Abschluss"
                    mark={(
                        <StatusMark
                            checked={m.craftsmanConfirmedCompleted}
                            label={m.craftsmanConfirmedCompleted ? `${m.title}: Bestätigung des Handwerkers zurücknehmen` : `${m.title}: vom Handwerker bestätigt`}
                            onToggle={onToggleCraftsman}
                        />
                    )}
                />
                <Step
                    done={m.customerConfirmedCompleted}
                    name="Abgeschlossen"
                    hint={canConfirm || m.customerConfirmedCompleted
                        ? 'Von dir bestätigt'
                        : m.craftsmanConfirmedCompleted ? 'Erst Abschlussdatum setzen' : 'Erst Handwerker bestätigt'}
                    mark={(
                        <StatusMark
                            checked={m.customerConfirmedCompleted}
                            label={m.customerConfirmedCompleted ? `${m.title} als nicht abgeschlossen markieren` : `${m.title} als abgeschlossen bestätigen`}
                            disabled={!canConfirm}
                            onToggle={onToggleCustomer}
                        />
                    )}
                />
            </ol>

            {open && (
                <div className="border-t border-border bg-muted/30 px-4 py-4">
                    <MeasureWorkPanel measure={m} commit={commit} />
                </div>
            )}
        </article>
    );
}
