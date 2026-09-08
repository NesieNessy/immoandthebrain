"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import { AdjustmentStatusBox } from '../tenant-data/AdjustmentStatusBox';
import { DataCard } from '../tenant-data/DocumentGeneratorParts';
import { Button, CalendarField, ConfirmDeleteModal, Header, Icons, Modal, NumberField, PAGE_CONTAINER_CLASS, SectionLabel, StickyActionBar, Switch, Tag, UnsavedChangesModal, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { formatDeDate } from '@/lib/utils';
import type { Property, PropertyUnit } from '@immonext/types';
import { euro, useTenantUnitData } from '../tenant-data/useTenantUnitData';

interface TenantAgreementPageProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
}

/** The rental-agreement page: lease term, rent & service charges,
 *  adjustments and generated documents. An independent page/route — not
 *  nested under tenant-data either in the URL or in the breadcrumb, and
 *  not a tab of the current-tenant page — see ../tenant-data/CurrentTenantPage
 *  for that side. Only the data layer (useTenantUnitData) is shared. */
export function TenantAgreementPage({ propertyId, property, unit, hasMultipleUnits }: TenantAgreementPageProps) {
    const data = useTenantUnitData(propertyId, property, unit, hasMultipleUnits);

    const currentTenantHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;

    // No "Mieterdaten" crumb — the rental agreement is a sibling page, not
    // nested under it. With several units the unit label still needs to
    // show which unit this is, linking back to that unit's current-tenant page.
    const breadcrumbItems: BreadcrumbItem[] = hasMultipleUnits
        ? [
            {
                label: 'Bestandsobjekte',
                href: '/existing-properties',
                onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } },
            },
            {
                label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
                href: `/existing-properties/${propertyId}`,
                onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } },
            },
            {
                label: formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote),
                href: currentTenantHref,
                onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(currentTenantHref); } },
            },
            { label: 'Mietvertrag' },
        ]
        : [
            {
                label: 'Bestandsobjekte',
                href: '/existing-properties',
                onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } },
            },
            {
                label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
                href: `/existing-properties/${propertyId}`,
                onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } },
            },
            { label: 'Mietvertrag' },
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

                    <div className="flex items-center gap-2">
                        <Tag label={data.status} variant={data.status === 'Vermietet' ? 'success' : 'muted'} size="md" />
                    </div>

                    <div>
                        <SectionLabel>Mietzeiten</SectionLabel>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <CalendarField
                                label="Einzugsdatum"
                                value={data.persons[0]?.moveInDate}
                                onChange={(date) => data.updatePerson(0, { moveInDate: date })}
                            />
                            <div>
                                <CalendarField
                                    label="Auszugsdatum"
                                    optional
                                    value={data.rentalForm.tenancyEndDate}
                                    onChange={(date) => data.setRentalForm((prev) => ({ ...prev, tenancyEndDate: date }))}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">Synchronisiert mit Mieterauszug</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Miete & Nebenkosten</SectionLabel>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <NumberField
                                label="Netto-Mieteinnahmen"
                                unit="€"
                                value={data.rentalForm.coldRent}
                                onChange={(e) => data.setRentalForm((prev) => ({ ...prev, coldRent: e.target.value }))}
                                min={0}
                            />
                            <NumberField
                                label="Stellplatz"
                                optional
                                unit="€"
                                value={data.rentalForm.parkingSpaceRent}
                                onChange={(e) => data.setRentalForm((prev) => ({ ...prev, parkingSpaceRent: e.target.value }))}
                                min={0}
                            />
                            <NumberField
                                label="WEG"
                                optional
                                unit="€"
                                value={data.rentalForm.houseMoney}
                                onChange={(e) => data.setRentalForm((prev) => ({ ...prev, houseMoney: e.target.value }))}
                                min={0}
                            />
                        </div>

                        <div className="mt-3">
                            <DataCard
                                icon={Icons.Receipt}
                                title="Nebenkosten"
                                actions={
                                    <Button
                                        label="Detailerfassung Nebenkosten"
                                        icon={<Icons.ListChecks className="w-4 h-4" />}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => data.goTo(hasMultipleUnits
                                            ? `/existing-properties/${propertyId}/service-charge-settlement/${unit.propertyUnitId}`
                                            : `/existing-properties/${propertyId}/service-charge-settlement`)}
                                    />
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    {data.costItems.length === 0 && (
                                        <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
                                            Noch keine Nebenkosten erfasst.
                                        </p>
                                    )}
                                    {data.costItems.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Nebenkosten aus Detailerfassung berechnet.
                                        </p>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <NumberField
                                            label="NK gesamt"
                                            unit="€"
                                            value={data.costItems.length > 0 ? String(data.computedTotalCosts ?? 0) : ''}
                                            placeholder="–"
                                            disabled
                                        />
                                        <NumberField
                                            label="NK umlagefähig"
                                            unit="€"
                                            value={data.costItems.length > 0 ? data.rentalForm.allocableCosts : ''}
                                            placeholder="–"
                                            disabled
                                        />
                                        <NumberField
                                            label="NK nicht umlagefähig"
                                            unit="€"
                                            value={data.costItems.length > 0 ? data.rentalForm.nonAllocableCosts : ''}
                                            placeholder="–"
                                            disabled
                                        />
                                    </div>
                                </div>
                            </DataCard>
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Anpassungen</SectionLabel>
                        <div className="mt-3 flex flex-col gap-4">
                            <DataCard
                                icon={Icons.TrendingUp}
                                title="Nächste Mietanpassung"
                                actions={
                                    <div className="flex items-center gap-2">
                                        <span title="Es besteht keine Verknüpfung zwischen diesem Objekt und einem Kalkulator-Ergebnis.">
                                            <Button label="Vorschlag aus Kalkulator übernehmen" icon={<Icons.Calculator className="w-4 h-4" />} variant="outline" size="sm" disabled />
                                        </span>
                                        <Button label="Historie" icon={<Icons.History className="w-4 h-4" />} variant="outline" size="sm" onClick={() => data.setHistoryModalType('rent')} />
                                    </div>
                                }
                                footer={
                                    <>
                                        <span className="mr-auto text-xs font-medium text-muted-foreground">Mieterhöhungsschreiben</span>
                                        <span title={!data.canGenerateRentIncreaseLetter ? 'Bitte zuerst Datum, Höhe und Vermieterdaten hinterlegen' : undefined}>
                                            <Button
                                                label="Schreiben erstellen"
                                                icon={<Icons.FileText className="w-4 h-4" />}
                                                variant="outline"
                                                size="sm"
                                                disabled={!data.canGenerateRentIncreaseLetter || data.isGeneratingLetter === 'rent'}
                                                onClick={() => void data.handleGenerateRentIncreaseLetter()}
                                            />
                                        </span>
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <CalendarField
                                            label="Datum"
                                            optional
                                            value={data.rentalForm.nextRentAdjustmentDate}
                                            onChange={(date) => data.setRentalForm((prev) => ({ ...prev, nextRentAdjustmentDate: date }))}
                                        />
                                        <NumberField
                                            label="Höhe"
                                            optional
                                            unit="€"
                                            value={data.rentalForm.nextRentAdjustmentAmount}
                                            onChange={(e) => data.setRentalForm((prev) => ({ ...prev, nextRentAdjustmentAmount: e.target.value }))}
                                        />
                                    </div>
                                    <AdjustmentStatusBox
                                        adjustmentType="rent"
                                        label="Mietanpassung"
                                        targetDate={data.rentalForm.nextRentAdjustmentDate}
                                        reminderDate={data.effectiveRentReminderDate}
                                        amount={data.rentalForm.nextRentAdjustmentAmount}
                                        currentValue={data.tenancy?.coldRent ?? null}
                                        historyEntries={data.historyEntries}
                                        isResolving={data.isResolvingAdjustment === 'rent'}
                                        onAccept={() => void data.handleAcceptRentAdjustment()}
                                        onDecline={() => void data.handleDeclineRentAdjustment()}
                                    />
                                    {data.rentIncreaseLetterRow.doc && data.renderDocRow(data.rentIncreaseLetterRow, 'Mieterhöhungsschreiben', false, false)}
                                </div>
                            </DataCard>

                            <DataCard
                                icon={Icons.Wrench}
                                title="Sanierungsanpassung"
                                actions={
                                    <div className="flex items-center gap-2">
                                        <span title="Es besteht keine Verknüpfung zwischen diesem Objekt und einem Kalkulator-Ergebnis.">
                                            <Button label="Vorschlag aus Kalkulator übernehmen" icon={<Icons.Calculator className="w-4 h-4" />} variant="outline" size="sm" disabled />
                                        </span>
                                        <Button label="Historie" icon={<Icons.History className="w-4 h-4" />} variant="outline" size="sm" onClick={() => data.setHistoryModalType('renovation')} />
                                    </div>
                                }
                                footer={
                                    <>
                                        <span className="mr-auto text-xs font-medium text-muted-foreground">Sanierungsanpassungsschreiben</span>
                                        <span title={!data.canGenerateRenovationLetter ? 'Bitte zuerst Start/Abschluss, Höhe und Vermieterdaten hinterlegen' : undefined}>
                                            <Button
                                                label="Schreiben erstellen"
                                                icon={<Icons.FileText className="w-4 h-4" />}
                                                variant="outline"
                                                size="sm"
                                                disabled={!data.canGenerateRenovationLetter || data.isGeneratingLetter === 'renovation'}
                                                onClick={() => void data.handleGenerateRenovationLetter()}
                                            />
                                        </span>
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <CalendarField
                                            label="Start"
                                            optional
                                            value={data.rentalForm.renovationAdjustmentStartDate}
                                            onChange={(date) => data.setRentalForm((prev) => ({ ...prev, renovationAdjustmentStartDate: date }))}
                                        />
                                        <CalendarField
                                            label="Abschluss"
                                            optional
                                            value={data.rentalForm.renovationAdjustmentEndDate}
                                            onChange={(date) => data.setRentalForm((prev) => ({ ...prev, renovationAdjustmentEndDate: date }))}
                                        />
                                        <NumberField
                                            label="Höhe"
                                            optional
                                            unit="€"
                                            value={data.rentalForm.renovationAdjustmentAmount}
                                            onChange={(e) => data.setRentalForm((prev) => ({ ...prev, renovationAdjustmentAmount: e.target.value }))}
                                        />
                                    </div>
                                    <AdjustmentStatusBox
                                        adjustmentType="renovation"
                                        label="Sanierungsanpassung"
                                        targetDate={data.rentalForm.renovationAdjustmentStartDate}
                                        reminderDate={data.effectiveRenovationReminderDate}
                                        amount={data.rentalForm.renovationAdjustmentAmount}
                                        currentValue={data.tenancy?.coldRent ?? null}
                                        historyEntries={data.historyEntries}
                                        isResolving={data.isResolvingAdjustment === 'renovation'}
                                        onAccept={() => void data.handleAcceptRenovationAdjustment()}
                                        onDecline={() => void data.handleDeclineRenovationAdjustment()}
                                    />
                                    {data.renovationLetterRow.doc && data.renderDocRow(data.renovationLetterRow, 'Sanierungsanpassungsschreiben', false, false)}
                                </div>
                            </DataCard>
                        </div>
                    </div>

                    <div>
                        <SectionLabel>Generierbare Dokumente</SectionLabel>
                        <div className="mt-3 flex flex-col gap-4">
                            <div className="flex items-center justify-end">
                                <span title={data.landlordMissing ? 'Bitte zuerst Vermieterdaten in den Einstellungen hinterlegen' : undefined}>
                                    <Switch
                                        label="Mehrere Mietverträge"
                                        checked={data.mietvertragIndividual}
                                        disabled={data.landlordMissing}
                                        onCheckedChange={(checked) => data.setMietvertragIndividual(checked)}
                                    />
                                </span>
                            </div>

                            {data.mietvertragIndividual ? (
                                data.mietvertragRows.map((row) => (
                                    <DataCard
                                        key={row.key}
                                        icon={Icons.FileSignature}
                                        title={`Mietvertrag – ${row.tenant}`}
                                        footer={
                                            <>
                                                {data.renderFooterUpload(row, data.mietvertrag, data.landlordMissing)}
                                                <Button
                                                    label="Daten prüfen & Vorschau"
                                                    icon={<Icons.Eye className="w-4 h-4" />}
                                                    variant="outline"
                                                    disabled={data.landlordMissing || data.tenancy == null || row.tenancyPersonId == null}
                                                    title={row.tenancyPersonId == null ? 'Bitte zuerst speichern' : undefined}
                                                    onClick={() => data.goTo(`${data.generatorBase}/rental-agreement?personId=${row.tenancyPersonId}`)}
                                                />
                                                <Button
                                                    label="PDF generieren"
                                                    icon={<Icons.FileText className="w-4 h-4" />}
                                                    variant="primary"
                                                    disabled={data.landlordMissing || data.tenancy == null || row.tenancyPersonId == null}
                                                    title={row.tenancyPersonId == null ? 'Bitte zuerst speichern' : undefined}
                                                    onClick={() => data.goTo(`${data.generatorBase}/rental-agreement?personId=${row.tenancyPersonId}&autoGenerate=1`)}
                                                />
                                            </>
                                        }
                                    >
                                        <div className="flex flex-col gap-3">
                                            {data.renderDocRow(row, data.mietvertrag, data.landlordMissing, false)}
                                            <p className="text-xs text-muted-foreground">
                                                Wohnraummietvertrag für {row.tenant}, inklusive Mietkonditionen, Kaution und Sonderregelungen.
                                            </p>
                                        </div>
                                    </DataCard>
                                ))
                            ) : (
                                <DataCard
                                    icon={Icons.FileSignature}
                                    title="Mietvertrag"
                                    footer={
                                        <>
                                            {data.renderFooterUpload(data.mietvertragRows[0], data.mietvertrag, data.landlordMissing)}
                                            <Button
                                                label="Daten prüfen & Vorschau"
                                                icon={<Icons.Eye className="w-4 h-4" />}
                                                variant="outline"
                                                disabled={data.landlordMissing || data.tenancy == null}
                                                onClick={() => data.goTo(`${data.generatorBase}/rental-agreement`)}
                                            />
                                            <Button
                                                label="PDF generieren"
                                                icon={<Icons.FileText className="w-4 h-4" />}
                                                variant="primary"
                                                disabled={data.landlordMissing || data.tenancy == null}
                                                onClick={() => data.goTo(`${data.generatorBase}/rental-agreement?autoGenerate=1`)}
                                            />
                                        </>
                                    }
                                >
                                    <div className="flex flex-col gap-3">
                                        {data.renderDocRow(data.mietvertragRows[0], data.mietvertrag, data.landlordMissing, false)}
                                        <p className="text-xs text-muted-foreground">
                                            Wohnraummietvertrag für die Mietpartei(en) dieser Einheit, inklusive Mietkonditionen, Kaution und Sonderregelungen.
                                        </p>
                                    </div>
                                </DataCard>
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
                primaryLabel="Mietvertrag speichern"
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={!data.isEditing || data.isSaving}
            />

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

            <UnsavedChangesModal
                open={data.pendingHref !== null}
                onCancel={() => data.setPendingHref(null)}
                onDiscard={data.confirmDiscard}
                context="am Mietvertrag"
            />

            <Modal
                open={data.historyModalType !== null}
                onClose={() => data.setHistoryModalType(null)}
                title={data.historyModalType === 'rent' ? 'Historie – Mietanpassung' : 'Historie – Sanierungsanpassung'}
            >
                {data.historyEntries.filter((h) => h.adjustmentType === data.historyModalType).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {data.historyEntries.filter((h) => h.adjustmentType === data.historyModalType).map((h) => (
                            <div key={h.historyId} className="p-2.5 rounded-lg bg-muted/30 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span>{h.effectiveDate ? formatDeDate(h.effectiveDate) : '–'}</span>
                                    <span className="font-medium">{h.amount != null ? euro(h.amount) : '–'}</span>
                                </div>
                                {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                                <p className="text-[11px] text-muted-foreground mt-0.5">erstellt am {formatDeDate(h.createdAt)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
}
