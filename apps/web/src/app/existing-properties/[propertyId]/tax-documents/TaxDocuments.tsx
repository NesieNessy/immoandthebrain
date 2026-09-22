"use client";
import { useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, FilePickerButton, Header, Icons, Modal, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, Switch, Tag, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import type { TaxCompletionStatus, TaxYearBreakdown } from '@/lib/taxExpense/taxYearSummary';
import { cn, deCurrencyFormatter } from '@/lib/utils';
import type { TaxExpenseDocument } from '@immoandthebrain/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useTaxDocumentsData } from './useTaxDocumentsData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
}

const STATUS_META: Record<TaxCompletionStatus, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    complete: { label: '✓ Vollständig', variant: 'success' },
    partial: { label: 'Belege fehlen', variant: 'warning' },
    incomplete: { label: 'Unvollständig', variant: 'danger' },
};

function YearCard({
    summary,
    selected,
    archived,
    onSelect,
    onArchiveToggle,
    onDelete,
}: {
    summary: TaxYearBreakdown;
    selected: boolean;
    archived: boolean;
    onSelect: () => void;
    onArchiveToggle: () => void;
    onDelete: () => void;
}) {
    const status = STATUS_META[summary.status];
    return (
        <div
            className={cn(
                'rounded-lg border p-4 transition-colors',
                selected ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border bg-card hover:border-primary/40',
                archived && 'opacity-70',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={onSelect} className="text-lg font-bold text-foreground cursor-pointer hover:underline">
                    {summary.year}
                </button>
                <div className="flex items-center gap-1.5">
                    {archived && <Tag label="Archiviert" variant="muted" size="sm" />}
                    <Tag
                        label={summary.status === 'partial' ? `⚠ ${summary.missingCount} Beleg${summary.missingCount === 1 ? '' : 'e'} fehlen` : status.label}
                        variant={status.variant}
                        size="sm"
                    />
                    <Button
                        iconOnly
                        icon={<Icons.MoreVertical className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        aria-label={`Jahr ${summary.year}: weitere Aktionen`}
                        menuItems={[
                            {
                                label: archived ? 'Archivierung aufheben' : 'Archivieren',
                                icon: <Icons.Archive className="w-4 h-4" />,
                                onClick: onArchiveToggle,
                            },
                            {
                                label: 'Löschen',
                                icon: <Icons.Trash2 className="w-4 h-4" />,
                                destructive: true,
                                onClick: onDelete,
                            },
                        ]}
                    />
                </div>
            </div>
            <button type="button" onClick={onSelect} className="mt-3 block w-full cursor-pointer text-left">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Gesamtbetrag</p>
                <p className="text-lg font-semibold text-foreground">{euro(summary.totalAmount)}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Kategorien</span>
                    <span className="font-medium text-foreground">{summary.categoryCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Belege</span>
                    <span className="font-medium text-foreground">{summary.documentCount}</span>
                </div>
            </button>
        </div>
    );
}

function DocumentChip({ document, onView, onRemove }: { document: TaxExpenseDocument; onView: () => void; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-border bg-muted/40 text-xs max-w-[220px]">
            <Icons.FileText className="w-3.5 h-3.5 text-primary shrink-0" />
            <button
                type="button"
                onClick={onView}
                className="truncate text-foreground hover:underline cursor-pointer"
                title={document.fileName}
            >
                {document.fileName}
            </button>
            <span className="text-muted-foreground shrink-0">{euro(document.amount)}</span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`${document.fileName} entfernen`}
                className="p-0.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
            >
                <Icons.X className="w-3 h-3" />
            </button>
        </span>
    );
}

export default function TaxDocuments({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const data = useTaxDocumentsData(propertyId);

    const [uploadCategoryId, setUploadCategoryId] = useState<number | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadAmount, setUploadAmount] = useState('');
    const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
    const [addYearOpen, setAddYearOpen] = useState(false);
    const [yearInput, setYearInput] = useState('');

    if (data.isLoading || data.currentYearBreakdown == null) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const backHref = `/existing-properties/${propertyId}`;

    const openAddYear = () => {
        setYearInput(String(Math.max(...data.availableYears, new Date().getFullYear()) + 1));
        setAddYearOpen(true);
    };
    const yearInputValue = Number(yearInput);
    const yearInputValid = yearInput !== '' && Number.isInteger(yearInputValue) && yearInputValue >= 1900 && yearInputValue <= 2200;
    const yearAlreadyExists = yearInputValid && data.availableYears.includes(yearInputValue);
    const confirmAddYear = () => {
        if (!yearInputValid || yearAlreadyExists) return;
        data.addYear(yearInputValue);
        setAddYearOpen(false);
    };

    const closeUploadModal = () => {
        setUploadCategoryId(null);
        setUploadFile(null);
        setUploadAmount('');
    };

    const confirmUpload = async () => {
        if (uploadCategoryId == null || !uploadFile || Number(uploadAmount) <= 0) return;
        setIsSubmittingUpload(true);
        const success = await data.addDocument(uploadCategoryId, uploadFile, Number(uploadAmount));
        setIsSubmittingUpload(false);
        if (success) closeUploadModal();
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={buildPropertyUseCaseBreadcrumb(
                        data.property,
                        propertyId,
                        ExistingPropertiesUseCases.TaxDocuments,
                        data.hasMultipleUnits && data.contextUnit
                            ? { label: formatUnitLabel(data.contextUnit.unitLabel, data.contextUnit.floor, data.contextUnit.locationNote), href: `/existing-properties/${propertyId}/${data.contextUnit.propertyUnitId}` }
                            : undefined,
                    )}
                />

                <div className="space-y-6">
                    <Link
                        href="/tax-overview"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-info/10 border border-info/30 hover:bg-info/15 transition-colors"
                    >
                        <Icons.ClipboardList className="w-5 h-5 text-info shrink-0" />
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-info">Steuerübersicht alle Objekte öffnen</span>
                            <span className="block text-xs text-muted-foreground">Kreuztabelle aller Kosten über alle Objekte und Einheiten eines Steuerjahres</span>
                        </span>
                        <Icons.ChevronRight className="w-4 h-4 text-info shrink-0" />
                    </Link>

                    <div>
                        <SectionLabel>Dieses Objekt · nach Jahr</SectionLabel>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            {data.archivedYearCount > 0 ? (
                                <Switch
                                    label={`Archivierte Jahre anzeigen (${data.archivedYearCount})`}
                                    checked={data.showArchivedYears}
                                    onCheckedChange={data.setShowArchivedYears}
                                />
                            ) : <span />}
                            <Button
                                label="Jahr hinzufügen"
                                icon={<Icons.Plus className="w-4 h-4" />}
                                variant="outline"
                                size="sm"
                                onClick={openAddYear}
                            />
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {data.yearSummaries.map((summary) => (
                                <YearCard
                                    key={summary.year}
                                    summary={summary}
                                    selected={summary.year === data.selectedYear}
                                    archived={data.archivedYears.has(summary.year)}
                                    onSelect={() => data.setSelectedYear(summary.year)}
                                    onArchiveToggle={() => (data.archivedYears.has(summary.year) ? data.unarchiveYear(summary.year) : data.archiveYear(summary.year))}
                                    onDelete={() => data.requestDeleteYear(summary.year)}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Kostenkategorien {data.selectedYear}</SectionLabel>
                        <div className="mt-3 flex justify-end">
                            <Button
                                label="Kategorie hinzufügen"
                                icon={<Icons.Plus className="w-4 h-4" />}
                                variant="outline"
                                size="sm"
                                onClick={() => void data.addCategory()}
                            />
                        </div>
                        <div className="mt-3 rounded-lg border border-border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-primary/8 border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                                            <th className="w-10"></th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Kategorie</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Betrag</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Belege</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {data.currentYearBreakdown.categories.map(({ categoryId, label, amount, documents, manuallyComplete }) => {
                                            const isUploading = data.isCategoryUploading(categoryId);
                                            return (
                                            <tr key={categoryId}>
                                                <td className="px-2 py-3 align-top">
                                                    <Button
                                                        iconOnly
                                                        icon={<Icons.MoreVertical className="w-4 h-4" />}
                                                        variant="ghost"
                                                        size="sm"
                                                        aria-label="Weitere Aktionen"
                                                        menuItems={[
                                                            {
                                                                label: isUploading ? 'Wird hochgeladen…' : 'Beleg hinzufügen',
                                                                icon: isUploading ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Upload className="w-4 h-4" />,
                                                                disabled: isUploading,
                                                                onClick: () => setUploadCategoryId(categoryId),
                                                            },
                                                            {
                                                                label: manuallyComplete ? 'Als unvollständig markieren' : 'Als vollständig markieren',
                                                                icon: manuallyComplete ? <Icons.X className="w-4 h-4" /> : <Icons.CheckCircle2 className="w-4 h-4" />,
                                                                onClick: () => void data.toggleCategoryComplete(categoryId),
                                                            },
                                                            {
                                                                label: 'Löschen',
                                                                icon: <Icons.Trash2 className="w-4 h-4" />,
                                                                destructive: true,
                                                                onClick: () => {
                                                                    const rawCategory = data.rows.find((row) => row.category.taxExpenseCategoryId === categoryId)?.category;
                                                                    if (rawCategory) data.setPendingDelete(rawCategory);
                                                                },
                                                            },
                                                        ]}
                                                    />
                                                </td>
                                                <td className="px-3 py-3 min-w-[180px] align-top">
                                                    <TextField
                                                        value={label}
                                                        placeholder="Neue Kategorie"
                                                        onChange={(e) => data.updateLocalLabel(categoryId, e.target.value)}
                                                        onBlur={(e) => void data.persistLabel(categoryId, e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-3 py-3 w-32 align-top">
                                                    <p className="pt-2 font-medium text-foreground">{documents.length > 0 ? euro(amount) : '–'}</p>
                                                </td>
                                                <td className="px-3 py-3 min-w-[220px] align-top">
                                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                                        {documents.map((document) => (
                                                            <DocumentChip
                                                                key={document.taxExpenseDocumentId}
                                                                document={document}
                                                                onView={() => void data.viewDocument(document)}
                                                                onRemove={() => void data.removeDocument(categoryId, document)}
                                                            />
                                                        ))}
                                                        {documents.length === 0 && (
                                                            manuallyComplete
                                                                ? <Tag label="Vollständig (manuell)" variant="success" size="sm" />
                                                                : <Tag label="Beleg fehlt" variant="warning" size="sm" />
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center px-4 py-3 border-t border-border bg-card text-xs text-muted-foreground">
                                {data.currentYearBreakdown.categoryCount} Einträge
                            </div>
                        </div>
                        {data.hasEmptyCategoryLabel && (
                            <p className="mt-2 text-sm text-destructive">
                                Bitte vergib für jede Kategorie einen Namen, bevor du speicherst.
                            </p>
                        )}
                    </div>
                </div>
            </main>

            <Modal
                open={uploadCategoryId !== null}
                onClose={closeUploadModal}
                title="Beleg hinzufügen"
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Abbrechen" icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={closeUploadModal} />
                        <Button
                            label="Hochladen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            disabled={!uploadFile || Number(uploadAmount) <= 0 || isSubmittingUpload}
                            onClick={() => void confirmUpload()}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Trage den Betrag ein, den dieser Beleg zur Kategorie beiträgt — die Kategoriesumme wird daraus automatisch berechnet.
                </p>
                <NumberField
                    label="Betrag"
                    unit="€"
                    value={uploadAmount}
                    onChange={(e) => setUploadAmount(e.target.value)}
                    min={0}
                />
                <FilePickerButton
                    file={uploadFile}
                    onSelect={setUploadFile}
                    accept=".pdf,.jpg,.jpeg,.png"
                    id="tax-expense-document-upload"
                />
            </Modal>

            <Modal
                open={addYearOpen}
                onClose={() => setAddYearOpen(false)}
                title="Jahr hinzufügen"
                icon={<Icons.Plus className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Abbrechen" icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={() => setAddYearOpen(false)} />
                        <Button
                            label="Hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="primary"
                            disabled={!yearInputValid || yearAlreadyExists}
                            onClick={confirmAddYear}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Für welches Jahr möchtest du eine Karte hinzufügen?
                </p>
                <NumberField
                    label="Jahr"
                    value={yearInput}
                    onChange={(e) => setYearInput(e.target.value)}
                    min={1900}
                    max={2200}
                    hideStepper
                />
                {yearAlreadyExists && (
                    <p className="text-sm text-destructive">Für dieses Jahr existiert bereits eine Karte.</p>
                )}
            </Modal>

            <ConfirmDeleteModal
                open={data.pendingDelete !== null}
                onCancel={() => data.setPendingDelete(null)}
                onConfirm={() => void data.confirmDeleteCategory()}
                title="Kategorie löschen?"
                confirmDisabled={data.isDeleting}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du <span className="font-medium text-foreground">{data.pendingDelete?.label}</span> und alle zugehörigen Belege wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <p className="mt-2 text-sm text-warning">
                    Diese Kategorie wird auch bei allen anderen Bestandsobjekten gelöscht, die sie verwenden.
                </p>
            </ConfirmDeleteModal>

            <ConfirmDeleteModal
                open={data.pendingDeleteYear !== null}
                onCancel={data.cancelDeleteYear}
                onConfirm={() => void data.confirmDeleteYear()}
                title="Jahr löschen?"
                confirmDisabled={data.isDeletingYear}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du alle Belege aus <span className="font-medium text-foreground">{data.pendingDeleteYear}</span> für dieses Objekt wirklich unwiderruflich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                    Die Kostenkategorien selbst bleiben erhalten — nur die für {data.pendingDeleteYear} hochgeladenen Belege werden entfernt. Andere Bestandsobjekte sind davon nicht betroffen.
                </p>
            </ConfirmDeleteModal>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                onPrimary={() => router.push(backHref)}
                primaryLabel="Steuerunterlagen speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon className="w-4 h-4" />}
                primaryDisabled={data.hasEmptyCategoryLabel}
            />
        </div>
    );
}
