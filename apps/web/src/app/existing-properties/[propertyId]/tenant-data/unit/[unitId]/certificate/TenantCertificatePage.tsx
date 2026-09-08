"use client";

import { formatUnitLabel, PropertyLoadingPage, PropertyNotFoundPage } from '@/components/features/PropertyDisplay';
import { Button, Header, Icons, Modal, PAGE_CONTAINER_CLASS, StickyActionBar, type BreadcrumbItem } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { ExistingPropertiesUseCases } from '@/constants/ExistingPropertiesUseCases';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { buildCertificateDocxBlob } from '@/lib/docx/certificateDocx';
import { uploadTenancyDocument } from '@/lib/supabase/tenancy_document.supabase';
import { downloadBlob, formatDeDate } from '@/lib/utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DataCard, Field, initials, Pill, readFileAsDataUrl } from '../../../DocumentGeneratorParts';
import { useUnitDocumentGeneratorData } from '../../../useUnitDocumentGeneratorData';

type View = 'review' | 'preview';

function isPersonComplete(person: { firstName: string; lastName: string; isPrimary: boolean; taxId: string; moveInDate: Date | undefined }): boolean {
    if (person.firstName.trim() === '' || person.lastName.trim() === '') return false;
    if (person.isPrimary) return person.taxId.trim() !== '' && person.moveInDate != null;
    return true;
}

interface CertificateContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    /** Whether the Vermieter is also the Eigentümer of the unit. */
    isLandlordOwner: boolean;
    propertyAddress: string;
    unitLabel: string;
    tenants: { name: string; role: string }[];
    mietbeginn: string;
    /** Move-out date ("Mietauszug") — null when the tenancy has no end date yet. */
    mietende: string | null;
    mietvertragAktiv: boolean;
    issuePlace: string;
    issueDate: string;
    documentNumber: string;
    signatureDataUrl: string | null;
}

function certificateBodyHtml(c: CertificateContent): string {
    const tenantRows = c.tenants.map((t) => `
        <div style="background:#f2f4f7;border-radius:6px;padding:8px 12px;margin-bottom:6px;">
            <strong>${t.name}</strong> <span style="color:#475467;font-size:12px;">— ${t.role}</span>
        </div>`).join('');

    const signatureBlock = c.signatureDataUrl
        ? `<img src="${c.signatureDataUrl}" style="max-height:60px;max-width:220px;" />`
        : `<div style="width:220px;height:60px;border:1px dashed #98a2b3;display:flex;align-items:center;justify-content:center;color:#98a2b3;font-size:12px;">[Unterschrift nicht hinterlegt]</div>`;

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:13px;line-height:1.5;">
                <strong>${c.landlordName}</strong><br/>${c.landlordStreet}<br/>${c.landlordCity}
            </div>
            <div style="font-size:12px;color:#475467;text-align:right;line-height:1.6;">
                Ausgestellt am: ${c.issueDate}<br/>
                Ausstellungsort: ${c.issuePlace}<br/>
                Dokument-Nr.: ${c.documentNumber}
            </div>
        </div>
        <hr style="margin:20px 0;border:none;border-top:1px solid #d0d5dd;" />
        <h1 style="text-align:center;font-size:22px;margin-bottom:4px;">Mieterbescheinigung</h1>
        <p style="text-align:center;color:#475467;font-size:13px;margin-bottom:28px;">Bestätigung eines bestehenden Mietverhältnisses</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Vermieter</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Name:</span> ${c.landlordName}</p>
        <p style="margin:4px 0;"><span style="color:#475467;">Adresse:</span> ${c.landlordStreet}, ${c.landlordCity}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Eigentümer der Wohnung:</span> ${c.isLandlordOwner ? 'Ja' : 'Nein'}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Mietobjekt</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Adresse:</span> ${c.propertyAddress}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Einheit:</span> ${c.unitLabel}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Mietpartei(en)</h2>
        <p style="margin:4px 0 10px;">Folgende Person(en) sind laut Mietvertrag Mieter der oben genannten Wohnung:</p>
        ${tenantRows}

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin:20px 0 10px;">Mietverhältnis</h2>
        <p style="margin:4px 0;"><span style="color:#475467;">Mieteinzug:</span> ${c.mietbeginn}</p>
        <p style="margin:4px 0;"><span style="color:#475467;">Mietauszug:</span> ${c.mietende ?? 'noch nicht bekannt'}</p>
        <p style="margin:4px 0 20px;"><span style="color:#475467;">Mietvertrag aktiv:</span> ${c.mietvertragAktiv ? 'Ja' : 'Nein'}</p>

        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#475467;border-bottom:1px solid #d0d5dd;padding-bottom:6px;margin-bottom:10px;">Bescheinigung</h2>
        <div style="border-left:3px solid #224b96;background:#e9edf4;padding:12px 16px;font-size:13px;margin-bottom:24px;">
            Hiermit wird bestätigt, dass die oben genannten Personen derzeit in dem genannten Objekt wohnen und ein gültiger Mietvertrag besteht.
        </div>

        <p style="margin:0 0 40px;">${c.issuePlace}, ${c.issueDate}</p>

        <div style="margin-bottom:8px;">${signatureBlock}</div>
        <div style="border-top:1px solid #101828;width:260px;"></div>
        <div style="display:flex;justify-content:space-between;width:260px;font-size:12px;color:#475467;margin-top:4px;">
            <span>Unterschrift Vermieter</span>
        </div>

        <hr style="margin:32px 0 12px;border:none;border-top:1px solid #d0d5dd;" />
        <p style="font-size:11px;color:#98a2b3;">Mieterbescheinigung · ${c.propertyAddress} · Seite 1 von 1</p>
    `;
}

export default function TenantCertificatePage({ propertyId, unitId }: { propertyId: string; unitId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useRequireAuth();
    const { isLoading, notFound, property, unit, hasMultipleUnits, tenancy, persons, landlord } =
        useUnitDocumentGeneratorData(propertyId, unitId, user?.id);

    const [view, setView] = useState<View>('review');
    const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    // Not persisted (like the signature) — set per generated document, since
    // the app's "landlord" (personal data) has no separate ownership field.
    // null = not yet confirmed — generating always asks first (via the modal
    // below) rather than silently defaulting, even on the ?autoGenerate=1
    // shortcut that used to skip straight to generation.
    const [isLandlordOwner, setIsLandlordOwner] = useState<boolean | null>(null);
    const [ownerModalOpen, setOwnerModalOpen] = useState(false);
    // Whether confirming the modal should immediately continue to generation
    // (opened via "Word-Dokument generieren") or just record the answer
    // (opened via "Ändern" in the review screen).
    const generateAfterOwnerChoice = useRef(false);

    // The "Word-Dokument generieren" shortcut on the tenant-unit page links
    // here with ?autoGenerate=1 to skip the extra click — handleGenerate is defined
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
    const backHref = hasMultipleUnits
        ? `/existing-properties/${propertyId}/tenant-data/${unit.propertyUnitId}`
        : `/existing-properties/${propertyId}/tenant-data`;

    const breadcrumbItems: BreadcrumbItem[] = [
        { label: 'Bestandsobjekte', href: '/existing-properties' },
        { label: `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, href: `/existing-properties/${propertyId}` },
        ...(hasMultipleUnits
            ? [
                { label: ExistingPropertiesUseCases.TenantData, href: `/existing-properties/${propertyId}/tenant-data` },
                { label: unitLabel, href: backHref },
            ]
            : [
                { label: ExistingPropertiesUseCases.TenantData, href: backHref },
            ]),
        { label: 'Mieterbescheinigung generieren' },
    ];

    const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}`.trim() : '';
    const landlordStreet = landlord ? `${landlord.street} ${landlord.houseNumber}` : '';
    const landlordCity = landlord ? `${landlord.postalCode} ${landlord.city}` : '';
    const propertyStreet = `${property.street} ${property.houseNumber}`;
    const propertyCity = `${property.postalCode} ${property.city}`;
    const propertyAddress = `${propertyStreet}, ${propertyCity}`;
    const namedPersons = persons
        .filter((p) => (p.firstName ?? '').trim() !== '' || (p.lastName ?? '').trim() !== '')
        .map((p) => ({
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            isPrimary: p.isPrimary,
            taxId: p.taxId ?? '',
            moveInDate: p.moveInDate ? new Date(p.moveInDate) : undefined,
        }));
    const tenants = namedPersons.map((p) => ({
        name: `${p.firstName} ${p.lastName}`.trim(),
        role: p.isPrimary ? 'Hauptmieter' : 'Weitere Person',
    }));
    const mietbeginn = tenancy?.tenancyStartDate ? formatDeDate(tenancy.tenancyStartDate) : '–';
    const mietende = tenancy?.tenancyEndDate ? formatDeDate(tenancy.tenancyEndDate) : null;
    const mietvertragAktiv = tenancy != null && !tenancy.tenancyEndDate;
    const issuePlace = landlord?.city || property.city;
    const issueDate = formatDeDate(new Date().toISOString());
    const canGenerate = landlord != null && tenants.length > 0 && tenancy != null;
    const documentNumber = `MB-${new Date().getFullYear()}-${String(tenancy?.tenancyId ?? 0).padStart(3, '0')}`;

    const buildContent = (ownerValue: boolean): CertificateContent => ({
        landlordName,
        landlordStreet,
        landlordCity,
        isLandlordOwner: ownerValue,
        propertyAddress,
        unitLabel,
        tenants,
        mietbeginn,
        mietende,
        mietvertragAktiv,
        issuePlace,
        issueDate,
        documentNumber,
        signatureDataUrl,
    });
    // Preview-only fallback — the review/preview tab needs some value to
    // render before the owner question has been answered, but that fallback
    // never reaches the actually-generated document (runGenerate always gets
    // the confirmed value explicitly).
    const content = buildContent(isLandlordOwner ?? true);

    const handleUploadSignature = async (file: File) => {
        setIsUploadingSignature(true);
        try {
            setSignatureDataUrl(await readFileAsDataUrl(file));
        } finally {
            setIsUploadingSignature(false);
        }
    };

    const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const runGenerate = async (ownerValue: boolean) => {
        if (!canGenerate) return;
        setIsGenerating(true);
        try {
            const blob = await buildCertificateDocxBlob(buildContent(ownerValue));
            const fileName = `${documentNumber}.docx`;
            if (tenancy && user) {
                const file = new File([blob], fileName, { type: WORD_MIME });
                await uploadTenancyDocument(user.id, file, {
                    tenancyId: tenancy.tenancyId,
                    tenancyPersonId: null,
                    documentType: 'Mieterbescheinigung',
                });
            }
            // Word blobs aren't browser-renderable, so — unlike the PDF this
            // replaced, which could just be window.open()'d — this has to be
            // saved directly for the user to open in Word.
            downloadBlob(blob, fileName);
        } finally {
            setIsGenerating(false);
        }
    };

    // Always asks for the Eigentümer answer before generating if it hasn't
    // been given yet — including via the ?autoGenerate=1 shortcut, which
    // previously generated immediately with a silent default.
    const handleGenerate = () => {
        if (!canGenerate) return;
        if (isLandlordOwner === null) {
            generateAfterOwnerChoice.current = true;
            setOwnerModalOpen(true);
            return;
        }
        void runGenerate(isLandlordOwner);
    };

    const openOwnerModalToEdit = () => {
        generateAfterOwnerChoice.current = false;
        setOwnerModalOpen(true);
    };

    const handleConfirmOwner = (value: boolean) => {
        setIsLandlordOwner(value);
        setOwnerModalOpen(false);
        if (generateAfterOwnerChoice.current) {
            generateAfterOwnerChoice.current = false;
            void runGenerate(value);
        }
    };

    handleGenerateRef.current = handleGenerate;

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
                                Die Bescheinigung wird automatisch aus den hinterlegten Daten befüllt. Bitte prüfe die Angaben, bevor du das Dokument generierst.
                                Fehlende oder veraltete Daten können in den jeweiligen Bereichen ergänzt werden.
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
                                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Eigentümer der Wohnung</p>
                                            {isLandlordOwner === null ? (
                                                <span className="text-sm text-muted-foreground">Noch nicht angegeben</span>
                                            ) : (
                                                <Pill ok={isLandlordOwner} label={isLandlordOwner ? 'Ja' : 'Nein'} />
                                            )}
                                        </div>
                                        <Button
                                            label={isLandlordOwner === null ? 'Angeben' : 'Ändern'}
                                            variant="outline"
                                            size="sm"
                                            onClick={openOwnerModalToEdit}
                                        />
                                    </div>
                                </DataCard>
                            )}
                        </div>

                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mietobjekt</p>
                            <DataCard icon={Icons.FileText} title="Objektdaten" source="Bestandsobjekt · Objektdaten">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Field label="Straße & Hausnummer" value={propertyStreet} />
                                    <Field label="PLZ & Ort" value={propertyCity} />
                                    <Field label="Einheit" value={unitLabel} />
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
                                    <Field label="Mieteinzug" value={mietbeginn} />
                                    <Field label="Mietauszug" value={mietende ?? 'noch nicht bekannt'} />
                                    <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mietvertrag aktiv</p>
                                        <div className="mt-1"><Pill ok={mietvertragAktiv} label={mietvertragAktiv ? 'Ja' : 'Nein'} /></div>
                                    </div>
                                    <Field label="Ausstellungsort" value={issuePlace || '–'} />
                                    <Field label="Ausstellungsdatum" value={issueDate} />
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
                                            Lade eine Unterschrift als Bilddatei hoch (PNG, JPG). Diese wird automatisch in das generierte Word-Dokument eingefügt.
                                            Alternativ kann die Unterschrift nachträglich im Dokument ergänzt werden.
                                        </p>
                                    )}
                                    <input
                                        id="signature-upload"
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
                            <Pill ok={signatureDataUrl != null} label={signatureDataUrl != null ? 'Unterschrift hinterlegt' : 'Keine Unterschrift hinterlegt'} />
                        </div>
                        {canGenerate ? (
                            <div
                                className="bg-white text-black rounded-md shadow-sm p-8 text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: certificateBodyHtml(content) }}
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
                onPrimary={handleGenerate}
                ghostLabel={BUTTON_DETAILS.Back.label}
                ghostIcon={<BUTTON_DETAILS.Back.icon />}
                primaryLabel={isGenerating ? 'Wird erstellt…' : 'Word-Dokument generieren'}
                primaryIcon={<Icons.FileText className="w-4 h-4" />}
                primaryDisabled={!canGenerate || isGenerating}
            />

            <Modal
                open={ownerModalOpen}
                onClose={() => { setOwnerModalOpen(false); generateAfterOwnerChoice.current = false; }}
                title="Eigentümer der Wohnung"
                subtitle="Ist der Vermieter gleichzeitig Eigentümer der Wohnung?"
                icon={<Icons.Landmark className="w-5 h-5" />}
                footer={
                    <>
                        <Button label="Nein" variant="outline" onClick={() => handleConfirmOwner(false)} />
                        <Button label="Ja" variant="primary" onClick={() => handleConfirmOwner(true)} />
                    </>
                }
            />
        </div>
    );
}
