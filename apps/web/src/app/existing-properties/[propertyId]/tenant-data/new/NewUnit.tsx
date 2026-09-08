"use client";

import { useEffect, useState } from 'react';

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { Header, Icons, NumberField, PAGE_CONTAINER_CLASS, PillOptions, SectionLabel, StickyActionBar, TextField, UnsavedChangesModal, useToast, type BreadcrumbItem } from '@/components/ui';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { createPropertyUnit, getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { deNumberFormatter } from '@/lib/utils';
import { type Property, UnitUsageType } from '@immonext/types';
import { Car, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UsageTypeOption {
    value: UnitUsageType;
    label: string;
    description: string;
    icon: React.ElementType;
}

const WOHNEINHEITEN_OPTIONS: UsageTypeOption[] = [
    { value: UnitUsageType.Wohnung, label: 'Wohnung', description: 'Eigenständige Mietwohnung – z.B. in einem Mehrfamilienhaus oder Einfamilienhaus', icon: Icons.Home },
    { value: UnitUsageType.Einliegerwohnung, label: 'Einliegerwohnung', description: 'Untergeordnete Einheit im EFH oder ZFH, baulich an die Haupteinheit gebunden', icon: Icons.DoorOpen },
];

const SONSTIGE_EINHEITEN_OPTIONS: UsageTypeOption[] = [
    { value: UnitUsageType.Stellplatz, label: 'Stellplatz / Garage', description: 'Nur Parkfläche, kein Wohnraum', icon: Car },
    { value: UnitUsageType.Gewerbeflaeche, label: 'Gewerbefläche', description: 'Büro, Laden oder gewerbliche Nutzung', icon: Icons.Briefcase },
    { value: UnitUsageType.Lager, label: 'Lager / Keller', description: 'Nicht-Wohnfläche zur Lagerung', icon: Icons.Archive },
    { value: UnitUsageType.Sonstige, label: 'Sonstige', description: 'Andere Nutzungsart', icon: MoreHorizontal },
];

const USAGE_TYPE_LABEL: Record<UnitUsageType, string> = {
    [UnitUsageType.Wohnung]: 'Wohnung',
    [UnitUsageType.Einliegerwohnung]: 'Einliegerwohnung',
    [UnitUsageType.Stellplatz]: 'Stellplatz / Garage',
    [UnitUsageType.Gewerbeflaeche]: 'Gewerbefläche',
    [UnitUsageType.Lager]: 'Lager / Keller',
    [UnitUsageType.Sonstige]: 'Sonstige',
};

const PARKING_OPTIONS = [
    { value: '0', label: 'Kein' },
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4+' },
];

// Parking spaces only make sense for units people actually occupy or run a
// business out of — not for a Stellplatz/Lager unit itself.
const USAGE_TYPES_WITH_PARKING = new Set<UnitUsageType>([
    UnitUsageType.Wohnung,
    UnitUsageType.Einliegerwohnung,
    UnitUsageType.Gewerbeflaeche,
    UnitUsageType.Sonstige,
]);

function UsageTypeCard({ option, selected, onSelect }: { option: UsageTypeOption; selected: boolean; onSelect: () => void }) {
    const Icon = option.icon;
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
            }`}
        >
            <Icon className={`w-5 h-5 mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm font-semibold text-foreground">{option.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
        </button>
    );
}

export default function NewUnit({ propertyId }: { propertyId: string }) {
    const router = useRouter();
    const { showToast } = useToast();
    const [property, setProperty] = useState<Property | null | undefined>(undefined);
    const [unitCount, setUnitCount] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);

    const [usageType, setUsageType] = useState<UnitUsageType>(UnitUsageType.Wohnung);
    const [unitLabel, setUnitLabel] = useState('');
    const [floor, setFloor] = useState('');
    const [locationNote, setLocationNote] = useState('');
    const [livingAreaM2, setLivingAreaM2] = useState('');
    const [numberOfRooms, setNumberOfRooms] = useState('');
    const [numberOfParkingSpaces, setNumberOfParkingSpaces] = useState('0');

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        Promise.all([getPropertyById(id), getPropertyUnitsByProperty(id)]).then(([foundProperty, units]) => {
            setProperty(foundProperty);
            setUnitCount(units.length);
        });
    }, [propertyId]);

    if (property === undefined) return <PropertyLoadingPage />;
    if (property === null) return <PropertyNotFoundPage />;

    const backHref = `/existing-properties/${propertyId}/tenant-data`;

    const isValid = unitLabel.trim() !== '' && Number(livingAreaM2) > 0;
    const isEditing =
        unitLabel !== '' || floor !== '' || locationNote !== '' || livingAreaM2 !== '' ||
        numberOfRooms !== '' || numberOfParkingSpaces !== '0' || usageType !== UnitUsageType.Wohnung;

    // Any navigation away from an unsaved draft is routed through here so
    // it can be confirmed first (breadcrumb links, the back button).
    const goTo = (href: string) => {
        if (isEditing) {
            setPendingHref(href);
        } else {
            router.push(href);
        }
    };

    const confirmDiscard = () => {
        if (pendingHref) router.push(pendingHref);
        setPendingHref(null);
    };

    const breadcrumbItems: BreadcrumbItem[] = [
        {
            label: 'Bestandsobjekte',
            href: '/existing-properties',
            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo('/existing-properties'); } },
        },
        {
            label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`,
            href: `/existing-properties/${propertyId}`,
            onClick: (e) => { if (isEditing) { e.preventDefault(); goTo(`/existing-properties/${propertyId}`); } },
        },
        { label: 'Einheit hinzufügen' },
    ];

    const showParking = USAGE_TYPES_WITH_PARKING.has(usageType);
    const parkingCount = showParking ? Number(numberOfParkingSpaces) : 0;

    const handleSave = async () => {
        if (!isValid) return;
        setIsSaving(true);
        await createPropertyUnit({
            propertyId: parseInt(propertyId, 10),
            unitLabel: unitLabel.trim(),
            sortOrder: unitCount,
            usageType,
            floor: floor.trim() || null,
            locationNote: locationNote.trim() || null,
            livingAreaM2: livingAreaM2 !== '' ? Number(livingAreaM2) : null,
            numberOfRooms: numberOfRooms !== '' ? Number(numberOfRooms) : null,
            yearOfConstruction: null,
            energyEfficient: null,
            numberOfParkingSpaces: parkingCount,
            targetColdRent: null,
            targetParkingRent: null,
            targetAncillaryCosts: null,
        });
        showToast('Einheit gespeichert.');
        router.push(backHref);
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            <main className={PAGE_CONTAINER_CLASS}>
                <Header
                    items={breadcrumbItems}                />

                <div className="space-y-6">
                    {/* Usage type */}
                    <div>
                        <SectionLabel>Nutzungsart</SectionLabel>

                        <p className="mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wohneinheiten</p>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {WOHNEINHEITEN_OPTIONS.map((option) => (
                                <UsageTypeCard key={option.value} option={option} selected={usageType === option.value} onSelect={() => setUsageType(option.value)} />
                            ))}
                        </div>

                        <p className="mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sonstige Einheiten</p>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {SONSTIGE_EINHEITEN_OPTIONS.map((option) => (
                                <UsageTypeCard key={option.value} option={option} selected={usageType === option.value} onSelect={() => setUsageType(option.value)} />
                            ))}
                        </div>
                    </div>

                    {/* Label */}
                    <div>
                        <SectionLabel>Bezeichnung</SectionLabel>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <TextField
                                label="Bezeichnung"
                                placeholder="z.B. Whg. 1"
                                value={unitLabel}
                                onChange={(e) => setUnitLabel(e.target.value)}
                            />
                            <TextField
                                label="Etage"
                                optional
                                placeholder="z.B. EG"
                                value={floor}
                                onChange={(e) => setFloor(e.target.value)}
                            />
                            <TextField
                                label="Lage"
                                optional
                                placeholder="z.B. links"
                                value={locationNote}
                                onChange={(e) => setLocationNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Area & Details */}
                    <div>
                        <SectionLabel>Fläche & Details</SectionLabel>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <NumberField
                                label="Fläche"
                                unit="m²"
                                value={livingAreaM2}
                                onChange={(e) => setLivingAreaM2(e.target.value)}
                                min={0}
                            />
                            <NumberField
                                label="Zimmeranzahl"
                                optional
                                placeholder="–"
                                value={numberOfRooms}
                                onChange={(e) => setNumberOfRooms(e.target.value)}
                                min={0}
                            />
                        </div>
                    </div>

                    {/* Parking spaces — only relevant for units people occupy or run a business out of */}
                    {showParking && (
                        <div>
                            <SectionLabel>Stellplätze</SectionLabel>
                            <div className="mt-3">
                                <PillOptions options={PARKING_OPTIONS} value={numberOfParkingSpaces} onChange={setNumberOfParkingSpaces} />
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div>
                        <SectionLabel>Zusammenfassung</SectionLabel>
                        <div className="mt-3 rounded-lg border border-border divide-y divide-border overflow-hidden">
                            {[
                                ['Bezeichnung', unitLabel.trim() ? formatUnitLabel(unitLabel.trim(), floor, locationNote) : '–'],
                                ['Nutzungsart', USAGE_TYPE_LABEL[usageType]],
                                ['Fläche', livingAreaM2 !== '' ? `${deNumberFormatter.format(Number(livingAreaM2))} m²` : '–'],
                                ...(showParking ? [['Stellplätze', parkingCount === 0 ? 'Kein' : parkingCount === 4 ? '4+' : String(parkingCount)]] : []),
                            ].map(([label, value], index) => (
                                <div key={label} className={`flex items-center justify-between px-4 py-2.5 text-sm ${index % 2 === 1 ? 'bg-muted/30' : ''}`}>
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className={label === 'Nutzungsart' ? 'font-medium text-primary' : 'text-foreground'}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => goTo(backHref)}
                onPrimary={() => void handleSave()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel="Einheit speichern"
                primaryIcon={<Icons.Check className="w-4 h-4" />}
                primaryDisabled={!isEditing || !isValid || isSaving}
            />

            <UnsavedChangesModal
                open={pendingHref !== null}
                onCancel={() => setPendingHref(null)}
                onDiscard={confirmDiscard}
                context="an der neuen Einheit"
            />
        </div>
    );
}
