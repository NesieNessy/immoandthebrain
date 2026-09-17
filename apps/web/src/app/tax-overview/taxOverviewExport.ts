import { deCurrencyFormatter } from '@/lib/utils';
import type { TaxOverviewPropertyRow } from './useTaxOverviewData';

function euro(value: number): string {
    return `${deCurrencyFormatter.format(value)} €`;
}

/** Full HTML document string — passed directly to htmlToPdfBlob, matching
 *  the convention used by the other document generators in this app
 *  (e.g. serviceChargeStatementLetter.ts). */
export function buildTaxOverviewReportHtml(year: number, properties: TaxOverviewPropertyRow[]): string {
    const grandTotal = properties.reduce((sum, p) => sum + p.totalAmount, 0);

    const propertySections = properties.map((property) => `
        <h2>${property.label}</h2>
        <table>
            <thead><tr><th>Kategorie</th><th>Betrag</th><th>Belege</th></tr></thead>
            <tbody>
                ${property.categories.map((c) => `
                    <tr>
                        <td>${c.label}</td>
                        <td>${c.documents.length > 0 ? euro(c.amount) : '–'}</td>
                        <td>${c.documents.length > 0 ? c.documents.length : 'Beleg fehlt'}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr><td>Gesamtkosten Objekt ${year}</td><td>${euro(property.totalAmount)}</td><td></td></tr>
            </tfoot>
        </table>
    `).join('');

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Steuerübersicht ${year}</title>
<style>
    body { font-family: Arial, Helvetica, sans-serif; color: #101828; max-width: 760px; margin: 48px auto; line-height: 1.5; }
    h1 { font-size: 20px; margin: 0 0 24px; }
    h2 { font-size: 14px; margin: 28px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
    th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid #d0d5dd; }
    th:first-child, td:first-child { text-align: left; }
    thead th { border-bottom: 1px solid #98a2b3; color: #475467; font-weight: 600; }
    tfoot td { font-weight: 700; border-top: 1px solid #98a2b3; }
    .grand-total { margin-top: 32px; padding-top: 16px; border-top: 2px solid #101828; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; }
</style>
</head>
<body>
    <h1>Steuerübersicht ${year}</h1>
    ${propertySections}
    <div class="grand-total">
        <span>Gesamtkosten steuerlich geltend zu machen — Steuerjahr ${year}</span>
        <span>${euro(grandTotal)}</span>
    </div>
</body>
</html>`;
}
