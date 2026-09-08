"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { DataCard } from './DocumentGeneratorParts';
import { Button, CalendarField, ComingSoonButton, ConfirmDeleteModal, Dropdown, Header, Icons, Modal, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, Table, Tag, TextField, UnsavedChangesModal, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import type { Property, PropertyUnit } from '@immonext/types';
import { formatDeDate } from '@/lib/utils';
import { MIETERBESCHEINIGUNG, personDisplayName, useTenantUnitData } from './useTenantUnitData';

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

    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);
    const archivedTenantName = data.isArchived && data.persons[0] ? personDisplayName(data.persons[0], 0) : 'Archiviert';

    const breadcrumbItems: BreadcrumbItem[] = data.isArchived
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties' },
            { label: address, href: `/existing-properties/${propertyId}` },
            ...(hasMultipleUnits ? [{ label: 'Wohneinheiten', href: `/existing-properties/${propertyId}/tenant-history` }] : []),
            { label: unitLabel, href: `/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}` },
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
                    items={breadcrumbItems}                    actions={
                        <Button
                            label={BUTTON_DETAILS.UseCases.label}
                            icon={<BUTTON_DETAILS.UseCases.icon />}
                            variant="outline"
                            hideLabelOnMobile
                            menuItems={data.useCaseMenuItems}
                        />
                    }
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
                                        label={person.isPrimary ? 'Nachname *' : 'Nachname'}
                                        value={person.lastName}
                                        onChange={(e) => data.updatePerson(index, { lastName: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <TextField
                                        label={person.isPrimary ? 'Vorname *' : 'Vorname'}
                                        value={person.firstName}
                                        onChange={(e) => data.updatePerson(index, { firstName: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <TextField
                                        label={person.isPrimary ? 'Steuer-ID *' : 'Steuer-ID'}
                                        placeholder="00 000 000 000"
                                        value={person.taxId}
                                        onChange={(e) => data.updatePerson(index, { taxId: e.target.value })}
                                        disabled={data.isArchived}
                                    />
                                    <CalendarField
                                        label={person.isPrimary ? 'Einzugsdatum *' : 'Einzugsdatum'}
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
                                    <>
                                        {data.renderFooterUpload(data.mieterbescheinigungRow, MIETERBESCHEINIGUNG, false)}
                                        <Button
                                            label="Daten prüfen & Vorschau"
                                            icon={<Icons.Eye className="w-4 h-4" />}
                                            variant="outline"
                                            disabled={data.tenancy == null}
                                            onClick={() => data.goTo(`${data.generatorBase}/certificate`)}
                                        />
                                        {!data.isArchived && (
                                            <Button
                                                label="PDF generieren"
                                                icon={<Icons.FileText className="w-4 h-4" />}
                                                variant="primary"
                                                disabled={data.tenancy == null}
                                                onClick={() => data.goTo(`${data.generatorBase}/certificate?autoGenerate=1`)}
                                            />
                                        )}
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-2">
                                        {data.renderDocRow(data.mieterbescheinigungRow, MIETERBESCHEINIGUNG, false, false)}
                                    </div>
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
                onPrimary={() => void data.handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel="Mieterdaten speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={data.isArchived || !data.isEditing || data.isSaving}
            />

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
                <div>
                    <label className="block mb-2 text-sm text-foreground">Datei</label>
                    <input
                        id="tenant-document-upload-file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="sr-only"
                        onChange={(e) => data.selectUploadDocFile(e.target.files?.[0] ?? null)}
                    />
                    <label
                        htmlFor="tenant-document-upload-file"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-primary text-primary text-sm font-medium cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                        <Icons.Upload className="w-4 h-4" />
                        {data.uploadDocFile ? data.uploadDocFile.name : 'Datei auswählen'}
                    </label>
                </div>
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
        </div>
    );
}
