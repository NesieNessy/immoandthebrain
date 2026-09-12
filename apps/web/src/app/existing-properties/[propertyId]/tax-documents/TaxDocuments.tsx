"use client";
import { useState } from 'react';

import { buildPropertyUseCaseBreadcrumb, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, FilePickerButton, Header, Icons, Modal, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { deCurrencyFormatter } from '@/lib/utils';
import type { TaxExpenseDocument } from '@immoandthebrain/types';
import { useRouter } from 'next/navigation';

import { useTaxDocumentsData } from './useTaxDocumentsData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
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

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const backHref = `/existing-properties/${propertyId}`;

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
                    items={buildPropertyUseCaseBreadcrumb(data.property, propertyId, ExistingPropertiesUseCases.TaxDocuments)}
                />

                <div className="space-y-6">
                    <div className="px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-foreground">
                        Bündle deine angefallenen Kosten für dieses Objekt und mache sie später bei der Steuererklärung geltend.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Kategorien</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{data.rows.length}</p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Belege hochgeladen</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{data.totalDocuments}</p>
                        </div>
                        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Gesamtbetrag</p>
                            <p className="mt-2 text-2xl font-semibold text-foreground">{euro(data.totalAmount)}</p>
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Kostenkategorien</SectionLabel>
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
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Kategorie</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Betrag</th>
                                            <th className="px-3 py-2 text-left whitespace-nowrap">Belege</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {data.rows.map(({ category, documents, isUploading }) => (
                                            <tr key={category.taxExpenseCategoryId}>
                                                <td className="px-3 py-3 min-w-[180px] align-top">
                                                    <TextField
                                                        value={category.label}
                                                        onChange={(e) => data.updateLocalLabel(category.taxExpenseCategoryId, e.target.value)}
                                                        onBlur={(e) => void data.persistLabel(category.taxExpenseCategoryId, e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-3 py-3 w-32 align-top">
                                                    <p className="pt-2 font-medium text-foreground">{euro(category.amount)}</p>
                                                </td>
                                                <td className="px-3 py-3 min-w-[240px] align-top">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {documents.map((document) => (
                                                            <DocumentChip
                                                                key={document.taxExpenseDocumentId}
                                                                document={document}
                                                                onView={() => void data.viewDocument(document)}
                                                                onRemove={() => void data.removeDocument(category.taxExpenseCategoryId, document)}
                                                            />
                                                        ))}
                                                        <Button
                                                            label={isUploading ? 'Wird hochgeladen…' : 'Beleg hinzufügen'}
                                                            icon={isUploading ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Upload className="w-4 h-4" />}
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={isUploading}
                                                            onClick={() => setUploadCategoryId(category.taxExpenseCategoryId)}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 align-top">
                                                    <button
                                                        type="button"
                                                        onClick={() => data.setPendingDelete(category)}
                                                        aria-label="Kategorie entfernen"
                                                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                                    >
                                                        <Icons.Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center px-4 py-3 border-t border-border bg-card text-xs text-muted-foreground">
                                {data.rows.length} Einträge
                            </div>
                        </div>
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
            </ConfirmDeleteModal>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                onPrimary={() => router.push(backHref)}
                primaryLabel="Steuerunterlagen speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon className="w-4 h-4" />}
            />
        </div>
    );
}
