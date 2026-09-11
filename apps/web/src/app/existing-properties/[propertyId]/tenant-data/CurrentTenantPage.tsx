"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { DataCard, DocumentBox, DocumentReplaceModal, DocumentUploadButton } from './DocumentGeneratorParts';
import { Button, CalendarField, ComingSoonButton, ConfirmDeleteModal, Dropdown, FilePickerButton, Header, Icons, Modal, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, Table, Tag, TextField, UnsavedChangesModal, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getCurrentTenancyByUnit, updateTenancy } from '@/lib/supabase/tenancy.supabase';
import type { Property, PropertyUnit } from '@immoandthebrain/types';
import { formatDeDate } from '@/lib/utils';
import { format } from 'date-fns';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useMieterbescheinigungGenerator } from './mieterbescheinigungGenerator';
import { personDisplayName, useTenantUnitData } from './useTenantUnitData';

interface CurrentTenantPageProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
    /** Set when reached from the tenant history's "Ansehen" action — renders
     *  this same page for a past tenancy instead of the unit's current one,
     *  with an "Archiviert" indicator and the move-out date surfaced. */
    archivedTenancyId?: number;
}

/** The current-tenant page: person data, documents, tenant certificate,
 *  deposit. The rental agreement lives entirely on its own independent
 *  page/route now (see ../tenant-agreement/TenantAgreementPage) — the two
 *  are deliberately not sharing chrome (breadcrumb, header actions, sticky
 *  bar) beyond the data layer. */
export function CurrentTenantPage({ propertyId, property, unit, hasMultipleUnits, archivedTenancyId }: CurrentTenantPageProps) {
    const data = useTenantUnitData(propertyId, property, unit, hasMultipleUnits, archivedTenancyId);
    // Own independent data load (see useMieterbescheinigungGenerator's doc
    // comment) — lets "Word-Dokument generieren" run right here instead of
    // navigating to the /certificate review page first.
    const certGen = useMieterbescheinigungGenerator(propertyId, String(unit.propertyUnitId), () => void data.refreshDocuments(), archivedTenancyId);
    const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
    const [isReactivating, setIsReactivating] = useState(false);

    // Clears this tenancy's move-out so it becomes the unit's current
    // tenancy again — same action as Mieterhistorie's "Reaktivieren", just
    // reachable from the detail view too. If another tenancy is currently
    // active on this unit, that one is ended (today) first so the unit
    // doesn't end up with two open-ended tenancies.
    const handleConfirmReactivate = async () => {
        if (!data.tenancy) return;
        setIsReactivating(true);
        try {
            const current = await getCurrentTenancyByUnit(unit.propertyUnitId);
            if (current && current.tenancyId !== data.tenancy.tenancyId) {
                await updateTenancy(current.tenancyId, { tenancyEndDate: format(new Date(), 'yyyy-MM-dd') });
            }
            await updateTenancy(data.tenancy.tenancyId, { tenancyEndDate: null, isRented: true });
            setReactivateModalOpen(false);
            data.goTo(hasMultipleUnits ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}` : `/existing-properties/${propertyId}/tenant-data`);
        } finally {
            setIsReactivating(false);
        }
    };

    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);
    const archivedTenantName = data.isArchived && data.persons[0] ? personDisplayName(data.persons[0], 0) : 'Archiviert';

    const breadcrumbItems: BreadcrumbItem[] = data.isArchived
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: address, href: `/existing-properties/${propertyId}` },
            ...(hasMultipleUnits
                ? [
                    { label: 'Wohneinheiten', href: `/existing-properties/${propertyId}/tenant-history` },
                    { label: unitLabel, href: `/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}` },
                ]
                : [{ label: 'Mieterhistorie', href: `/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}` }]),
            { label: archivedTenantName },
        ]
        : hasMultipleUnits
            ? [
                {
                    label: 'Bestandsobjekte',
                    href: '/existing-properties',
                    onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } },
                },
                {
                    label: address,
                    href: `/existing-properties/${propertyId}`,
                    onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } },
                },
                {
                    label: unitLabel,
                    href: `/existing-properties/${propertyId}/${unit.propertyUnitId}`,
                    onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}/${unit.propertyUnitId}`); } },
                },
                { label: ExistingPropertiesUseCases.TenantData },
            ]
            : [
                {
                    label: 'Bestandsobjekte',
                    href: '/existing-properties',
                    onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } },
                },
                {
                    label: address,
                    href: `/existing-properties/${propertyId}`,
                    onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } },
                },
                { label: ExistingPropertiesUseCases.TenantData },
            ];

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={breadcrumbItems}
                />

                <div className="space-y-6">
                    {data.error && (
                        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                            {data.error}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            {data.isArchived ? (
                                <>
                                    <Tag label="Archiviert" variant="muted" size="md" />
                                    <Icons.Archive className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                        Auszugsdatum: {formatDeDate(data.tenancy?.tenancyEndDate)}
                                    </span>
                                </>
                            ) : (
                                <Tag label={data.status} variant={data.status === 'Vermietet' ? 'success' : 'muted'} size="md" />
                            )}
                        </div>
                        {!data.isArchived && (
                            <div className="flex items-center gap-3">
                                <Button
                                    label="Mieterwechsel"
                                    icon={<Icons.RefreshCw className="w-4 h-4" />}
                                    variant="outline"
                                    onClick={() => data.setTenantChangeModalOpen(true)}
                                />
                                <Button
                                    label="Person hinzufügen"
                                    icon={<Icons.Plus className="w-4 h-4" />}
                                    variant="primary"
                                    onClick={data.addPerson}
                                />
                            </div>
                        )}
                    </div>

                    {/* Person cards */}
                    <div className="flex flex-col gap-4">
                        {data.persons.map((person, index) => (
                            <div key={index} className="p-4 rounded-lg border border-border bg-card">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <Icons.User className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm font-semibold text-foreground">Person {index + 1}</span>
                                        {person.isPrimary && <Tag label="Hauptmieter" variant="gold" />}
                                    </div>
                                    {index > 0 && !data.isArchived && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => data.makePrimary(index)}
                                                aria-label="Zum Hauptmieter machen"
                                                title="Zum Hauptmieter machen"
                                                className="p-1.5 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                            >
                                                <Icons.Star className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => data.handleDeletePersonClick(index)}
                                                aria-label="Person entfernen"
                                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                            >
                                                <Icons.Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                    <TextField
                                        label="Nachname"
                                        optional={!person.isPrimary}
                                        value={person.lastName}
                                        onChange={(e) => data.updatePerson(index, { lastName: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <TextField
                                        label="Vorname"
                                        optional={!person.isPrimary}
                                        value={person.firstName}
                                        onChange={(e) => data.updatePerson(index, { firstName: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <TextField
                                        label="Steuer-ID"
                                        optional={!person.isPrimary}
                                        placeholder="00 000 000 000"
                                        value={person.taxId}
                                        onChange={(e) => data.updatePerson(index, { taxId: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <CalendarField
                                        label="Einzugsdatum"
                                        optional={!person.isPrimary}
                                        value={person.moveInDate}
                                        onChange={(date) => data.updatePerson(index, { moveInDate: date })}
                                        disabled={data.isArchived}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Documents */}
                    <div>
                        <SectionLabel>Unterlagen</SectionLabel>
                        {!data.isArchived && (
                            <div className="mt-3 flex justify-end">
                                <span title={data.canUploadDocument ? undefined : 'Bitte zuerst speichern'}>
                                    <Button
                                        label="Dokument hochladen"
                                        icon={<Icons.Upload className="w-4 h-4" />}
                                        variant="outline"
                                        size="sm"
                                        disabled={!data.canUploadDocument}
                                        onClick={data.openDocUploadModal}
                                    />
                                </span>
                            </div>
                        )}
                        <div className="mt-3">
                            <Table
                                columns={data.documentColumns}
                                data={data.documentTableData}
                                sortKey={data.docSortKey}
                                sortDirection={data.docSortDirection}
                                onSort={data.handleDocSort}
                                columnFilters={data.docColumnFilters}
                                onColumnFilterChange={data.handleDocColumnFilterChange}
                                footerLeft={`${data.documentTableData.length} Einträge`}
                            />
                        </div>
                    </div>

                    {/* Generatable documents */}
                    <div>
                        <SectionLabel>Generierbare Dokumente</SectionLabel>
                        <div className="mt-3 flex flex-col gap-4">
                            <DataCard
                                icon={Icons.BadgeCheck}
                                title="Mieterbescheinigung"
                                footer={
                                    data.isArchived ? undefined : (
                                        <>
                                            <DocumentUploadButton
                                                onSelect={(file) => certGen.replaceFlow.requestUpload(file, certGen.documents)}
                                                disabled={data.tenancy == null}
                                                disabledTitle="Bitte zuerst speichern"
                                            />
                                            <Button
                                                label="Daten prüfen & Vorschau"
                                                icon={<Icons.Eye className="w-4 h-4" />}
                                                variant="outline"
                                                disabled={data.tenancy == null}
                                                onClick={() => data.goTo(`${data.generatorBase}/certificate`)}
                                            />
                                            <span title={!certGen.canGenerate ? 'Bitte zuerst Vermieter- und Mieterdaten vervollständigen' : undefined}>
                                                <Button
                                                    label={certGen.isGenerating ? 'Wird erstellt…' : 'Word-Dokument generieren'}
                                                    icon={certGen.isGenerating ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.FileText className="w-4 h-4" />}
                                                    variant="primary"
                                                    disabled={!certGen.canGenerate || certGen.isGenerating}
                                                    onClick={certGen.handleGenerate}
                                                />
                                            </span>
                                        </>
                                    )
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <DocumentBox
                                        docs={certGen.documents}
                                        label={certGen.tenantLabel}
                                        onView={certGen.handleViewDocument}
                                        onDownload={certGen.handleDownloadDocument}
                                        onDelete={certGen.requestDeleteDoc}
                                        isBusy={(doc) => certGen.deletingDocId === doc.tenancyDocumentId}
                                        readOnly={data.isArchived}
                                        emptyLabel={data.isArchived ? 'Keine Mieterbescheinigung vorhanden' : undefined}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Bestätigt das bestehende Mietverhältnis für alle Mietparteien auf Basis der hinterlegten Daten.
                                    </p>
                                </div>
                            </DataCard>
                        </div>
                    </div>

                    {/* Security deposit */}
                    <div>
                        <SectionLabel>Mietkaution</SectionLabel>
                        <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-end gap-3">
                            <div className="w-full sm:w-48">
                                <NumberField
                                    label="Betrag (informativ)"
                                    placeholder="z.B. 2.400"
                                    unit="€"
                                    value={data.deposit}
                                    onChange={(e) => data.setDeposit(e.target.value)}
                                    min={0}
                                    disabled={data.isArchived}
                                />
                            </div>
                            {!data.isArchived && (
                                <ComingSoonButton
                                    label="Mietkautionskonto eröffnen"
                                    variant="primary"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => data.goTo(data.backHref)}
                onPrimary={data.isArchived ? () => setReactivateModalOpen(true) : () => void data.handleSave()}
                primaryLabel={data.isArchived ? 'Mieter reaktivieren' : 'Mieterdaten speichern'}
                primaryIcon={data.isArchived ? <RotateCcw className="w-4 h-4" /> : <BUTTON_DETAILS.Save.icon />}
                primaryDisabled={data.isArchived ? isReactivating : (!data.isEditing || data.isSaving)}
            />

            <Modal
                open={reactivateModalOpen}
                onClose={() => setReactivateModalOpen(false)}
                title="Mietverhältnis reaktivieren?"
                icon={<RotateCcw />}
                footer={
                    <>
                        <Button
                            label={BUTTON_DETAILS.Cancel.label}
                            variant="outline"
                            disabled={isReactivating}
                            onClick={() => setReactivateModalOpen(false)}
                        />
                        <Button
                            label="Reaktivieren"
                            variant="primary"
                            disabled={isReactivating}
                            onClick={() => void handleConfirmReactivate()}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    {archivedTenantName} wird wieder als aktueller Mieter dieser Wohneinheit geführt (Auszug wird entfernt).
                    {' '}Ein derzeit aktives Mietverhältnis auf dieser Einheit wird dabei mit dem heutigen Datum als beendet markiert.
                </p>
            </Modal>

            <ConfirmDeleteModal
                open={data.personIndexPendingDelete !== null}
                onCancel={() => data.setPersonIndexPendingDelete(null)}
                onConfirm={data.confirmDeletePerson}
                title="Person löschen?"
            >
                <p className="text-sm text-muted-foreground">
                    {data.personIndexPendingDelete !== null
                        ? `Möchtest du ${personDisplayName(data.persons[data.personIndexPendingDelete], data.personIndexPendingDelete)} wirklich löschen?`
                        : ''}
                </p>
            </ConfirmDeleteModal>

            <ConfirmDeleteModal
                open={data.docPendingDelete !== null}
                onCancel={() => data.setDocPendingDelete(null)}
                onConfirm={() => void data.confirmDeleteDocument()}
                title="Dokument löschen?"
                confirmDisabled={data.pendingDocKey !== null}
            >
                <p className="text-sm text-muted-foreground">
                    {data.docPendingDelete
                        ? `Möchtest du ${data.docPendingDelete.label} wirklich löschen?`
                        : ''}
                </p>
            </ConfirmDeleteModal>

            <Modal
                open={data.docPendingRename !== null}
                onClose={data.closeRenameModal}
                title="Dokument umbenennen"
                icon={<Icons.Rename className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={data.closeRenameModal} />
                        <Button
                            label="Speichern"
                            icon={<Icons.Check className="w-4 h-4" />}
                            variant="primary"
                            disabled={data.renameValue.trim() === '' || data.isRenaming}
                            onClick={() => void data.confirmRenameDocument()}
                        />
                    </>
                }
            >
                <TextField
                    label="Dateiname"
                    value={data.renameValue}
                    onChange={(e) => data.setRenameValue(e.target.value)}
                />
            </Modal>

            <Modal
                open={data.showDocUploadModal}
                onClose={data.closeDocUploadModal}
                title="Dokument hochladen"
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} icon={<Icons.X className="w-4 h-4" />} variant="outline" onClick={data.closeDocUploadModal} />
                        <Button
                            label="Hochladen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            disabled={!data.uploadDocFile || data.pendingDocKey !== null}
                            onClick={() => void data.handleDocUploadSubmit()}
                        />
                    </>
                }
            >
                <FilePickerButton
                    file={data.uploadDocFile}
                    onSelect={data.selectUploadDocFile}
                    accept=".pdf,.jpg,.jpeg,.png"
                    id="tenant-document-upload-file"
                />
                <Dropdown
                    label="Dokumenttyp"
                    options={data.documentFilterOptions}
                    value={data.uploadDocType}
                    onChange={(e) => data.setUploadDocType(e.target.value as typeof data.uploadDocType)}
                />
                <Dropdown
                    label="Mieter"
                    options={data.uploadablePersonOptions}
                    value={String(data.uploadPersonIndex)}
                    onChange={(e) => data.setUploadPersonIndex(Number(e.target.value))}
                />
                <TextField
                    label="Dateiname"
                    placeholder={data.uploadDocFile?.name ?? 'Wird sonst nach der Datei benannt'}
                    value={data.uploadDocFileName}
                    onChange={(e) => data.setUploadDocFileName(e.target.value)}
                />
            </Modal>

            <UnsavedChangesModal
                open={data.pendingHref !== null}
                onCancel={() => data.setPendingHref(null)}
                onDiscard={data.confirmDiscard}
                context="an den Mieterdaten"
            />

            <Modal
                open={data.tenantChangeModalOpen}
                onClose={() => data.setTenantChangeModalOpen(false)}
                title="Mieterwechsel starten?"
                subtitle="Der aktuelle Mieter wird entfernt und die Einheit als unvermietet markiert."
                footer={
                    <>
                        <Button
                            label={BUTTON_DETAILS.Cancel.label}
                            variant="outline"
                            disabled={data.isStartingTenantChange}
                            onClick={() => data.setTenantChangeModalOpen(false)}
                        />
                        <Button
                            label="Ohne Mieterauszug fortfahren"
                            variant="outline"
                            disabled={data.isStartingTenantChange}
                            onClick={() => void data.confirmTenantChange(false)}
                        />
                        <Button
                            label="Mit Mieterauszug fortfahren"
                            icon={<Icons.DoorOpen className="w-4 h-4" />}
                            variant="primary"
                            disabled={data.isStartingTenantChange}
                            onClick={() => void data.confirmTenantChange(true)}
                        />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Du kannst direkt einen neuen Mieter erfassen, oder zuerst den Mieterauszug für den bisherigen Mieter durchführen.
                </p>
            </Modal>

            <Modal
                open={certGen.ownerModalOpen}
                onClose={certGen.closeOwnerModal}
                title="Eigentümer der Wohnung"
                subtitle="Ist der Vermieter gleichzeitig Eigentümer der Wohnung?"
                icon={<Icons.Landmark className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Nein" variant="outline" onClick={() => certGen.handleConfirmOwner(false)} />
                        <Button label="Ja" variant="primary" onClick={() => certGen.handleConfirmOwner(true)} />
                    </>
                }
            />

            <Modal
                open={certGen.uploadPromptOpen}
                onClose={certGen.closeUploadPrompt}
                title="Zu den Mieterdokumenten hochladen?"
                subtitle={certGen.pendingGeneratedFileName ? `${certGen.pendingGeneratedFileName} wurde heruntergeladen.` : undefined}
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Nicht hochladen" variant="outline" onClick={certGen.closeUploadPrompt} />
                        <Button label="Hochladen" variant="primary" onClick={certGen.confirmUploadPrompt} />
                    </>
                }
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du das generierte Dokument auch zu den Mieterdokumenten hinzufügen, damit es hier und in der Dokumente-Übersicht auffindbar ist?
                </p>
            </Modal>

            <DocumentReplaceModal
                open={certGen.replaceFlow.pending != null}
                fileName={certGen.documents[0]?.fileName}
                isResolving={certGen.replaceFlow.isResolving}
                onReplace={() => void certGen.replaceFlow.confirmReplace()}
                onCancel={certGen.replaceFlow.cancel}
            />

            <ConfirmDeleteModal
                open={certGen.pendingDeleteDoc != null}
                onCancel={certGen.cancelDeleteDoc}
                onConfirm={() => void certGen.confirmDeleteDoc()}
                title="Dokument löschen?"
                confirmDisabled={certGen.deletingDocId != null}
            >
                <p className="text-sm text-muted-foreground">
                    Möchtest du <span className="font-medium text-foreground">{certGen.pendingDeleteDoc?.fileName}</span> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
            </ConfirmDeleteModal>
        </div>
    );
}
