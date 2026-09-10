import type { RentalTermsPetsAllowed, RentalTermsRedecorationClause, RentalTermsSubletAllowed } from '@immoandthebrain/types';

export type TriState = '' | 'true' | 'false';

export const PETS_OPTIONS: { value: RentalTermsPetsAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Vereinbarung', label: 'Nach Vereinbarung' },
];

export const REDECORATION_OPTIONS: { value: RentalTermsRedecorationClause | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Mieter trägt Kosten (üblich)', label: 'Mieter trägt Kosten (üblich)' },
    { value: 'Vermieter trägt Kosten', label: 'Vermieter trägt Kosten' },
    { value: 'Individuelle Regelung', label: 'Individuelle Regelung' },
];

export const SUBLET_OPTIONS: { value: RentalTermsSubletAllowed | ''; label: string }[] = [
    { value: '', label: 'Bitte wählen...' },
    { value: 'Erlaubt', label: 'Erlaubt' },
    { value: 'Nicht erlaubt', label: 'Nicht erlaubt' },
    { value: 'Nach Zustimmung', label: 'Nach Zustimmung' },
];

export const RENOVATION_ADJUSTMENT_OPTIONS: { value: TriState; label: string }[] = [
    { value: '', label: 'Nicht erfasst' },
    { value: 'true', label: 'Geplant' },
    { value: 'false', label: 'Nicht geplant' },
];

export interface AgreementContent {
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

export function agreementBodyHtml(c: AgreementContent): string {
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
