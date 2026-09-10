"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { PropertyImageGallery } from '@/components/features/PropertyImageGallery';
import {
    Button,
    CalendarField,
    Checkbox,
    Dropdown,
    FilePickerButton,
    Header,
    Icons,
    Modal,
    NumberField,
    PAGE_CONTAINER_CLASS,
    PillOptions,
    SectionLabel,
    StickyActionBar,
    Table,
    TextArea,
    TextField,
    UnsavedChangesModal,
    type TableColumn,
} from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import type { PropertyDocument } from '@immoandthebrain/types';
import { EnergyEfficient } from '@immoandthebrain/types';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { useSaleListingData, type SaleListingForm } from './useSaleListingData';

const ENERGY_OPTIONS = [
    { value: '', label: 'Bitte wählen...' },
    ...Object.values(EnergyEfficient).map((v) => ({ value: v, label: v })),
];

const CONDITION_OPTIONS = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Standard', label: 'Standard' },
    { value: 'Luxus', label: 'Luxus' },
    { value: 'Renovierungsbedürftig', label: 'Renovierungsbedürftig' },
];

const RENTED_OPTIONS = [
    { value: 'true', label: 'Vermietet' },
    { value: 'false', label: 'Unvermietet' },
];

const PARKING_TYPE_OPTIONS = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Garage', label: 'Garage' },
    { value: 'Duplex-Stellplatz', label: 'Duplex-Stellplatz' },
    { value: 'Außen überdacht', label: 'Außen überdacht' },
    { value: 'Außen unüberdacht', label: 'Außen unüberdacht' },
];

// A plain <select> has no <optgroup> support in the shared Dropdown
// component — grouping is simulated with non-selectable header rows using
// the option list's existing `disabled` flag instead of touching Dropdown.
const HEATING_OPTIONS = [
    { value: '', label: 'Bitte wählen...' },
    { value: '__konventionell', label: '— Konventionelle Heizsysteme —', disabled: true },
    { value: 'Gasheizung', label: 'Gasheizung' },
    { value: 'Ölheizung', label: 'Ölheizung' },
    { value: 'Fernwärme / Nahwärme', label: 'Fernwärme / Nahwärme' },
    { value: 'Kohleheizung', label: 'Kohleheizung' },
    { value: '__erneuerbar', label: '— Erneuerbare / Moderne Heizsysteme —', disabled: true },
    { value: 'Wärmepumpe (Luft-Wasser)', label: 'Wärmepumpe (Luft-Wasser)' },
    { value: 'Wärmepumpe (Sole-Wasser / Erdwärme)', label: 'Wärmepumpe (Sole-Wasser / Erdwärme)' },
    { value: 'Wärmepumpe (Wasser-Wasser / Grundwasser)', label: 'Wärmepumpe (Wasser-Wasser / Grundwasser)' },
    { value: 'Pelletheizung', label: 'Pelletheizung' },
    { value: 'Hackschnitzelheizung', label: 'Hackschnitzelheizung' },
    { value: 'Scheitholzheizung / Holzvergaserkessel', label: 'Scheitholzheizung / Holzvergaserkessel' },
    { value: 'Solarthermie (Heizungsunterstützung)', label: 'Solarthermie (Heizungsunterstützung)' },
    { value: 'Hybridheizung (z. B. Gas + Wärmepumpe)', label: 'Hybridheizung (z. B. Gas + Wärmepumpe)' },
    { value: '__elektrisch', label: '— Elektrische Heizsysteme —', disabled: true },
    { value: 'Elektro-Direktheizung', label: 'Elektro-Direktheizung' },
    { value: 'Nachtspeicherheizung', label: 'Nachtspeicherheizung' },
    { value: 'Infrarotheizung', label: 'Infrarotheizung' },
];

const SALE_PORTALS = [
    { value: 'immobilienscout24', label: 'ImmobilienScout24' },
    { value: 'immowelt', label: 'Immowelt' },
    { value: 'ebay-kleinanzeigen', label: 'eBay Kleinanzeigen' },
    { value: 'immonet', label: 'Immonet' },
];

export default function Sale({ propertyId }: { propertyId: string }) {
    const data = useSaleListingData(propertyId);
    const [publishOpen, setPublishOpen] = useState(false);
    const [selectedPortals, setSelectedPortals] = useState<string[]>([]);
    const [addDocOpen, setAddDocOpen] = useState(false);
    const [addDocName, setAddDocName] = useState('');
    const [addDocFile, setAddDocFile] = useState<File | null>(null);
    const [isAddingDoc, setIsAddingDoc] = useState(false);

    if (data.isLoading) return <PropertyLoadingPage />;
    if (!data.property) return <PropertyNotFoundPage />;

    const { property, form, update } = data;

    const togglePortal = (value: string, checked: boolean) => {
        setSelectedPortals((prev) => checked ? [...prev, value] : prev.filter((p) => p !== value));
    };

    const openPublishModal = () => {
        setSelectedPortals(data.listing?.selectedPortals ?? []);
        setPublishOpen(true);
    };

    const confirmPublish = () => {
        setPublishOpen(false);
        void data.handlePublish(selectedPortals);
    };

    const resetAddDoc = () => {
        setAddDocName('');
        setAddDocFile(null);
    };

    const confirmAddDoc = async () => {
        if (!addDocFile || addDocName.trim() === '') return;
        setIsAddingDoc(true);
        try {
            await data.addDocument(addDocName.trim(), addDocFile);
            setAddDocOpen(false);
            resetAddDoc();
        } finally {
            setIsAddingDoc(false);
        }
    };

    const patch = (p: Partial<SaleListingForm>) => update(p);

    const documentColumns: TableColumn<Record<string, unknown>>[] = [
        {
            key: 'name',
            label: 'Name',
            renderCell: (v) => <span className="block truncate" title={String(v)}>{String(v)}</span>,
        },
        {
            key: 'date',
            label: 'Datum',
            width: '140px',
            renderCell: (v) => <span className="text-muted-foreground">{String(v)}</span>,
        },
        {
            key: 'action',
            label: 'Aktion',
            width: '120px',
            align: 'right',
            renderCell: (_v, row) => {
                const doc = row.doc as PropertyDocument;
                const isPending = data.busyDocId === doc.propertyDocumentId;
                return (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => void data.handleView(doc)}
                            aria-label={`${doc.fileName} ansehen`}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Icons.Eye className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void data.handleDownload(doc)}
                            aria-label={`${doc.fileName} herunterladen`}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            <Icons.Download className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void data.handleDelete(doc)}
                            disabled={isPending}
                            aria-label={`${doc.fileName} löschen`}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Icons.Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                );
            },
        },
    ];

    const documentTableData = data.documents.map((doc) => ({
        key: String(doc.propertyDocumentId),
        name: doc.fileName,
        date: format(new Date(doc.createdAt), 'dd.MM.yyyy'),
        doc,
    }));

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={[
                        {
                            label: 'Bestandsobjekte',
                            href: '/existing-properties',
                            onClick: (e) => { e.preventDefault(); data.goTo('/existing-properties'); },
                        },
                        {
                            label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
                            href: `/existing-properties/${propertyId}`,
                            onClick: (e) => { e.preventDefault(); data.goTo(`/existing-properties/${propertyId}`); },
                        },
                        { label: ExistingPropertiesUseCases.Sale },
                    ]}
                />

                <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <SectionLabel>Objektdaten</SectionLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-[repeat(20,minmax(0,1fr))] gap-3">
                            <div className="sm:col-span-9">
                                <TextField label="Straße & Hausnummer" value={form.streetHouseNumber} onChange={(e) => patch({ streetHouseNumber: e.target.value })} />
                            </div>
                            <div className="sm:col-span-4">
                                <TextField label="PLZ" value={form.postalCode} onChange={(e) => patch({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                            </div>
                            <div className="sm:col-span-7">
                                <TextField label="Ort" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
                            </div>

                            <div className="sm:col-span-5">
                                <NumberField label="Wohnfläche" unit="m²" value={form.squareMeters} onChange={(e) => patch({ squareMeters: e.target.value })} min={0} hideStepper />
                            </div>
                            <div className="sm:col-span-5">
                                <Dropdown label="Ausstattung" optional options={CONDITION_OPTIONS} value={form.condition} onChange={(e) => patch({ condition: e.target.value as SaleListingForm['condition'] })} />
                            </div>
                            <div className="sm:col-span-5">
                                <NumberField label="Baujahr" value={form.yearOfConstruction} onChange={(e) => patch({ yearOfConstruction: e.target.value })} hideStepper />
                            </div>
                            <div className="sm:col-span-5">
                                <Dropdown label="Energie-Effizienz" optional options={ENERGY_OPTIONS} value={form.energyEfficient} onChange={(e) => patch({ energyEfficient: e.target.value as SaleListingForm['energyEfficient'] })} />
                            </div>

                            <div className="sm:col-span-4">
                                <NumberField label="Etage" optional value={form.floor} onChange={(e) => patch({ floor: e.target.value })} />
                            </div>
                            <div className="sm:col-span-4">
                                <NumberField label="Anzahl Zimmer" optional value={form.numberOfRooms} onChange={(e) => patch({ numberOfRooms: e.target.value })} min={0} />
                            </div>
                            <div className="sm:col-span-4">
                                <Dropdown label="Heizungsart" optional options={HEATING_OPTIONS} value={form.heatingType} onChange={(e) => patch({ heatingType: e.target.value as SaleListingForm['heatingType'] })} />
                            </div>
                            <div className="sm:col-span-4">
                                <NumberField label="Anzahl Stellplätze" optional value={form.parkingSpaceCount} onChange={(e) => patch({ parkingSpaceCount: e.target.value })} min={0} />
                            </div>
                            <div className="sm:col-span-4">
                                <Dropdown label="Stellplatz-Typ" optional options={PARKING_TYPE_OPTIONS} value={form.parkingSpaceType} onChange={(e) => patch({ parkingSpaceType: e.target.value as SaleListingForm['parkingSpaceType'] })} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <SectionLabel>Vermietung</SectionLabel>
                        <PillOptions
                            options={RENTED_OPTIONS}
                            value={form.isRented ? 'true' : 'false'}
                            onChange={(v) => patch({ isRented: v === 'true' })}
                            size="md"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Mietpreis Kalt" optional unit="€" value={form.coldRent} onChange={(e) => patch({ coldRent: e.target.value })} min={0} hideStepper />
                            <NumberField label="Nebenkosten" optional unit="€" value={form.serviceCharges} onChange={(e) => patch({ serviceCharges: e.target.value })} min={0} hideStepper />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <SectionLabel>Preise & Verfügbarkeit</SectionLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <NumberField label="Kaufpreis Immobilie" unit="€" value={form.salePrice} onChange={(e) => patch({ salePrice: e.target.value })} min={0} hideStepper />
                            <NumberField label="Kaufpreis Stellplätze" optional unit="€" value={form.parkingSpaceSalePrice} onChange={(e) => patch({ parkingSpaceSalePrice: e.target.value })} min={0} hideStepper />
                            <NumberField label="Makler-Courtage" optional unit="%" step="0.01" value={form.brokerCommissionPercent} onChange={(e) => patch({ brokerCommissionPercent: e.target.value })} min={0} hideStepper />
                            <CalendarField
                                label="Verfügbar ab"
                                optional
                                value={form.availableFrom ? parseISO(form.availableFrom) : undefined}
                                onChange={(date) => patch({ availableFrom: date ? format(date, 'yyyy-MM-dd') : '' })}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <SectionLabel>Beschreibung</SectionLabel>
                        <TextArea
                            optional
                            placeholder="Tolle Mikrolage, super Mieter und Nachbarn ..."
                            value={form.description}
                            onChange={(e) => patch({ description: e.target.value })}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <SectionLabel>Bilder</SectionLabel>
                        <PropertyImageGallery propertyId={property.propertyId} />
                    </div>

                    <div>
                        <SectionLabel>Unterlagen</SectionLabel>
                        <div className="mt-3 flex justify-end">
                            <Button
                                label="Dokument hochladen"
                                icon={<Icons.Upload className="w-4 h-4" />}
                                variant="outline"
                                size="sm"
                                onClick={() => setAddDocOpen(true)}
                            />
                        </div>
                        <div className="mt-3">
                            <Table
                                columns={documentColumns}
                                data={documentTableData}
                                footerLeft={`${data.documents.length} Einträge`}
                            />
                        </div>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show={true}
                ghostLabel="Abbruch"
                ghostIcon={<BUTTON_DETAILS.Cancel.icon className="w-4 h-4" />}
                onGhost={data.handleCancel}
                secondaryLabel="Verkauf speichern"
                secondaryIcon={<BUTTON_DETAILS.Save.icon className="w-4 h-4" />}
                onSecondary={() => void data.handleSave()}
                secondaryDisabled={data.isSaving}
                primaryLabel="Veröffentlichen"
                primaryIcon={<BUTTON_DETAILS.Publish.icon className="w-4 h-4" />}
                onPrimary={openPublishModal}
                primaryDisabled={data.isSaving}
            />

            <UnsavedChangesModal
                open={data.pendingHref !== null}
                onCancel={data.cancelPendingNav}
                onDiscard={data.confirmDiscard}
                context="am Verkaufsangebot"
            />

            <Modal
                open={publishOpen}
                onClose={() => setPublishOpen(false)}
                title="Portal auswählen"
                subtitle="Auf welchen Portalen soll das Angebot veröffentlicht werden?"
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={() => setPublishOpen(false)} />
                        <Button
                            label="Veröffentlichen"
                            variant="primary"
                            disabled={selectedPortals.length === 0 || data.isSaving}
                            onClick={confirmPublish}
                        />
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    {SALE_PORTALS.map((portal) => (
                        <Checkbox
                            key={portal.value}
                            label={portal.label}
                            checked={selectedPortals.includes(portal.value)}
                            onChange={(e) => togglePortal(portal.value, e.target.checked)}
                        />
                    ))}
                </div>
            </Modal>

            <Modal
                open={addDocOpen}
                onClose={() => { setAddDocOpen(false); resetAddDoc(); }}
                title="Dokument hinzufügen"
                icon={<Icons.Upload className="w-5 h-5" />}
                footer={
                    <>
                        <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={() => { setAddDocOpen(false); resetAddDoc(); }} />
                        <Button
                            label="Hinzufügen"
                            icon={<Icons.Upload className="w-4 h-4" />}
                            variant="primary"
                            disabled={!addDocFile || addDocName.trim() === '' || isAddingDoc}
                            onClick={() => void confirmAddDoc()}
                        />
                    </>
                }
            >
                <FilePickerButton file={addDocFile} onSelect={setAddDocFile} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                <TextField
                    label="Name"
                    placeholder="z.B. Energieausweis"
                    value={addDocName}
                    onChange={(e) => setAddDocName(e.target.value)}
                />
            </Modal>
        </div>
    );
}
