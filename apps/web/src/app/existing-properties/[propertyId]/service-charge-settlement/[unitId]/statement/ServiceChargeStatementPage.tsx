"use client";

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Header, Icons, LoadingScreen, PAGE_CONTAINER_CLASS, StickyActionBar, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { getPropertyById } from '@/lib/supabase/property.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getTenancyPersonsByTenancy } from '@/lib/supabase/tenancy_person.supabase';
import type { Property, PropertyUnit, TenancyPerson } from '@immoandthebrain/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DataCard, Field, initials, Pill } from '../../../tenant-data/DocumentGeneratorParts';
import { euro, useServiceChargeSettlementData } from '../../useServiceChargeSettlementData';

type View = 'review' | 'preview';

export default function ServiceChargeStatementPage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const [property, setProperty] = useState<Property | null | undefined>(undefined);
    const [unit, setUnit] = useState<PropertyUnit | null | undefined>(undefined);
    const [hasMultipleUnits, setHasMultipleUnits] = useState(false);
    const [persons, setPersons] = useState<TenancyPerson[]>([]);
    const [view, setView] = useState<View>('review');

    useEffect(() => {
        const id = parseInt(propertyId, 10);
        const targetUnitId = parseInt(unitId, 10);
        Promise.all([
            getPropertyById(id),
            getPropertyUnitsByProperty(id),
        ]).then(([foundProperty, units]) => {
            setProperty(foundProperty);
            setUnit(units.find((u) => u.propertyUnitId === targetUnitId) ?? null);
            setHasMultipleUnits(units.length > 1);
        });
    }, [propertyId, unitId]);

    if (property === undefined || unit === undefined) return <PropertyLoadingPage />;
    if (property === null || unit === null) return <PropertyNotFoundPage />;

    return (
        <ServiceChargeStatementContent
            propertyId={propertyId}
            property={property}
            unit={unit}
            hasMultipleUnits={hasMultipleUnits}
            persons={persons}
            setPersons={setPersons}
            view={view}
            setView={setView}
            router={router}
        />
    );
}

function ServiceChargeStatementContent({
    propertyId,
    property,
    unit,
    hasMultipleUnits,
    persons,
    setPersons,
    view,
    setView,
    router,
}: {
    propertyId: string;
    property: Property;
    unit: PropertyUnit;
    hasMultipleUnits: boolean;
    persons: TenancyPerson[];
    setPersons: (persons: TenancyPerson[]) => void;
    view: View;
    setView: (view: View) => void;
    router: ReturnType<typeof useRouter>;
}) {
    const data = useServiceChargeSettlementData(propertyId, property, unit, hasMultipleUnits);

    useEffect(() => {
        if (!data.tenancy) { setPersons([]); return; }
        let cancelled = false;
        getTenancyPersonsByTenancy(data.tenancy.tenancyId).then((loaded) => { if (!cancelled) setPersons(loaded); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.tenancy?.tenancyId]);

    useEffect(() => {
        if (view === 'preview' && data.previewHtml === null && data.canGeneratePdf) {
            void data.handlePreview();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, data.canGeneratePdf]);

    if (data.isLoading) return <PropertyLoadingPage />;

    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);
    const settlementHref = `/existing-properties/${propertyId}/service-charge-settlement/${unit.propertyUnitId}`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(hasMultipleUnits
            ? [
                { label: unitLabel, href: `/existing-properties/${propertyId}/${unit.propertyUnitId}` },
                { label: ExistingPropertiesUseCases.ServiceChargeSettlement, href: settlementHref },
            ]
            : [
                { label: ExistingPropertiesUseCases.ServiceChargeSettlement, href: settlementHref },
            ]),
        { label: 'Nebenkostenabrechnung generieren' },
    ];

    const namedPersons = persons
        .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
        .map((p) => ({
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            isPrimary: p.isPrimary,
        }));

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
                        onClick={() => data.canGeneratePdf && setView('preview')}
                        disabled={!data.canGeneratePdf}
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
                                Die Abrechnung wird automatisch aus den hinterlegten Daten und den erfassten Kostenpositionen befüllt. Prüfe die Angaben, bevor du das Dokument generierst.
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
                                        <Field label="Name" value={data.landlord ? `${data.landlord.firstName} ${data.landlord.lastName}`.trim() : '–'} />
                                        <Field label="Straße & Hausnummer" value={data.landlord ? `${data.landlord.street} ${data.landlord.houseNumber}` : '–'} />
                                        <Field label="PLZ & Ort" value={data.landlord ? `${data.landlord.postalCode} ${data.landlord.city}` : '–'} />
                                    </div>
                                </DataCard>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietobjekt</p>
                            <DataCard icon={Icons.FileText} title="Objektdaten" source="Bestandsobjekt · Objektdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Field label="Straße & Hausnummer" value={`${property.street} ${property.houseNumber}`} />
                                    <Field label="PLZ & Ort" value={`${property.postalCode} ${property.city}`} />
                                    <Field label="Einheit" value={unitLabel} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mieterdaten</p>
                            <DataCard icon={Icons.Users} title="Mieterdaten" source="Bestandsobjekt · Mieterdaten">
                                <div className="flex flex-col gap-2">
                                    {namedPersons.length === 0 && <p className="text-sm text-muted-foreground">Keine Mieterdaten hinterlegt.</p>}
                                    {namedPersons.map((person, index) => (
                                        <div key={index} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                                            <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                                {initials(person.firstName, person.lastName)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{`${person.firstName} ${person.lastName}`.trim()}</p>
                                                <p className="text-xs text-muted-foreground">{person.isPrimary ? 'Hauptmieter' : 'Weitere Person'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Abrechnungszeitraum</p>
                            <DataCard icon={Icons.FileText} title="Nebenkostenabrechnung" source="Bestandsobjekt · Nebenkostenabrechnung">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Abrechnungsjahr" value={String(data.settlementYear)} />
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kostenpositionen erfasst</p>
                                        <div className="mt-1"><Pill ok={data.costItems.some((i) => i.actualAmount !== '')} label={data.costItems.some((i) => i.actualAmount !== '') ? 'Ja' : 'Noch keine'} /></div>
                                    </div>
                                    <Field label="Gesamtkosten Objekt" value={euro(data.totalActualCostsAll)} />
                                    <Field label={`Anteil ${unitLabel}`} value={euro(data.unitActualShare)} />
                                </div>
                            </DataCard>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6">
                        {data.canGeneratePdf ? (
                            data.previewHtml ? (
                                <iframe
                                    title="Nebenkostenabrechnung Vorschau"
                                    srcDoc={data.previewHtml}
                                    className="w-full h-[75vh] rounded-md border border-border bg-white"
                                />
                            ) : (
                                <LoadingScreen message="Vorschau wird geladen…" fullScreen={false} />
                            )
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
                onGhost={() => router.push(settlementHref)}
                onPrimary={() => void data.handleGeneratePdf()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={data.isGeneratingPdf ? 'Wird erstellt…' : 'PDF generieren'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!data.canGeneratePdf || data.isGeneratingPdf}
            />
        </div>
    );
}
