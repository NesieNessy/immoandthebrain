import { deCurrencyFormatter, formatDeDate } from '@/lib/utils';
import { adjustmentOutcomeFor } from '@/lib/docx/adjustmentDocx';

interface LetterParty {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    propertyAddress: string;
    unitLabel: string;
    tenantNames: string[];
    issuePlace: string;
    issueDate: string;
}

export interface AdjustmentLetterParams extends LetterParty {
    settlementYear: number;
    periodStart: string;
    periodEnd: string;
    totalActualCosts: number;
    unitActualShare: number;
    annualPrepayment: number;
    overUnderCoverage: number;
    currentMonthlyPrepayment: number;
    newMonthlyPrepayment: number | null;
    newPrepaymentEffectiveDate: string;
}

function euro(value: number | null | undefined): string {
    return value != null ? `${deCurrencyFormatter.format(value)} €` : '–';
}

function letterFrame(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
    body { font-family: Arial, Helvetica, sans-serif; color: #101828; max-width: 760px; margin: 48px auto; line-height: 1.5; }
    h1 { font-size: 18px; margin: 32px 0 16px; }
    h2 { font-size: 14px; margin: 24px 0 8px; }
    .outcome { margin: 16px 0; padding: 12px 16px; border-left: 4px solid; }
    .outcome.nachzahlung { border-color: #b54708; background: #fffaeb; color: #b54708; }
    .outcome.erstattung { border-color: #027a48; background: #ecfdf3; color: #027a48; }
    .outcome.ausgeglichen { border-color: #98a2b3; background: #f2f4f7; color: #475467; }
    .outcome strong { display: block; margin-bottom: 4px; }
    .row { margin: 8px 0; display: flex; justify-content: space-between; }
    .muted { color: #475467; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * HTML approximation of the Anpassungsschreiben, for the "Vorschau" tab only
 * — the real deliverable is the .docx from adjustmentDocx.ts (Word blobs
 * aren't browser-renderable), so this exists purely to preview the same
 * content and wording before generating.
 */
export function adjustmentLetterHtml(p: AdjustmentLetterParams): string {
    const outcome = adjustmentOutcomeFor(p.overUnderCoverage);
    const outcomeAmount = Math.abs(p.overUnderCoverage);
    const outcomeHeading = outcome === 'nachzahlung' ? 'Ergebnis: Nachzahlung' : outcome === 'erstattung' ? 'Ergebnis: Erstattung' : 'Ergebnis: Ausgeglichen';
    const outcomeBody = outcome === 'nachzahlung'
        ? `Aus der Abrechnung ergibt sich für Sie eine Nachzahlung in Höhe von ${euro(outcomeAmount)}. Wir bitten Sie, diesen Betrag innerhalb von 30 Tagen nach Erhalt dieses Schreibens zu überweisen.`
        : outcome === 'erstattung'
            ? `Aus der Abrechnung ergibt sich zu Ihren Gunsten ein Guthaben in Höhe von ${euro(outcomeAmount)}. Der Betrag wird Ihnen innerhalb von 30 Tagen auf das uns bekannte Konto erstattet bzw. mit der nächsten Mietzahlung verrechnet.`
            : 'Ihre geleisteten Vorauszahlungen entsprechen genau Ihrem Kostenanteil. Es ergibt sich weder eine Nachzahlung noch eine Erstattung.';

    const body = `
        <div>
            <strong>${p.landlordName}</strong><br/>
            ${p.landlordStreet}<br/>
            ${p.landlordCity}
        </div>
        <div style="margin-top:24px;">
            ${p.tenantNames.map((name) => `${name}<br/>`).join('')}
            ${p.propertyAddress}${p.unitLabel ? ` · ${p.unitLabel}` : ''}
        </div>
        <p style="margin-top:24px;text-align:right;">${p.issuePlace}, den ${p.issueDate}</p>

        <h1>Anpassung der Nebenkostenvorauszahlung ${p.settlementYear}</h1>
        <p>Sehr geehrte${p.tenantNames.length > 1 ? '' : 'r'} ${p.tenantNames.join(' / ')},</p>
        <p>
            anbei erhalten Sie das Ergebnis der Nebenkostenabrechnung für den Zeitraum
            <strong>${formatDeDate(p.periodStart)}</strong> bis <strong>${formatDeDate(p.periodEnd)}</strong>
            sowie die sich daraus ergebende Anpassung Ihrer monatlichen Nebenkostenvorauszahlung.
        </p>

        <h2>Mietobjekt</h2>
        <div class="row"><span>Adresse</span><strong>${p.propertyAddress}</strong></div>
        <div class="row"><span>Einheit</span><strong>${p.unitLabel || '–'}</strong></div>

        <h2>Abrechnungsergebnis</h2>
        <div class="row"><span>Gesamtkosten Objekt (umlagefähig)</span><strong>${euro(p.totalActualCosts)}</strong></div>
        <div class="row"><span>Ihr Kostenanteil</span><strong>${euro(p.unitActualShare)}</strong></div>
        <div class="row"><span>Ihre geleisteten Vorauszahlungen</span><strong>${euro(p.annualPrepayment)}</strong></div>

        <div class="outcome ${outcome}">
            <strong>${outcomeHeading}</strong>
            ${outcomeBody}
        </div>

        <h2>Neue Nebenkostenvorauszahlung</h2>
        <div class="row"><span>Bisherige monatliche Vorauszahlung</span><strong>${euro(p.currentMonthlyPrepayment)}</strong></div>
        <div class="row"><span>Neue monatliche Vorauszahlung ab ${formatDeDate(p.newPrepaymentEffectiveDate)}</span><strong>${euro(p.newMonthlyPrepayment)}</strong></div>
        <p class="muted">
            Grundlage für die neue Vorauszahlung ist der Wirtschaftsplan für das Folgejahr gemäß § 560 BGB.
            Ihre Nettokaltmiete bleibt hiervon unberührt.
        </p>

        <p style="margin-top:48px;">Mit freundlichen Grüßen</p>
        <div style="height:40px;"></div>
        <p>${p.landlordName}</p>
    `;
    return letterFrame(`Anpassung der Nebenkostenvorauszahlung ${p.settlementYear}`, body);
}
