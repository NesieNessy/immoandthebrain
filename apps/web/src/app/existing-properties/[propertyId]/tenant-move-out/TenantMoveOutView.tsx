"use client";

import { formatUnitLabel } from '@/components/features/PropertyDisplay';
import {
    Button,
    CalendarField,
    ComingSoonButton,
    Dropdown,
    Header,
    Icons,
    LoadingScreen,
    NumberField,
    PAGE_CONTAINER_CLASS,
    SectionLabel,
    StickyActionBar,
    TextArea,
    TextField,
    UnsavedChangesModal,
    type BreadcrumbItem,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { DataCard } from '../tenant-data/DocumentGeneratorParts';
import { MOVE_OUT_ROOM_OPTIONS } from '@/lib/tenantMoveOut/rooms';
import { deCurrencyFormatter } from '@/lib/utils';
import type { Property, PropertyUnit } from '@immonext/types';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

import { useTenantMoveOutData, type DamageForm } from './useTenantMoveOutData';

interface TenantMoveOutViewProps {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
}

const ROOM_OPTIONS = [
    { value: '', label: 'Bitte wählen...' },
    ...MOVE_OUT_ROOM_OPTIONS.map((room) => ({ value: room, label: room })),
];

function DamagePhotoTile({ damage, onUpload, onRemove, isUploading }: {
    damage: DamageForm;
    onUpload: (file: File) => void;
    onRemove: (photoId: string) => void;
    isUploading: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="flex flex-wrap gap-3">
            {damage.photos.map((photo) => (
                <div key={photo.id} className="relative w-20">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
                        {photo.previewUrl && <img src={photo.previewUrl} alt={photo.fileName} className="w-full h-full object-cover" />}
                    </div>
                    <button
                        type="button"
                        onClick={() => onRemove(photo.id)}
                        aria-label="Foto entfernen"
                        className="absolute top-1 right-1 p-1 rounded-md bg-card/90 text-muted-foreground hover:text-destructive shadow-sm cursor-pointer"
                    >
                        <Icons.Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{photo.fileName}</p>
                </div>
            ))}
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                aria-label="Foto hinzufügen"
                className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
            >
                <Icons.Plus className="w-5 h-5" />
            </button>
            <input
                ref={inputRef}
                type="file"
                accept=".jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onUpload(file);
                }}
            />
        </div>
    );
}

export function TenantMoveOutView({ propertyId, property, unit, hasMultipleUnits }: TenantMoveOutViewProps) {
    const data = useTenantMoveOutData(propertyId, property, unit, hasMultipleUnits);
    const router = useRouter();
    const protocolUploadRef = useRef<HTMLInputElement>(null);

    const address = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;
    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);

    const breadcrumbItems: BreadcrumbItem[] = hasMultipleUnits
        ? [
            { label: 'Bestandsobjekte', href: '/existing-properties', onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } } },
            { label: address, href: `/existing-properties/${propertyId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } } },
            { label: unitLabel, href: `/existing-properties/${propertyId}/${unit.propertyUnitId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}/${unit.propertyUnitId}`); } } },
            { label: 'Mieterauszug & Abnahmeprotokoll' },
        ]
        : [
            { label: 'Bestandsobjekte', href: '/existing-properties', onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo('/existing-properties'); } } },
            { label: address, href: `/existing-properties/${propertyId}`, onClick: (e) => { if (data.isEditing) { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); } } },
            { label: 'Mieterauszug & Abnahmeprotokoll' },
        ];

    if (data.isLoading) return <LoadingScreen />;

    if (!data.tenancy) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Für diese Einheit ist aktuell kein Mieter hinterlegt.</p>
            </div>
        );
    }

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

                    {/* Move-out data */}
                    <div>
                        <SectionLabel>Auszugsdaten</SectionLabel>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <TextField label="Mieter" value={data.tenantDisplayName} disabled />
                            <CalendarField
                                label="Auszugsdatum"
                                value={data.moveOutDate}
                                onChange={data.setMoveOutDate}
                            />
                        </div>
                        <div className="mt-3 px-4 py-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-foreground">
                            Sobald das Auszugsdatum erreicht ist, wird der Mieter-Datensatz automatisch in die{' '}
                            <a href={`/existing-properties/${propertyId}/tenant-history/${unit.propertyUnitId}`} className="font-medium text-primary hover:underline">
                                Mieter-Historie
                            </a>{' '}verschoben.
                        </div>
                    </div>

                    {/* Meter readings */}
                    <div>
                        <SectionLabel>Zählerstände bei Auszug</SectionLabel>
                        <div className="mt-3 flex flex-col gap-2">
                            {data.meterReadings.map((reading) => (
                                <div key={reading.id} className="flex items-start gap-2">
                                    <div className="flex-1">
                                        <Dropdown
                                            aria-label="Raum"
                                            options={ROOM_OPTIONS}
                                            value={reading.room}
                                            onChange={(e) => data.updateMeterReading(reading.id, { room: e.target.value })}
                                        />
                                    </div>
                                    <div className="w-40">
                                        <NumberField
                                            aria-label="Zählerstand"
                                            placeholder="Zählerstand"
                                            value={reading.value}
                                            onChange={(e) => data.updateMeterReading(reading.id, { value: e.target.value })}
                                            min={0}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => data.removeMeterReading(reading.id)}
                                        aria-label="Zähler entfernen"
                                        className="p-2.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                    >
                                        <Icons.Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <Button
                            label="Zähler hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={data.addMeterReading}
                        />
                    </div>

                    {/* Damages */}
                    <div>
                        <SectionLabel>Beschreibung der Schäden</SectionLabel>
                        <div className="mt-3 flex flex-col gap-3">
                            {data.damages.map((damage, index) => (
                                <div key={damage.id} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-foreground">Schaden {index + 1}</p>
                                        <button
                                            type="button"
                                            onClick={() => data.removeDamage(damage.id)}
                                            aria-label="Schaden entfernen"
                                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                        >
                                            <Icons.Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <TextArea
                                        aria-label="Beschreibung des Schadens"
                                        placeholder="Beschreibung des Schadens"
                                        value={damage.description}
                                        onChange={(e) => data.updateDamageDescription(damage.id, e.target.value)}
                                        maxLength={1000}
                                    />
                                    <div>
                                        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Fotos</p>
                                        <DamagePhotoTile
                                            damage={damage}
                                            isUploading={data.uploadingDamageId === damage.id}
                                            onUpload={(file) => void data.addDamagePhoto(damage.id, file)}
                                            onRemove={(photoId) => void data.removeDamagePhoto(damage.id, photoId)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button
                            label="Schaden hinzufügen"
                            icon={<Icons.Plus className="w-4 h-4" />}
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={data.addDamage}
                        />
                    </div>

                    {/* Generatable documents */}
                    <div>
                        <SectionLabel>Generierbare Dokumente</SectionLabel>
                        <div className="mt-3">
                            <DataCard
                                icon={Icons.FileText}
                                title="Abnahmeprotokoll"
                                footer={
                                    <>
                                        <input
                                            ref={protocolUploadRef}
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                e.target.value = '';
                                                if (file) void data.handleUploadProtocol(file);
                                            }}
                                        />
                                        <Button
                                            label="Datei hochladen"
                                            icon={<Icons.Upload className="w-4 h-4" />}
                                            variant="ghost"
                                            disabled={!data.canGenerateProtocol || data.isUploadingProtocol}
                                            onClick={() => protocolUploadRef.current?.click()}
                                        />
                                        <Button
                                            label="Daten prüfen & Vorschau"
                                            icon={<Icons.Eye className="w-4 h-4" />}
                                            variant="outline"
                                            disabled={!data.canGenerateProtocol}
                                            onClick={() => data.goTo(`/existing-properties/${propertyId}/tenant-move-out/${unit.propertyUnitId}/protocol`)}
                                        />
                                        <Button
                                            label="Abnahmeprotokoll erstellen"
                                            icon={<Icons.FileText className="w-4 h-4" />}
                                            variant="primary"
                                            disabled={!data.canGenerateProtocol || data.isGeneratingProtocol}
                                            onClick={() => void data.handleGenerateProtocol()}
                                        />
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-3">
                                    {data.protocolDocument && (
                                        <button
                                            type="button"
                                            onClick={() => void data.handleViewProtocolDocument()}
                                            title={data.protocolDocument.fileName}
                                            className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium max-w-full hover:bg-primary/20 transition-colors cursor-pointer"
                                        >
                                            <Icons.FileText className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{data.protocolDocument.fileName}</span>
                                        </button>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Protokolliert Zählerstände und Schäden bei Auszug. Wird als PDF erzeugt und auch unter Dokumente abgelegt.
                                    </p>
                                </div>
                            </DataCard>
                        </div>
                    </div>

                    {/* Closing */}
                    <div>
                        <SectionLabel>Abschluss</SectionLabel>
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                            <ComingSoonButton
                                label="Mietkaution auflösen"
                                icon={<Icons.ExternalLink className="w-4 h-4" />}
                                variant="outline"
                            />
                            <p className="text-xs text-muted-foreground">
                                Hinterlegte Kaution: {data.tenancy.deposit != null ? `${deCurrencyFormatter.format(data.tenancy.deposit)} €` : '–'} · Weiterleitung zum Partner
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show
                ghostLabel={BUTTON_DETAILS.Cancel.label}
                ghostIcon={<BUTTON_DETAILS.Cancel.icon />}
                onGhost={() => router.push(data.backHref)}
                primaryLabel={BUTTON_DETAILS.Save.label}
                primaryIcon={<BUTTON_DETAILS.Save.icon />}
                primaryDisabled={data.isSaving}
                onPrimary={() => void data.handleSave()}
            />

            <UnsavedChangesModal
                open={data.pendingHref !== null}
                onCancel={() => data.setPendingHref(null)}
                onDiscard={data.confirmDiscard}
                context="am Mieterauszug"
            />
        </div>
    );
}
