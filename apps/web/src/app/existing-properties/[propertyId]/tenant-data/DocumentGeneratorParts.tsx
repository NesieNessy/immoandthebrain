"use client";

import { Button, Icons, Modal } from '@/components/ui';
import { useRef, useState } from 'react';

export function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function initials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '–';
}

export function Pill({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
            ok ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
        }`}>
            {ok ? <Icons.Check className="w-3 h-3" /> : <Icons.AlertTriangle className="w-3 h-3" />}
            {label}
        </span>
    );
}

export function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-sm text-foreground">{value}</p>
        </div>
    );
}

/** Card shell shared by the tenant-data feature: icon + title header (bar of
 *  "Quelle: X" or custom actions on the right), a body, and an optional
 *  footer bar for primary actions — keeps every card in this area visually
 *  consistent instead of each screen hand-rolling its own header/footer. */
export function DataCard({
    icon: Icon,
    title,
    source,
    actions,
    footer,
    children,
}: {
    icon: React.ElementType;
    title: string;
    source?: string;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                </div>
                {actions ?? (source && <span className="text-xs text-muted-foreground">Quelle: {source}</span>)}
            </div>
            <div className="p-4">{children}</div>
            {footer && (
                <div className="flex items-center justify-end gap-2 flex-wrap px-4 py-3 border-t border-border bg-muted/10">
                    {footer}
                </div>
            )}
        </div>
    );
}

// ── Shared "generated document" box ──────────────────────────────────────
// Every "Generierbare Dokumente" card (Mieterbescheinigung, Mietvertrag,
// Nebenkostenabrechnung, Anpassungsschreiben, ...) uses the same three
// pieces below so a fix or design change in one place applies everywhere:
// a ghost upload button, a box listing every stored document as its own
// line (never just the latest — nothing is silently hidden), and a shared
// ask-before-replace flow so uploading over an existing document never
// deletes it without confirmation.

export interface DocumentBoxDoc {
    tenancyDocumentId: number;
    fileName: string;
}

/** Ghost-styled "Datei hochladen" button wrapping a hidden file input —
 *  visually identical everywhere a document can be uploaded. */
export function DocumentUploadButton({
    onSelect,
    disabled,
    disabledTitle,
    label = 'Datei hochladen',
    accept = '.pdf,.jpg,.jpeg,.png,.docx',
}: {
    onSelect: (file: File) => void;
    disabled?: boolean;
    disabledTitle?: string;
    label?: string;
    accept?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <span title={disabled ? disabledTitle : undefined}>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="sr-only"
                disabled={disabled}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onSelect(file);
                }}
            />
            <Button
                label={label}
                icon={<Icons.Upload className="w-4 h-4" />}
                variant="ghost"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
            />
        </span>
    );
}

function nameInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '–';
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/** Leading avatar + name shown at the start of a row when `label` is given
 *  (e.g. "Klaus Fischer" on a Mietvertrag row) — omitted for document slots
 *  with no single tenant (e.g. a property-wide Nebenkostenabrechnung). */
function DocumentBoxLabel({ label }: { label: string }) {
    return (
        <>
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {nameInitials(label)}
            </div>
            <span className="text-sm text-foreground truncate">{label}</span>
        </>
    );
}

/** Lists every stored document as its own line — a second (or third) upload
 *  never hides an earlier one; each line has its own view/download/delete.
 *  Always renders as a bordered row (even with zero documents), matching
 *  the Mietvertrag row's look everywhere this box is used. */
export function DocumentBox<TDoc extends DocumentBoxDoc>({
    docs,
    onView,
    onDownload,
    onDelete,
    isBusy,
    readOnly,
    emptyLabel = 'Kein Dokument hinterlegt',
    label,
}: {
    docs: TDoc[];
    onView: (doc: TDoc) => void;
    onDownload: (doc: TDoc) => void;
    onDelete?: (doc: TDoc) => void;
    isBusy?: (doc: TDoc) => boolean;
    readOnly?: boolean;
    emptyLabel?: string;
    /** The tenant this document slot belongs to — shown with an avatar. */
    label?: string;
}) {
    if (docs.length === 0) {
        return (
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                {label && <DocumentBoxLabel label={label} />}
                <span className="text-xs text-muted-foreground">{emptyLabel}</span>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {docs.map((doc) => (
                <div key={doc.tenancyDocumentId} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                    <div className="min-w-0 flex items-center gap-3 flex-wrap">
                        {label && <DocumentBoxLabel label={label} />}
                        <button
                            type="button"
                            onClick={() => onView(doc)}
                            title={doc.fileName}
                            className="min-w-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                            <Icons.FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            onClick={() => onDownload(doc)}
                            aria-label="Herunterladen"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Icons.Download className="w-4 h-4" />
                        </button>
                        {onDelete && !readOnly && (
                            <button
                                type="button"
                                onClick={() => onDelete(doc)}
                                disabled={isBusy?.(doc)}
                                aria-label="Löschen"
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                            >
                                <Icons.Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * State machine for "ask before replace": uploading while at least one
 * document already exists for the same slot pauses on a confirmation
 * instead of silently deleting anything. Replacing deletes the existing
 * doc(s) first; declining just uploads the new file alongside them (a new
 * line in the box). Uploading into an empty slot skips the prompt entirely.
 */
export function useDocumentReplaceFlow<TDoc>(options: {
    upload: (file: File) => Promise<void>;
    remove: (doc: TDoc) => Promise<void>;
}) {
    const [pending, setPending] = useState<{ file: File; existing: TDoc[] } | null>(null);
    const [isResolving, setIsResolving] = useState(false);

    const requestUpload = (file: File, existing: TDoc[]) => {
        if (existing.length === 0) {
            void options.upload(file);
            return;
        }
        setPending({ file, existing });
    };

    const confirmReplace = async () => {
        if (!pending) return;
        setIsResolving(true);
        try {
            for (const doc of pending.existing) await options.remove(doc);
            await options.upload(pending.file);
            setPending(null);
        } finally {
            setIsResolving(false);
        }
    };

    const keepBoth = async () => {
        if (!pending) return;
        setIsResolving(true);
        try {
            await options.upload(pending.file);
            setPending(null);
        } finally {
            setIsResolving(false);
        }
    };

    const cancel = () => setPending(null);

    return { pending, isResolving, requestUpload, confirmReplace, keepBoth, cancel };
}

/** Confirmation dialog for the flow above — rendered once per document
 *  "slot" (card / row) that offers upload. */
export function DocumentReplaceModal({
    open,
    fileName,
    isResolving,
    onReplace,
    onKeepBoth,
    onCancel,
}: {
    open: boolean;
    fileName: string | undefined;
    isResolving: boolean;
    onReplace: () => void;
    onKeepBoth: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal
            open={open}
            onClose={onCancel}
            title="Dokument ersetzen?"
            subtitle={fileName ? `Es liegt bereits ein Dokument vor: ${fileName}` : 'Es liegt bereits ein Dokument vor.'}
            footer={
                <>
                    <Button label="Abbrechen" variant="outline" disabled={isResolving} onClick={onCancel} />
                    <Button label="Zusätzlich hinzufügen" variant="outline" disabled={isResolving} onClick={onKeepBoth} />
                    <Button label="Ersetzen" variant="primary" disabled={isResolving} onClick={onReplace} />
                </>
            }
        >
            <p className="text-sm text-muted-foreground">
                Möchtest du das vorhandene Dokument ersetzen, oder das neue zusätzlich hinzufügen?
            </p>
        </Modal>
    );
}
