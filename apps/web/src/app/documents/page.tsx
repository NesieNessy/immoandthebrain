"use client";

import { Button, ConfirmDeleteModal, Dropdown, FilePickerButton, Header, Icons, Modal, PAGE_CONTAINER_CLASS, Switch, Table, Tag, TextField, TextFieldWithIcon, type MenuItem, type TableColumn } from '@/components/ui';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { deleteDocument, getDocumentsByUser, getDocumentUrl, uploadDocument } from '@/lib/supabase/document.supabase';
import { getProperties } from '@/lib/supabase/property.supabase';
import { getAllQuickChecks, type QuickCheckOverview } from '@/lib/supabase/quick_check.supabase';
import { deleteTaxExpenseDocument, getTaxExpenseDocumentsByUser, getTaxExpenseDocumentUrl } from '@/lib/supabase/tax_expense_document.supabase';
import { archiveTenancyDocument, deleteTenancyDocument, getTenancyDocumentsByUser, getTenancyDocumentUrl } from '@/lib/supabase/tenancy_document.supabase';
import { cn } from '@/lib/utils';
import type { DocumentCategory, Property } from '@immoandthebrain/types';
import { format } from 'date-fns';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { FileImage, FilePenLine, Sheet, type LucideIcon, Tags } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ViewMode = 'list' | 'byObject' | 'byCategory';

/** Unifies rows from the `document` table (uploaded/generated here) and
 *  `tenancy_document` (uploaded from the tenant-data documents table) into
 *  one shape so both render in the same list — the storage bucket differs
 *  per source, so it travels with the row for view/download/delete. */
interface DisplayDocument {
    key: string;
    source: 'document' | 'tenancy' | 'taxExpense';
    id: number;
    name: string;
    category: DocumentCategory;
    propertyId: number | null;
    quickCheckId: number | null;
    documentDate: string | null;
    fileName: string;
    storagePath: string;
    bucket: 'documents' | 'tenancy-documents' | 'tax-expense-documents';
    /** Only ever set for source: 'tenancy' rows — the `document` table has no
     *  versioning. Non-null = an old version, superseded by a later upload
     *  into the same slot; hidden by default, revealed via "Verlauf anzeigen". */
    supersededAt: string | null;
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
    { value: 'Persönlich', label: 'Persönlich' },
    { value: 'Bestandsobjekt', label: 'Bestandsobjekt' },
    { value: 'Detailbewertung', label: 'Detailbewertung' },
];

/** Simple age-based heuristic — not a real AI classification, just a
 *  "this looks stale" nudge shown as the KI-Hinweis column. Only meaningful
 *  for the current version of a document; superseded rows get a distinct
 *  "Archiviert" label instead (see KiHinweisPill) since Aktuell/Veraltet
 *  don't apply to a version that's already been replaced. */
function kiHinweis(documentDate: string | null): { label: string; ok: boolean } {
    if (!documentDate) return { label: 'Kein Datum', ok: false };
    const ageMonths = (Date.now() - new Date(documentDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    return ageMonths >= 3
        ? { label: 'Veraltet', ok: false }
        : { label: 'Aktuell', ok: true };
}

function KiHinweisPill({ doc }: { doc: DisplayDocument }) {
    if (doc.supersededAt) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-muted text-muted-foreground">
                <Icons.Archive className="w-3 h-3" />
                Archiviert
            </span>
        );
    }
    const { label, ok } = kiHinweis(doc.documentDate);
    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
            ok ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
        )}>
            {ok ? <Icons.CheckCircle2 className="w-3 h-3" /> : <Icons.AlertTriangle className="w-3 h-3" />}
            {label}
        </span>
    );
}

/** File-type icon by extension — a PDF looks different from a Word/Excel
 *  file or a photo at a glance. All the same blue so the shape (not the
 *  color) is what tells the type apart. */
function documentIcon(fileName: string): { Icon: LucideIcon; className: string } {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return { Icon: Icons.FileText, className: 'text-primary' };
    if (['jpg', 'jpeg', 'png'].includes(ext)) return { Icon: FileImage, className: 'text-primary' };
    if (['doc', 'docx'].includes(ext)) return { Icon: FilePenLine, className: 'text-primary' };
    if (['xls', 'xlsx'].includes(ext)) return { Icon: Sheet, className: 'text-primary' };
    return { Icon: Icons.File, className: 'text-primary' };
}

function propertyLabel(property: Property): string {
    return `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
}

function quickCheckLabel(qc: QuickCheckOverview): string {
    return `${qc.street}, ${qc.city}`;
}

export default function DocumentsPage() {
    const { user } = useRequireAuth();
    const [documents, setDocuments] = useState<DisplayDocument[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [quickChecks, setQuickChecks] = useState<QuickCheckOverview[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('byObject');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    // Old (replaced) versions are excluded by default — every "current"
    // document view elsewhere in the app only ever shows the current one too.
    const [showHistory, setShowHistory] = useState(false);

    const [showUpload, setShowUpload] = useState(false);
    const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('Persönlich');
    const [uploadObjectId, setUploadObjectId] = useState('');
    const [uploadName, setUploadName] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [pendingDelete, setPendingDelete] = useState<DisplayDocument | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!user) return;
        Promise.all([
            getDocumentsByUser(user.id),
            getTenancyDocumentsByUser(),
            getTaxExpenseDocumentsByUser(),
            getProperties(user.id),
            getAllQuickChecks(true),
        ]).then(([docs, tenancyDocs, taxExpenseDocs, props, qcs]) => {
            const fromDocuments: DisplayDocument[] = docs.map((d) => ({
                key: `document-${d.documentId}`,
                source: 'document',
                id: d.documentId,
                name: d.name,
                category: d.category,
                propertyId: d.propertyId,
                quickCheckId: d.quickCheckId,
                documentDate: d.documentDate,
                fileName: d.fileName,
                storagePath: d.storagePath,
                bucket: 'documents',
                supersededAt: null,
            }));
            const fromTenancy: DisplayDocument[] = tenancyDocs.map((d) => ({
                key: `tenancy-${d.tenancyDocumentId}`,
                source: 'tenancy',
                id: d.tenancyDocumentId,
                name: d.documentType,
                category: 'Bestandsobjekt',
                propertyId: d.propertyId,
                quickCheckId: null,
                documentDate: d.createdAt,
                fileName: d.fileName,
                storagePath: d.storagePath,
                bucket: 'tenancy-documents',
                supersededAt: d.supersededAt,
            }));
            const fromTaxExpense: DisplayDocument[] = taxExpenseDocs.map((d) => ({
                key: `taxExpense-${d.taxExpenseDocumentId}`,
                source: 'taxExpense',
                id: d.taxExpenseDocumentId,
                name: 'Steuerbeleg',
                category: 'Bestandsobjekt',
                propertyId: d.propertyId,
                quickCheckId: null,
                documentDate: d.createdAt,
                fileName: d.fileName,
                storagePath: d.storagePath,
                bucket: 'tax-expense-documents',
                supersededAt: null,
            }));
            setDocuments([...fromDocuments, ...fromTenancy, ...fromTaxExpense]);
            setProperties(props);
            setQuickChecks(qcs);
            setIsLoading(false);
        });
    }, [user]);

    // The actual linked object, or "–" when the document has none (every
    // Persönlich document, plus any Bestandsobjekt/Detailbewertung document
    // that wasn't linked to one) — this is what the "Objekt" table column shows.
    const resolveObject = useMemo(() => {
        const propertyById = new Map(properties.map((p) => [p.propertyId, p]));
        const quickCheckById = new Map(quickChecks.map((q) => [q.quickCheckId, q]));
        return (doc: DisplayDocument): string => {
            if (doc.category === 'Bestandsobjekt' && doc.propertyId != null) {
                const p = propertyById.get(doc.propertyId);
                return p ? propertyLabel(p) : '–';
            }
            if (doc.category === 'Detailbewertung' && doc.quickCheckId != null) {
                const q = quickCheckById.get(doc.quickCheckId);
                return q ? quickCheckLabel(q) : '–';
            }
            return '–';
        };
    }, [properties, quickChecks]);

    // Group key for the "Nach Objekt" view — Persönlich documents and any
    // document without a resolved object share one bucket each.
    const objectGroupKey = (doc: DisplayDocument): string => {
        if (doc.category === 'Persönlich') return 'Persönlich';
        const resolved = resolveObject(doc);
        return resolved !== '–' ? resolved : 'Ohne Objekt';
    };

    const filteredDocuments = useMemo(() => {
        const query = search.trim().toLowerCase();
        const base = showHistory ? documents : documents.filter((doc) => !doc.supersededAt);
        if (!query) return base;
        return base.filter((doc) =>
            doc.name.toLowerCase().includes(query) || resolveObject(doc).toLowerCase().includes(query)
        );
    }, [documents, search, showHistory, resolveObject]);

    const toggleGroup = (key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const openRowMenu = (doc: DisplayDocument): MenuItem[] => [
        {
            label: 'Ansehen',
            icon: <Icons.Eye className="w-4 h-4" />,
            onClick: () => void handleView(doc),
        },
        {
            label: 'Herunterladen',
            icon: <Icons.Download className="w-4 h-4" />,
            onClick: () => void handleDownload(doc),
        },
        // Only current tenancy-sourced documents can be archived — the
        // `document` table has no versioning concept, and an already-archived
        // row is history, not something to archive again.
        ...(doc.source === 'tenancy' && !doc.supersededAt
            ? [{
                label: 'Archivieren',
                icon: <Icons.Archive className="w-4 h-4" />,
                onClick: () => void handleArchive(doc),
            }]
            : []),
        {
            label: BUTTON_DETAILS.Delete.label,
            icon: <Icons.Trash2 className="w-4 h-4" />,
            destructive: true,
            onClick: () => setPendingDelete(doc),
        },
    ];

    const resolveUrl = (doc: DisplayDocument): Promise<string | null> => {
        if (doc.source === 'tenancy') return getTenancyDocumentUrl(doc.storagePath);
        if (doc.source === 'taxExpense') return getTaxExpenseDocumentUrl(doc.storagePath);
        return getDocumentUrl(doc.storagePath);
    };

    const handleView = async (doc: DisplayDocument) => {
        const url = await resolveUrl(doc);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleDownload = async (doc: DisplayDocument) => {
        const url = await resolveUrl(doc);
        if (!url) return;
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = doc.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    };

    const handleArchive = async (doc: DisplayDocument) => {
        const archived = await archiveTenancyDocument(doc.id);
        if (!archived) return;
        setDocuments((prev) => prev.map((d) => d.key === doc.key ? { ...d, supersededAt: archived.supersededAt } : d));
    };

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const success = pendingDelete.source === 'tenancy'
                ? await deleteTenancyDocument(pendingDelete.id, pendingDelete.storagePath)
                : pendingDelete.source === 'taxExpense'
                    ? await deleteTaxExpenseDocument(pendingDelete.id) !== null
                    : await deleteDocument(pendingDelete.id, pendingDelete.storagePath);
            if (success) {
                setDocuments((prev) => prev.filter((d) => d.key !== pendingDelete.key));
                setPendingDelete(null);
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const resetUploadForm = () => {
        setUploadCategory('Persönlich');
        setUploadObjectId('');
        setUploadName('');
        setUploadFile(null);
        setUploadError(null);
    };

    const handleUpload = async () => {
        if (!user || !uploadFile || uploadName.trim() === '') return;
        setIsUploading(true);
        setUploadError(null);
        try {
            const { document: uploaded, error } = await uploadDocument(user.id, uploadFile, {
                userId: user.id,
                category: uploadCategory,
                name: uploadName.trim(),
                propertyId: uploadCategory === 'Bestandsobjekt' && uploadObjectId ? Number(uploadObjectId) : null,
                quickCheckId: uploadCategory === 'Detailbewertung' && uploadObjectId ? Number(uploadObjectId) : null,
                documentDate: format(new Date(), 'yyyy-MM-dd'),
            });
            if (uploaded) {
                setDocuments((prev) => [{
                    key: `document-${uploaded.documentId}`,
                    source: 'document',
                    id: uploaded.documentId,
                    name: uploaded.name,
                    category: uploaded.category,
                    propertyId: uploaded.propertyId,
                    quickCheckId: uploaded.quickCheckId,
                    documentDate: uploaded.documentDate,
                    fileName: uploaded.fileName,
                    storagePath: uploaded.storagePath,
                    bucket: 'documents',
                    supersededAt: null,
                }, ...prev]);
                setShowUpload(false);
                resetUploadForm();
            } else {
                setUploadError(error ?? 'Dokument konnte nicht hochgeladen werden.');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const nameColumn: TableColumn<Record<string, unknown>> = {
        key: 'name',
        label: 'Name',
        width: '260px',
        sortable: true,
        renderCell: (v, row) => {
            const doc = row.doc as DisplayDocument;
            const { Icon, className } = documentIcon(doc.fileName);
            return (
                <span className="flex items-center gap-2 font-medium text-foreground max-w-[228px]">
                    <Icon className={cn("w-4 h-4 shrink-0", className)} />
                    <span className="truncate min-w-0" title={String(v)}>{String(v)}</span>
                    {doc.supersededAt && <Tag label="Alte Version" variant="muted" className="shrink-0" />}
                </span>
            );
        },
    };
    const categoryColumn: TableColumn<Record<string, unknown>> = {
        key: 'category',
        label: 'Kategorie',
        width: '160px',
        sortable: true,
        renderCell: (v) => <span className="block truncate max-w-[128px]" title={String(v)}>{String(v)}</span>,
    };
    const objectColumn: TableColumn<Record<string, unknown>> = {
        key: 'object',
        label: 'Objekt',
        width: '280px',
        sortable: true,
        renderCell: (v) => <span className="block truncate max-w-[248px]" title={String(v)}>{String(v)}</span>,
    };
    const dateColumn: TableColumn<Record<string, unknown>> = {
        key: 'dateLabel',
        label: 'Datum',
        width: '110px',
        sortable: true,
        renderCell: (v) => <span className="text-muted-foreground">{String(v)}</span>,
    };
    const hintColumn: TableColumn<Record<string, unknown>> = {
        key: 'documentDate',
        label: 'KI-Hinweis',
        width: '150px',
        renderCell: (_v, row) => <KiHinweisPill doc={row.doc as DisplayDocument} />,
    };
    const actionColumn: TableColumn<Record<string, unknown>> = {
        key: 'actions',
        label: '',
        width: '48px',
        renderCell: (_v, row) => (
            <Button
                iconOnly
                icon={<Icons.MoreVertical className="w-4 h-4" />}
                variant="ghost"
                size="sm"
                aria-label="Weitere Aktionen"
                menuItems={openRowMenu(row.doc as DisplayDocument)}
            />
        ),
    };

    const toRowData = (doc: DisplayDocument) => ({
        key: doc.key,
        name: doc.name,
        category: doc.category,
        object: resolveObject(doc),
        dateLabel: doc.documentDate ? format(new Date(doc.documentDate), 'dd.MM.yyyy') : '–',
        documentDate: doc.documentDate,
        doc,
    });

    const uploadObjectOptions = uploadCategory === 'Bestandsobjekt'
        ? properties.map((p) => ({ value: String(p.propertyId), label: propertyLabel(p) }))
        : uploadCategory === 'Detailbewertung'
            ? quickChecks.map((q) => ({ value: String(q.quickCheckId), label: quickCheckLabel(q) }))
            : [];

    const groupedByObject = useMemo(() => {
        const groups = new Map<string, DisplayDocument[]>();
        for (const doc of filteredDocuments) {
            const key = objectGroupKey(doc);
            groups.set(key, [...(groups.get(key) ?? []), doc]);
        }
        return Array.from(groups.entries()).sort(([a], [b]) => {
            if (a === 'Persönlich') return -1;
            if (b === 'Persönlich') return 1;
            if (a === 'Ohne Objekt') return 1;
            if (b === 'Ohne Objekt') return -1;
            return a.localeCompare(b);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredDocuments, resolveObject]);

    const groupedByCategory = useMemo(() => {
        const groups = new Map<DocumentCategory, DisplayDocument[]>();
        for (const doc of filteredDocuments) {
            groups.set(doc.category, [...(groups.get(doc.category) ?? []), doc]);
        }
        return CATEGORY_OPTIONS
            .map((c) => [c.value, groups.get(c.value) ?? []] as const)
            .filter(([, docs]) => docs.length > 0);
    }, [filteredDocuments]);

    return (
        <div className="min-h-screen bg-background pb-12">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[{ label: 'Dokumente' }]}
                    actions={
                        <Button
                            label="Dokument hochladen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            hideLabelOnMobile
                            onClick={() => setShowUpload(true)}
                        />
                    }
                />

                <div className="flex flex-wrap items-center gap-3">
                    <div className="max-w-sm flex-1 min-w-[220px]">
                        <TextFieldWithIcon
                            type="search"
                            icon={Icons.Search}
                            placeholder="Dokument suchen…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <span className="text-sm text-muted-foreground">{filteredDocuments.length} Dokumente</span>
                    <Switch
                        label="Verlauf anzeigen"
                        checked={showHistory}
                        onCheckedChange={setShowHistory}
                    />
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 ml-auto">
                        {([
                            { value: 'list', label: 'Liste', icon: Icons.List },
                            { value: 'byObject', label: 'Nach Objekt', icon: Icons.Building2 },
                            { value: 'byCategory', label: 'Nach Kategorie', icon: Tags },
                        ] as const).map((mode) => (
                            <button
                                key={mode.value}
                                type="button"
                                onClick={() => setViewMode(mode.value)}
                                className={cn(
                                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                                    viewMode === mode.value ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <mode.icon className="w-4 h-4" />
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-6">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Lädt…</p>
                    ) : filteredDocuments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Keine Dokumente gefunden.</p>
                    ) : viewMode === 'list' ? (
                        <Table
                            columns={[actionColumn, nameColumn, categoryColumn, objectColumn, dateColumn, hintColumn]}
                            data={filteredDocuments.map(toRowData)}
                            footerLeft={`${filteredDocuments.length} Einträge`}
                        />
                    ) : viewMode === 'byObject' ? (
                        groupedByObject.map(([label, docs]) => (
                            <div key={label}>
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(label)}
                                    className="w-full flex items-center justify-between gap-3 mb-2 pb-2 border-b border-border cursor-pointer"
                                >
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                                    <Icons.ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", collapsedGroups.has(label) && "-rotate-90")} />
                                </button>
                                {!collapsedGroups.has(label) && (
                                    <Table
                                        columns={[actionColumn, nameColumn, categoryColumn, dateColumn, hintColumn]}
                                        data={docs.map(toRowData)}
                                        footerLeft={`${docs.length} Einträge`}
                                    />
                                )}
                            </div>
                        ))
                    ) : (
                        groupedByCategory.map(([category, docs]) => (
                            <div key={category}>
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(category)}
                                    className="w-full flex items-center justify-between gap-3 mb-2 pb-2 border-b border-border cursor-pointer"
                                >
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{category}</span>
                                    <Icons.ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", collapsedGroups.has(category) && "-rotate-90")} />
                                </button>
                                {!collapsedGroups.has(category) && (
                                    <Table
                                        columns={[actionColumn, nameColumn, objectColumn, dateColumn, hintColumn]}
                                        data={docs.map(toRowData)}
                                        footerLeft={`${docs.length} Einträge`}
                                    />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </main>

            <Modal
                open={showUpload}
                onClose={() => { setShowUpload(false); resetUploadForm(); }}
                title="Dokument hochladen"
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={() => { setShowUpload(false); resetUploadForm(); }} />
                        <Button
                            label="Hochladen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            disabled={!uploadFile || uploadName.trim() === '' || isUploading}
                            onClick={() => void handleUpload()}
                        />
                    </>
                }
            >
                {uploadError && (
                    <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                        {uploadError}
                    </div>
                )}
                <Dropdown
                    label="Kategorie"
                    options={CATEGORY_OPTIONS}
                    value={uploadCategory}
                    onChange={(e) => { setUploadCategory(e.target.value as DocumentCategory); setUploadObjectId(''); }}
                />
                {uploadCategory !== 'Persönlich' && (
                    <Dropdown
                        label="Objekt"
                        optional
                        options={[{ value: '', label: 'Kein Objekt verknüpft' }, ...uploadObjectOptions]}
                        value={uploadObjectId}
                        onChange={(e) => setUploadObjectId(e.target.value)}
                    />
                )}
                <TextField
                    label="Name"
                    placeholder="z.B. Gehaltsnachweis"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                />
                <FilePickerButton
                    file={uploadFile}
                    onSelect={setUploadFile}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    id="document-upload-file"
                />
            </Modal>

            <ConfirmDeleteModal
                open={pendingDelete !== null}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => void handleConfirmDelete()}
                title="Dokument löschen?"
                confirmDisabled={isDeleting}
            >
                <p className="text-sm text-muted-foreground">
                    Möchten Sie <span className="font-medium text-foreground">{pendingDelete?.name}</span> wirklich löschen?
                </p>
            </ConfirmDeleteModal>
        </div>
    );
}
