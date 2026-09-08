"use client";

import { PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { CalendarField, Dropdown, Header, Icons, NumberField, PAGE_CONTAINER_CLASS, StickyActionBar, TextArea, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import type { RentalTermsPetsAllowed, RentalTermsRedecorationClause, RentalTermsSubletAllowed } from '@immonext/types';
import { PenLine } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataCard, Field, initials, Pill } from '../../../DocumentGeneratorParts';
import { useRentalAgreementGenerator } from '../../../rentalAgreementGenerator';
import {
    agreementBodyHtml,
    PETS_OPTIONS,
    REDECORATION_OPTIONS,
    RENOVATION_ADJUSTMENT_OPTIONS,
    SUBLET_OPTIONS,
    type TriState,
} from '../../../rentalAgreementLetter';

type View = 'review' | 'preview';

export default function RentalAgreementPage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const personIdParam = searchParams.get('personId');
    const personId = personIdParam ? Number(personIdParam) : null;
    const data = useRentalAgreementGenerator(propertyId, unitId, personId);

    const [view, setView] = useState<View>('review');

    // The "PDF generieren" shortcut on the tenant-agreement page can link
    // here with ?autoGenerate=1 to skip the extra click — waits for the
    // generator's own data load (canGenerate) before firing, and only once.
    const didAutoGenerate = useRef(false);
    useEffect(() => {
        if (didAutoGenerate.current) return;
        if (searchParams.get('autoGenerate') !== '1') return;
        if (data.isLoading || !data.canGenerate) return;
        didAutoGenerate.current = true;
        void data.handleGenerate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, data.isLoading, data.canGenerate]);

    if (data.notFound) return <PropertyNotFoundPage />;
    if (data.isLoading || !data.property || !data.unit) return <PropertyLoadingPage />;

    const { property, unit, tenancy, landlord } = data;
    // Only reachable from the rental-agreement page now (its "Daten prüfen &
    // Vorschau" / "PDF generieren" buttons), so the back button and the
    // breadcrumb both lead back there — not to tenant data.
    const currentTenantHref = data.hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;
    const backHref = `/existing-properties/${propertyId}/tenant-agreement/${unit.propertyUnitId}`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(data.hasMultipleUnits ? [{ label: data.unitLabel, href: currentTenantHref }] : []),
        { label: 'Mietvertrag', href: backHref },
        { label: 'Mietvertrag generieren' },
    ];

    const namedPersons = (personId != null ? data.persons.filter((p) => p.tenancyPersonId === personId) : data.persons)
        .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
        .map((p) => ({ firstName: p.firstName ?? '', lastName: p.lastName ?? '', isPrimary: p.isPrimary }));

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
                                Der Mietvertrag wird automatisch aus den hinterlegten Daten befüllt. Ergänze fehlende Angaben direkt hier, bevor du
                                das Dokument generierst. Änderungen werden in die jeweiligen Bereiche zurückgespiegelt.
                            </p>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vermieter</p>
                            {landlord === null ? (
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
                                        <Field label="Name" value={landlord ? data.landlordName : '–'} />
                                        <Field label="Straße & Hausnummer" value={landlord ? data.landlordStreet : '–'} />
                                        <Field label="PLZ & Ort" value={landlord ? data.landlordCity : '–'} />
                                    </div>
                                </DataCard>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietobjekt</p>
                            <DataCard icon={Icons.Home} title="Objektdaten" source="Bestandsobjekt · Objektdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                    <Field label="Straße & Hausnummer" value={data.propertyStreet} />
                                    <Field label="PLZ & Ort" value={data.propertyCity} />
                                    <Field label="Einheit" value={data.unitLabel} />
                                    <Field label="Stellplatz" value={tenancy?.parkingSpaceRent ? '1 Stellplatz' : '–'} />
                                    <Field label="Wohnfläche" value={data.livingArea} />
                                    <Field label="Zimmer" value={data.numberOfRooms} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietpartei(en)</p>
                            <DataCard icon={Icons.Users} title="Mieterdaten" source="Bestandsobjekt · Mieterdaten">
                                <div className="flex flex-col gap-2">
                                    {namedPersons.length === 0 && <p className="text-sm text-muted-foreground">Keine Mieterdaten hinterlegt.</p>}
                                    {namedPersons.map((person, index) => (
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
                                            <Pill ok label="Vollständig" />
                                        </div>
                                    ))}
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietkonditionen</p>
                            <DataCard icon={Icons.FileSignature} title="Mietvertrag" source="Bestandsobjekt · Mieterdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                    <Field label="Mietbeginn" value={data.mietbeginn} />
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mietende</p>
                                        <div className="mt-1"><Pill ok={!data.befristet} label={data.befristet ? data.mietende : 'Unbefristet'} /></div>
                                    </div>
                                    <Field label="Nettokaltmiete" value={data.content.coldRent} />
                                    {data.content.parkingRent && <Field label="Stellplatz" value={data.content.parkingRent} />}
                                    <Field label="NK-Vorauszahlung" value={data.content.miscRent} />
                                    <Field label="Gesamtmiete" value={data.content.warmRent} />
                                    <Field label="Kaution" value={data.content.deposit} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietanpassung & Sonderregelungen</p>
                            <DataCard icon={Icons.FileSignature} title="Anpassungsregelungen" source="Bestandsobjekt · Mietvertrag">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <CalendarField
                                        label="Nächste Mietanpassung"
                                        value={data.nextRentAdjustmentDate}
                                        onChange={data.setNextRentAdjustmentDate}
                                    />
                                    <NumberField
                                        label="Höhe der Anpassung"
                                        unit="€"
                                        min={0}
                                        value={data.nextRentAdjustmentAmount}
                                        onChange={(e) => data.setNextRentAdjustmentAmount(e.target.value)}
                                    />
                                    <Dropdown
                                        label="Sanierungsanpassung geplant"
                                        options={RENOVATION_ADJUSTMENT_OPTIONS}
                                        value={data.renovationAdjustmentPlanned}
                                        onChange={(e) => data.setRenovationAdjustmentPlanned(e.target.value as TriState)}
                                    />
                                    <Dropdown
                                        label="Haustierhaltung"
                                        options={PETS_OPTIONS}
                                        value={data.petsAllowed}
                                        onChange={(e) => data.setPetsAllowed(e.target.value as RentalTermsPetsAllowed | '')}
                                    />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Zusätzliche Klauseln</p>
                            <DataCard icon={PenLine} title="Individuelle Vereinbarungen" source="Ergänzbar">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Dropdown
                                        label="Schönheitsreparaturen"
                                        options={REDECORATION_OPTIONS}
                                        value={data.redecorationClause}
                                        onChange={(e) => data.setRedecorationClause(e.target.value as RentalTermsRedecorationClause | '')}
                                    />
                                    <Dropdown
                                        label="Untervermietung"
                                        options={SUBLET_OPTIONS}
                                        value={data.subletAllowed}
                                        onChange={(e) => data.setSubletAllowed(e.target.value as RentalTermsSubletAllowed | '')}
                                    />
                                    <TextArea
                                        label="Sonstige Vereinbarungen"
                                        placeholder="Freitext für individuelle Vereinbarungen…"
                                        className="sm:col-span-2"
                                        value={data.additionalTerms}
                                        onChange={(e) => data.setAdditionalTerms(e.target.value)}
                                    />
                                </div>
                            </DataCard>
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
                                            Lade die Vermieter-Unterschrift als Bilddatei hoch (PNG, JPG).
                                            Die Unterschrift des Mieters wird nach Ausdrucken eingeholt.
                                        </p>
                                    )}
                                    <input
                                        id="signature-upload-rental"
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
                                    <label htmlFor="signature-upload-rental">
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
                                dangerouslySetInnerHTML={{ __html: agreementBodyHtml(data.content) }}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Es fehlen noch Angaben (Vermieterdaten oder Mieterdaten), um die Vorschau anzuzeigen.
                            </p>
                        )}
                    </div>
                )}

                {data.saveError && (
                    <p className="mt-4 text-sm text-destructive">{data.saveError}</p>
                )}
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                onPrimary={() => void data.handleGenerate()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={data.isGenerating ? 'Wird erstellt…' : 'PDF generieren'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!data.canGenerate || data.isGenerating}
            />
        </div>
    );
}
