"use client";

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { CalendarField, Dropdown, Header, Icons, NumberField, PAGE_CONTAINER_CLASS, StickyActionBar, TextArea, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { htmlToPdfBlob } from '@/lib/pdf/htmlToPdf';
import { updateTenancy } from '@/lib/supabase/tenancy.supabase';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import type { RentalTermsPetsAllowed, RentalTermsRedecorationClause, RentalTermsSubletAllowed } from '@immonext/types';
import { format } from 'date-fns';
import { PenLine } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataCard, Field, initials, Pill, readFileAsDataUrl } from '../../../DocumentGeneratorParts';
import { useUnitDocumentGeneratorData } from '../../../useUnitDocumentGeneratorData';

type View = 'review' | 'preview';
type TriState = '' | 'true' | 'false';

const PETS_OPTIONS: { value: RentalTermsPetsAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Vereinbarung', label: 'Nach Vereinbarung' },
];

const REDECORATION_OPTIONS: { value: RentalTermsRedecorationClause | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Mieter trägt Kosten (üblich)', label: 'Mieter trägt Kosten (üblich)' },
    { value: 'Vermieter trägt Kosten', label: 'Vermieter trägt Kosten' },
    { value: 'Individuelle Regelung', label: 'Individuelle Regelung' },
];

const SUBLET_OPTIONS: { value: RentalTermsSubletAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Zustimmung', label: 'Nach Zustimmung' },
];

const RENOVATION_ADJUSTMENT_OPTIONS: { value: TriState; label: string }[] = [
    { value: '', label: 'Nicht erfasst' },
    { value: 'true', label: 'Geplant' },
    { value: 'false', label: 'Nicht geplant' },
];

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

interface AgreementContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    propertyAddress: string;
    unitLabel: string;
    livingArea: string;
    numberOfRooms: string;
    tenants: { name: string; role: string }[];
    mietbeginn: string;
    befristet: boolean;
    mietende: string;
    coldRent: string;
    miscRent: string;
    parkingRent: string | null;
    warmRent: string;
    deposit: string;
    depositRatio: string | null;
    nextRentAdjustmentDate: string | null;
    nextRentAdjustmentAmount: string | null;
    renovationAdjustmentPlanned: boolean | null;
    petsAllowed: RentalTermsPetsAllowed | null;
    redecorationClause: RentalTermsRedecorationClause | null;
    subletAllowed: RentalTermsSubletAllowed | null;
    additionalTerms: string | null;
    issuePlace: string;
    issueDate: string;
    documentNumber: string;
    signatureDataUrl: string | null;
}

function agreementBodyHtml(c: AgreementContent): string {
    const tenantNames = c.tenants.map((t) => t.name).join(' / ');
    const tenantRows = c.tenants.map((t) => `
        <div style="background:#f2f4f7;border-radius:6px;padding:8px 12px;margin-bottom:6px;">
            <strong>${t.name}</strong> <span style="color:#475467;font-size:12px;">— ${t.role}</span>
        </div>`).join('');

    const signatureBlock = c.signatureDataUrl
        ? `<img src="${c.signatureDataUrl}" style="max-height:60px;max-width:220px;" />`
        : `<div style="height:40px;"></div>`;

    const sectionTitle = (n: number, label: string) => `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#224b96;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin:24px 0 10px;">§ ${n} · ${label}</h2>`;
    const row = (label: string, value: string, bold = false) => `<p style="margin:4px 0;display:flex;justify-content:space-between;${bold ? 'font-weight:bold;' : ''}"><span style="color:#475467;">${label}</span><span>${value}</span></p>`;
    const note = (html: string) => `<div style="border-left:3px solid #224b96;background:#e9edf4;padding:12px 16px;font-size:13px;margin:10px 0 4px;">${html}</div>`;

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:13px;line-height:1.5;">
                <strong>${c.landlordName}</strong><br/>${c.landlordStreet}<br/>${c.landlordCity}
            </div>
            <div style="font-size:12px;color:#475467;text-align:right;line-height:1.6;">
                Vertragsdatum: ${c.issueDate}<br/>
                Ort: ${c.issuePlace}<br/>
                Vertrags-Nr.: ${c.documentNumber}
            </div>
        </div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #d0d5dd;" />
        <h1 style="text-align:center;font-size:22px;margin-bottom:4px;">Mietvertrag</h1>
        <p style="text-align:center;color:#475467;font-size:13px;margin-bottom:16px;">Wohnraummietvertrag gemäß §§ 535 ff. BGB</p>

        ${sectionTitle(1, 'Vertragsparteien')}
        ${row('Vermieter', `${c.landlordName}, ${c.landlordStreet}, ${c.landlordCity}`)}
        ${row('Mieter', tenantNames || '–')}
        ${tenantRows}

        ${sectionTitle(2, 'Mietobjekt')}
        ${row('Adresse', c.propertyAddress)}
        ${row('Einheit', c.unitLabel)}
        ${row('Wohnfläche', `ca. ${c.livingArea}`)}
        ${row('Zimmer', c.numberOfRooms)}

        ${sectionTitle(3, 'Mietdauer')}
        ${c.befristet
            ? note(`<strong>BEFRISTETES MIETVERHÄLTNIS</strong><br/>Das Mietverhältnis beginnt am ${c.mietbeginn} und endet am ${c.mietende}.`)
            : note(`<strong>UNBEFRISTETES MIETVERHÄLTNIS</strong><br/>Das Mietverhältnis beginnt am ${c.mietbeginn} und läuft auf unbestimmte Zeit. Es kann von beiden Parteien mit der gesetzlichen Kündigungsfrist gekündigt werden.`)}

        ${sectionTitle(4, 'Miete & Nebenkosten')}
        ${row('Nettokaltmiete', c.coldRent)}
        ${c.parkingRent ? row('Stellplatz', c.parkingRent) : ''}
        ${row('NK-Vorauszahlung', c.miscRent)}
        ${row('Gesamtmiete', c.warmRent, true)}
        ${note('Die Nebenkostenvorauszahlung wird jährlich abgerechnet. Eine Anpassung ist nach erfolgter Abrechnung möglich.')}

        ${sectionTitle(5, 'Kaution')}
        ${note(`Der Mieter leistet eine Kaution in Höhe von ${c.deposit}${c.depositRatio ? ` (entspricht ${c.depositRatio} Nettokaltmieten)` : ''}. Die Kaution ist zu Mietbeginn fällig und wird zinsbringend angelegt.`)}

        ${sectionTitle(6, 'Mietanpassung')}
        ${c.nextRentAdjustmentDate
            ? note(`Eine Mieterhöhung ist zum ${c.nextRentAdjustmentDate}${c.nextRentAdjustmentAmount ? ` in Höhe von ${c.nextRentAdjustmentAmount}` : ''} vorgesehen, vorbehaltlich der gesetzlichen Voraussetzungen gemäß § 558 BGB.${c.renovationAdjustmentPlanned ? ' Zusätzlich ist eine Mieterhöhung infolge geplanter Modernisierungsmaßnahmen gemäß § 559 BGB vorgesehen.' : ''}`)
            : note('Es ist derzeit keine Mietanpassung vorgesehen. Gesetzliche Mieterhöhungen gemäß §§ 558 f. BGB bleiben hiervon unberührt.')}

        ${sectionTitle(7, 'Haustierhaltung & Sonstige Vereinbarungen')}
        ${row('Haustierhaltung', c.petsAllowed ?? 'Nicht geregelt')}
        ${row('Schönheitsreparaturen', c.redecorationClause ?? 'Nicht geregelt')}
        ${row('Untervermietung', c.subletAllowed ?? 'Nicht geregelt')}
        ${c.additionalTerms ? note(c.additionalTerms) : ''}

        <p style="margin:32px 0 0;">${c.issuePlace}, ${c.issueDate}</p>

        <div style="display:flex;justify-content:space-between;margin-top:16px;">
            <div style="width:45%;">
                <div style="margin-bottom:8px;">${signatureBlock}</div>
                <div style="border-top:1px solid #101828;"></div>
                <div style="font-size:12px;color:#475467;margin-top:4px;">Unterschrift Vermieter</div>
                <div style="font-size:11px;color:#98a2b3;">${c.landlordName}</div>
            </div>
            <div style="width:45%;">
                <div style="height:40px;"></div>
                <div style="border-top:1px solid #101828;"></div>
                <div style="font-size:12px;color:#475467;margin-top:4px;">Unterschrift Mieter</div>
                <div style="font-size:11px;color:#98a2b3;">${tenantNames || '–'}</div>
            </div>
        </div>

        <hr style="margin:32px 0 12px;border:none;border-top:1px solid #d0d5dd;" />
        <p style="font-size:11px;color:#98a2b3;">Mietvertrag · ${c.propertyAddress} · Seite 1 von 1</p>
    `;
}

export default function RentalAgreementPage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const personIdParam = searchParams.get('personId');
    const { user } = useRequireAuth();
    const { isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord } =
        useUnitDocumentGeneratorData(propertyId, unitId, user?.id);

    const [view, setView] = useState<View>('review');
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Rental-agreement clauses — persisted on the tenancy, seeded from it once.
    const [nextRentAdjustmentDate, setNextRentAdjustmentDate] = useState<Date | undefined>(undefined);
    const [nextRentAdjustmentAmount, setNextRentAdjustmentAmount] = useState('');
    const [renovationAdjustmentPlanned, setRenovationAdjustmentPlanned] = useState<TriState>('');
    const [petsAllowed, setPetsAllowed] = useState<RentalTermsPetsAllowed | ''>('');
    const [redecorationClause, setRedecorationClause] = useState<RentalTermsRedecorationClause | ''>('');
    const [subletAllowed, setSubletAllowed] = useState<RentalTermsSubletAllowed | ''>('');
    const [additionalTerms, setAdditionalTerms] = useState('');
    const seededTenancyId = useRef<number | null>(null);

    useEffect(() => {
        if (!tenancy || seededTenancyId.current === tenancy.tenancyId) return;
        seededTenancyId.current = tenancy.tenancyId;
        setNextRentAdjustmentDate(tenancy.nextRentAdjustmentDate ? new Date(tenancy.nextRentAdjustmentDate) : undefined);
        setNextRentAdjustmentAmount(tenancy.nextRentAdjustmentAmount != null ? String(tenancy.nextRentAdjustmentAmount) : '');
        setRenovationAdjustmentPlanned(tenancy.renovationAdjustmentPlanned == null ? '' : tenancy.renovationAdjustmentPlanned ? 'true' : 'false');
        setPetsAllowed(tenancy.petsAllowed ?? '');
        setRedecorationClause(tenancy.redecorationClause ?? '');
        setSubletAllowed(tenancy.subletAllowed ?? '');
        setAdditionalTerms(tenancy.additionalTerms ?? '');
    }, [tenancy]);

    // The "PDF generieren" shortcut on the tenant-unit page links here with
    // ?autoGenerate=1 to skip the extra click — handleGenerate is defined
    // further down (after the not-found/loading early returns), so it's
    // invoked indirectly through a ref that gets assigned once it exists.
    const didAutoGenerate = useRef(false);
    const handleGenerateRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        if (didAutoGenerate.current) return;
        if (searchParams.get('autoGenerate') !== '1') return;
        if (!handleGenerateRef.current) return;
        didAutoGenerate.current = true;
        handleGenerateRef.current();
    }, [searchParams, tenancy, landlord, persons]);

    if (notFound) return <PropertyNotFoundPage />;
    if (isLoading || !property || !unit) return <PropertyLoadingPage />;

    const unitLabel = formatUnitLabel(unit.unitLabel, unit.floor, unit.locationNote);
    // Only reachable from the rental-agreement page now (its "Daten prüfen &
    // Vorschau" / "PDF generieren" buttons), so the back button and the
    // breadcrumb both lead back there — not to tenant data.
    const currentTenantHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;
    const backHref = `/existing-properties/${propertyId}/tenant-agreement/${unit.propertyUnitId}`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(hasMultipleUnits ? [{ label: unitLabel, href: currentTenantHref }] : []),
        { label: 'Mietvertrag', href: backHref },
        { label: 'Mietvertrag generieren' },
    ];

    const targetPersons = personIdParam
        ? persons.filter((p) => String(p.tenancyPersonId) === personIdParam)
        : persons;

    const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '';
    const landlordStreet = landlord ? `${landlord.street} ${landlord.houseNumber}` : '';
    const landlordCity = landlord ? `${landlord.postalCode} ${landlord.city}` : '';
    const propertyStreet = `${property.street} ${property.houseNumber}`;
    const propertyCity = `${property.postalCode} ${property.city}`;
    const propertyAddress = `${propertyStreet}, ${propertyCity}`;
    const namedPersons = targetPersons
        .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
        .map((p) => ({ firstName: p.firstName ?? '', lastName: p.lastName ?? '', isPrimary: p.isPrimary }));
    const tenants = namedPersons.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim(),
        role: p.isPrimary ? 'Hauptmieter' : 'Weitere Person',
    }));
    const mietbeginn = tenancy?.tenancyStartDate ? formatDeDate(tenancy.tenancyStartDate) : '–';
    const befristet = tenancy?.tenancyEndDate != null;
    const mietende = tenancy?.tenancyEndDate ? formatDeDate(tenancy.tenancyEndDate) : '–';
    const issuePlace = landlord?.city || property.city;
    const issueDate = formatDeDate(new Date().toISOString());
    const canGenerate = landlord != null && tenants.length > 0 && tenancy != null;
    const livingArea = unit.livingAreaM2 != null ? `${unit.livingAreaM2} m²` : '–';
    const numberOfRooms = unit.numberOfRooms != null ? String(unit.numberOfRooms) : '–';
    const documentNumber = `MV-${new Date().getFullYear()}-${String(tenancy?.tenancyId ?? 0).padStart(3, '0')}`;

    const depositRatio = tenancy?.deposit && tenancy.coldRent
        ? (tenancy.deposit / tenancy.coldRent).toLocaleString('de-DE', { maximumFractionDigits: 1 })
        : null;

    const content: AgreementContent = {
        landlordName,
        landlordStreet,
        landlordCity,
        propertyAddress,
        unitLabel,
        livingArea,
        numberOfRooms,
        tenants,
        mietbeginn,
        befristet,
        mietende,
        coldRent: euro(tenancy?.coldRent),
        miscRent: euro(tenancy?.miscRent),
        parkingRent: tenancy?.parkingSpaceRent ? euro(tenancy.parkingSpaceRent) : null,
        warmRent: euro(tenancy?.warmRent),
        deposit: euro(tenancy?.deposit),
        depositRatio,
        nextRentAdjustmentDate: nextRentAdjustmentDate ? formatDeDate(format(nextRentAdjustmentDate, 'yyyy-MM-dd')) : null,
        nextRentAdjustmentAmount: nextRentAdjustmentAmount !== '' ? euro(Number(nextRentAdjustmentAmount)) : null,
        renovationAdjustmentPlanned: renovationAdjustmentPlanned === '' ? null : renovationAdjustmentPlanned === 'true',
        petsAllowed: petsAllowed || null,
        redecorationClause: redecorationClause || null,
        subletAllowed: subletAllowed || null,
        additionalTerms: additionalTerms.trim() || null,
        issuePlace,
        issueDate,
        documentNumber,
        signatureDataUrl,
    };

    const handleUploadSignature = async (file: File) => {
        setIsUploadingSignature(true);
        try {
            setSignatureDataUrl(await readFileAsDataUrl(file));
        } finally {
            setIsUploadingSignature(false);
        }
    };

    const handleGenerate = async () => {
        if (!canGenerate || !tenancy) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const saved = await updateTenancy(tenancy.tenancyId, {
                nextRentAdjustmentDate: nextRentAdjustmentDate ? format(nextRentAdjustmentDate, 'yyyy-MM-dd') : null,
                nextRentAdjustmentAmount: nextRentAdjustmentAmount !== '' ? Number(nextRentAdjustmentAmount) : null,
                renovationAdjustmentPlanned: renovationAdjustmentPlanned === '' ? null : renovationAdjustmentPlanned === 'true',
                petsAllowed: petsAllowed || null,
                redecorationClause: redecorationClause || null,
                subletAllowed: subletAllowed || null,
                additionalTerms: additionalTerms.trim() || null,
            });
            if (!saved) {
                setSaveError('Angaben konnten nicht gespeichert werden.');
                return;
            }

            const blob = await htmlToPdfBlob(agreementBodyHtml(content));
            if (user) {
                const file = new File([blob], `${documentNumber}.pdf`, { type: 'application/pdf' });
                await uploadTenancyDocument(user.id, file, {
                    tenancyId: tenancy.tenancyId,
                    tenancyPersonId: personIdParam ? Number(personIdParam) : null,
                    documentType: 'Mietvertrag',
                });
            }
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
        } finally {
            setIsSaving(false);
        }
    };

    handleGenerateRef.current = () => void handleGenerate();

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
                        onClick={() => canGenerate && setView('preview')}
                        disabled={!canGenerate}
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
                                        <Field label="Name" value={landlord ? landlordName : '–'} />
                                        <Field label="Straße & Hausnummer" value={landlord ? landlordStreet : '–'} />
                                        <Field label="PLZ & Ort" value={landlord ? landlordCity : '–'} />
                                    </div>
                                </DataCard>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietobjekt</p>
                            <DataCard icon={Icons.Home} title="Objektdaten" source="Bestandsobjekt · Objektdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                    <Field label="Straße & Hausnummer" value={propertyStreet} />
                                    <Field label="PLZ & Ort" value={propertyCity} />
                                    <Field label="Einheit" value={unitLabel} />
                                    <Field label="Stellplatz" value={tenancy?.parkingSpaceRent ? '1 Stellplatz' : '–'} />
                                    <Field label="Wohnfläche" value={livingArea} />
                                    <Field label="Zimmer" value={numberOfRooms} />
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
                                    <Field label="Mietbeginn" value={mietbeginn} />
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mietende</p>
                                        <div className="mt-1"><Pill ok={!befristet} label={befristet ? mietende : 'Unbefristet'} /></div>
                                    </div>
                                    <Field label="Nettokaltmiete" value={content.coldRent} />
                                    {content.parkingRent && <Field label="Stellplatz" value={content.parkingRent} />}
                                    <Field label="NK-Vorauszahlung" value={content.miscRent} />
                                    <Field label="Gesamtmiete" value={content.warmRent} />
                                    <Field label="Kaution" value={content.deposit} />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietanpassung & Sonderregelungen</p>
                            <DataCard icon={Icons.FileSignature} title="Anpassungsregelungen" source="Bestandsobjekt · Mietvertrag">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <CalendarField
                                        label="Nächste Mietanpassung"
                                        value={nextRentAdjustmentDate}
                                        onChange={setNextRentAdjustmentDate}
                                    />
                                    <NumberField
                                        label="Höhe der Anpassung"
                                        unit="€"
                                        min={0}
                                        value={nextRentAdjustmentAmount}
                                        onChange={(e) => setNextRentAdjustmentAmount(e.target.value)}
                                    />
                                    <Dropdown
                                        label="Sanierungsanpassung geplant"
                                        options={RENOVATION_ADJUSTMENT_OPTIONS}
                                        value={renovationAdjustmentPlanned}
                                        onChange={(e) => setRenovationAdjustmentPlanned(e.target.value as TriState)}
                                    />
                                    <Dropdown
                                        label="Haustierhaltung"
                                        options={PETS_OPTIONS}
                                        value={petsAllowed}
                                        onChange={(e) => setPetsAllowed(e.target.value as RentalTermsPetsAllowed | '')}
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
                                        value={redecorationClause}
                                        onChange={(e) => setRedecorationClause(e.target.value as RentalTermsRedecorationClause | '')}
                                    />
                                    <Dropdown
                                        label="Untervermietung"
                                        options={SUBLET_OPTIONS}
                                        value={subletAllowed}
                                        onChange={(e) => setSubletAllowed(e.target.value as RentalTermsSubletAllowed | '')}
                                    />
                                    <TextArea
                                        label="Sonstige Vereinbarungen"
                                        placeholder="Freitext für individuelle Vereinbarungen…"
                                        className="sm:col-span-2"
                                        value={additionalTerms}
                                        onChange={(e) => setAdditionalTerms(e.target.value)}
                                    />
                                </div>
                            </DataCard>
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Unterschrift Vermieter</p>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <Pill ok={signatureDataUrl != null} label={signatureDataUrl != null ? 'Unterschrift hinterlegt' : 'Keine Unterschrift hinterlegt'} />
                                    {!signatureDataUrl && <span className="ml-2 text-xs text-muted-foreground">Das Dokument wird ohne Unterschrift generiert.</span>}
                                </div>
                                <div className="rounded-lg border border-dashed border-border p-4 flex items-center justify-between gap-4 flex-wrap">
                                    {signatureDataUrl ? (
                                        <div className="flex items-center gap-3">
                                            <img src={signatureDataUrl} alt="Unterschrift" className="h-12 max-w-[180px] object-contain" />
                                            <button type="button" onClick={() => setSignatureDataUrl(null)} className="text-sm text-destructive hover:underline cursor-pointer">
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
                                        disabled={isUploadingSignature}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) void handleUploadSignature(file);
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
                            <Pill ok={signatureDataUrl != null} label={signatureDataUrl != null ? 'Unterschrift hinterlegt' : 'Keine Unterschrift hinterlegt'} />
                        </div>
                        {canGenerate ? (
                            <div
                                className="bg-white text-black rounded-md shadow-sm p-8 text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: agreementBodyHtml(content) }}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Es fehlen noch Angaben (Vermieterdaten oder Mieterdaten), um die Vorschau anzuzeigen.
                            </p>
                        )}
                    </div>
                )}

                {saveError && (
                    <p className="mt-4 text-sm text-destructive">{saveError}</p>
                )}
            </main>

            <StickyActionBar
                show={true}
                onGhost={() => router.push(backHref)}
                onPrimary={() => void handleGenerate()}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={isSaving ? 'Wird erstellt…' : 'PDF generieren'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!canGenerate || isSaving}
            />
        </div>
    );
}
