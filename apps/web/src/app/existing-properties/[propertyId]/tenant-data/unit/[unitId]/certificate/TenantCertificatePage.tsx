"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Button, ConfirmDeleteModal, Header, Icons, Modal, PAGE_CONTAINER_CLASS, StickyActionBar, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DataCard, DocumentBox, DocumentReplaceModal, Field, initials, Pill } from '../../../DocumentGeneratorParts';
import { useMieterbescheinigungGenerator } from '../../../mieterbescheinigungGenerator';
import { certificateBodyHtml, isPersonComplete } from '../../../mieterbescheinigungLetter';

type View = 'review' | 'preview';

export default function TenantCertificatePage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const data = useMieterbescheinigungGenerator(propertyId, unitId);

    const [view, setView] = useState<View>('review');

    // The "Word-Dokument generieren" shortcut on the tenant-unit page can
    // link here with ?autoGenerate=1 to skip the extra click — waits for the
    // generator's own data load (canGenerate) before firing, and only once.
    const didAutoGenerate = useRef(false);
    useEffect(() => {
        if (didAutoGenerate.current) return;
        if (searchParams.get('autoGenerate') !== '1') return;
        if (data.isLoading || !data.canGenerate) return;
        didAutoGenerate.current = true;
        data.handleGenerate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, data.isLoading, data.canGenerate]);

    if (data.notFound) return <PropertyNotFoundPage />;
    if (data.isLoading || !data.property || !data.unit) return <PropertyLoadingPage />;

    const { property, unit } = data;
    const backHref = data.hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(data.hasMultipleUnits
            ? [
                { label: ExistingPropertiesUseCases.TenantData, href: `/existing-properties/${propertyId}/tenant-data` },
                { label: data.unitLabel, href: backHref },
            ]
            : [
                { label: ExistingPropertiesUseCases.TenantData, href: backHref },
            ]),
        { label: 'Mieterbescheinigung generieren' },
    ];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header items={breadcrumbItems} />

                <div className="flex items-center gap-2 p-1 rounded-lg bg-muted/50 w-fit">
                    <button
                        type="button"
                        onClick={() => setView('review')}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                            view === 'review' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Icons.ListChecks className="w-4 h-4" />
                        Daten prüfen
                    </button>
                    <button
                        type="button"
                        onClick={() => data.canGenerate && setView('preview')}
                        disabled={!data.canGenerate}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
                            view === 'preview' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Icons.Eye className="w-4 h-4" />
                        Vorschau
                    </button>
                </div>

                {view === 'review' ? (
                    <div className="mt-6 flex flex-col gap-6">
                        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/30">
                            <Icons.FileText className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                            <p className="text-sm text-muted-foreground">
                                Die Bescheinigung wird automatisch aus den hinterlegten Daten befüllt. Bitte prüfe die Angaben, bevor du das Dokument generierst.
                                Fehlende oder veraltete Daten können in den jeweiligen Bereichen ergänzt werden.
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vermieter</p>
                            {data.landlord === null ? (
                                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                                    <Icons.AlertTriangle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
                                    <p className="text-sm text-destructive">
                                        Es sind noch keine Vermieterdaten hinterlegt. Bitte ergänze diese in den{' '}
                                        <Link href="/user-settings" className="underline font-medium">Einstellungen</Link>.
                                    </p>
                                </div>
                            ) : (
                                <DataCard icon={Icons.Landmark} title="Vermieter-Daten" source="Einstellungen">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <Field label="Name" value={data.landlord ? data.landlordName : '–'} />
                                        <Field label="Straße & Hausnummer" value={data.landlord ? data.landlordStreet : '–'} />
                                        <Field label="PLZ & Ort" value={data.landlord ? data.landlordCity : '–'} />
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Eigentümer der Wohnung</p>
                                            {data.isLandlordOwner === null ? (
                                                <span className="text-sm text-muted-foreground">Noch nicht angegeben</span>
                                            ) : (
                                                <Pill ok={data.isLandlordOwner} label={data.isLandlordOwner ? 'Ja' : 'Nein'} />
                                            )}
                                        </div>
                                        <Button
                                            label={data.isLandlordOwner === null ? 'Angeben' : 'Ändern'}
                                            variant="outline"
                                            size="sm"
                                            onClick={data.openOwnerModalToEdit}
                                        />
                                    </div>
                                </DataCard>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietobjekt</p>
                            <DataCard icon={Icons.FileText} title="Objektdaten" source="Bestandsobjekt · Objektdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Field label="Straße & Hausnummer" value={data.propertyStreet} />
                                    <Field label="PLZ & Ort" value={data.propertyCity} />
                                    <Field label="Einheit" value={data.unitLabel} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietpartei(en)</p>
                            <DataCard icon={Icons.Users} title="Mieterdaten" source="Bestandsobjekt · Mieterdaten">
                                <div className="flex flex-col gap-2">
                                    {data.namedPersons.length === 0 && <p className="text-sm text-muted-foreground">Keine Mieterdaten hinterlegt.</p>}
                                    {data.namedPersons.map((person, index) => (
                                        <div key={index} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                                    {initials(person.firstName, person.lastName)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{`${person.firstName} ${person.lastName}`.trim()}</p>
                                                    <p className="text-xs text-muted-foreground">{person.isPrimary ? 'Hauptmieter' : 'Weitere Person'}</p>
                                                </div>
                                            </div>
                                            <Pill ok={isPersonComplete(person)} label={isPersonComplete(person) ? 'Vollständig' : 'Unvollständig'} />
                                        </div>
                                    ))}
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietverhältnis</p>
                            <DataCard icon={Icons.FileText} title="Mietvertrag" source="Bestandsobjekt · Mietvertrag">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Mieteinzug" value={data.mietbeginn} />
                                    <Field label="Mietauszug" value={data.mietende ?? 'noch nicht bekannt'} />
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mietvertrag aktiv</p>
                                        <div className="mt-1"><Pill ok={data.mietvertragAktiv} label={data.mietvertragAktiv ? 'Ja' : 'Nein'} /></div>
                                    </div>
                                    <Field label="Ausstellungsort" value={data.issuePlace || '–'} />
                                    <Field label="Ausstellungsdatum" value={data.issueDate} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Hochgeladene Dokumente</p>
                            <DocumentBox
                                docs={data.documents}
                                label={data.tenantLabel}
                                onView={data.handleViewDocument}
                                onDownload={data.handleDownloadDocument}
                                onDelete={data.requestDeleteDoc}
                                isBusy={(doc) => data.deletingDocId === doc.tenancyDocumentId}
                                emptyLabel="Noch keine Mieterbescheinigung hochgeladen."
                            />
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Unterschrift Vermieter</p>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <Pill ok={data.signatureDataUrl != null} label={data.signatureDataUrl != null ? 'Unterschrift hinterlegt' : 'Keine Unterschrift hinterlegt'} />
                                    {!data.signatureDataUrl && <span className="ml-2 text-xs text-muted-foreground">Das Dokument wird ohne Unterschrift generiert.</span>}
                                </div>
                                <div className="rounded-lg border border-dashed border-border p-4 flex items-center justify-between gap-4 flex-wrap">
                                    {data.signatureDataUrl ? (
                                        <div className="flex items-center gap-3">
                                            <img src={data.signatureDataUrl} alt="Unterschrift" className="h-12 max-w-[180px] object-contain" />
                                            <button type="button" onClick={() => data.setSignatureDataUrl(null)} className="text-sm text-destructive hover:underline cursor-pointer">
                                                Entfernen
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground max-w-md">
                                            Lade eine Unterschrift als Bilddatei hoch (PNG, JPG). Diese wird automatisch in das generierte Word-Dokument eingefügt.
                                            Alternativ kann die Unterschrift nachträglich im Dokument ergänzt werden.
                                        </p>
                                    )}
                                    <input
                                        id="signature-upload"
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        className="sr-only"
                                        disabled={data.isUploadingSignature}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) void data.handleUploadSignature(file);
                                        }}
                                    />
                                    <label htmlFor="signature-upload">
                                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-primary text-primary text-sm font-medium cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground">
                                            <Icons.Upload className="w-4 h-4" />
                                            Unterschrift hochladen
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6">
                        <div className="flex items-center justify-center px-6 py-3 mb-4 rounded-lg border border-border bg-muted/30">
                            <Pill ok={data.signatureDataUrl != null} label={data.signatureDataUrl != null ? 'Unterschrift hinterlegt' : 'Keine Unterschrift hinterlegt'} />
                        </div>
                        {data.canGenerate ? (
                            <div
                                className="bg-white text-black rounded-md shadow-sm p-8 text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: certificateBodyHtml(data.content) }}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Es fehlen noch Angaben (Vermieterdaten oder Mieterdaten), um die Vorschau anzuzeigen.
                            </p>
                        )}
                    </div>
                )}
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                onPrimary={data.handleGenerate}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={data.isGenerating ? 'Wird erstellt…' : 'Word-Dokument generieren'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!data.canGenerate || data.isGenerating}
            />

            <Modal
                open={data.ownerModalOpen}
                onClose={data.closeOwnerModal}
                title="Eigentümer der Wohnung"
                subtitle="Ist der Vermieter gleichzeitig Eigentümer der Wohnung?"
                icon={<Icons.Landmark className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Nein" variant="outline" onClick={() => data.handleConfirmOwner(false)} />
                        <Button label="Ja" variant="primary" onClick={() => data.handleConfirmOwner(true)} />
                    </>
                }
            />

            <Modal
                open={data.uploadPromptOpen}
                onClose={data.closeUploadPrompt}
                title="Zu den Mieterdokumenten hochladen?"
                subtitle={data.pendingGeneratedFileName ? `${data.pendingGeneratedFileName} wurde heruntergeladen.` : undefined}
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Nicht hochladen" variant="outline" onClick={data.closeUploadPrompt} />
                        <Button label="Hochladen" variant="primary" onClick={data.confirmUploadPrompt} />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du das generierte Dokument auch zu den Mieterdokumenten hinzufügen, damit es hier und in der Dokumente-Übersicht auffindbar ist?
                </p>
            </Modal>

            <DocumentReplaceModal
                open={data.replaceFlow.pending != null}
                fileName={data.documents[0]?.fileName}
                isResolving={data.replaceFlow.isResolving}
                onReplace={() => void data.replaceFlow.confirmReplace()}
                onKeepBoth={() => void data.replaceFlow.keepBoth()}
                onCancel={data.replaceFlow.cancel}
            />

            <ConfirmDeleteModal
                open={data.pendingDeleteDoc != null}
                onCancel={data.cancelDeleteDoc}
                onConfirm={() => void data.confirmDeleteDoc()}
                title="Dokument löschen?"
                confirmDisabled={data.deletingDocId != null}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du <span className="font-medium text-foreground">{data.pendingDeleteDoc?.fileName}</span> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
            </ConfirmDeleteModal>
        </div>
    );
}
