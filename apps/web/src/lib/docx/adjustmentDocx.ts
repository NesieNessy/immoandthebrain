export type AdjustmentOutcome = 'nachzahlung' | 'erstattung' | 'ausgeglichen';

/** Which case applies, purely from the sign of (Ihr Anteil - Vorauszahlungen):
 *  positive = tenant owes more (Nachzahlung), negative = tenant is owed money
 *  back (Erstattung), zero = the settlement is exactly balanced. */
export function adjustmentOutcomeFor(overUnderCoverage: number): AdjustmentOutcome {
    if (overUnderCoverage > 0) return 'nachzahlung';
    if (overUnderCoverage < 0) return 'erstattung';
    return 'ausgeglichen';
}

export interface AdjustmentDocxContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    propertyAddress: string;
    unitLabel: string;
    tenantNames: string[];
    issuePlace: string;
    issueDate: string;
    settlementYear: number;
    periodStart: string;
    periodEnd: string;
    totalActualCosts: number;
    unitActualShare: number;
    annualPrepayment: number;
    /** unitActualShare - annualPrepayment. Positive = Nachzahlung, negative = Erstattung. */
    overUnderCoverage: number;
    currentMonthlyPrepayment: number;
    newMonthlyPrepayment: number | null;
    /** ISO date the new monthly prepayment takes effect. */
    newPrepaymentEffectiveDate: string;
}

const GREY = '475467';
const BORDER_GREY = 'D0D5DD';
const PRIMARY = '224B96';
const WARNING = 'B54708';
const WARNING_BG = 'FFFAEB';
const SUCCESS = '027A48';
const SUCCESS_BG = 'ECFDF3';

function euro(value: number): string {
    return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('de-DE');
}

/**
 * Builds the "Anpassung der Nebenkostenvorauszahlung" tenant letter as a real
 * (editable) Word document — same dynamic-import-of-docx pattern and reasons
 * as certificateDocx.ts (the `docx` package isn't SSR/RSC-bundle-safe). The
 * wording branches on whether the settlement resulted in a Nachzahlung
 * (tenant owes), an Erstattung (tenant is owed money back), or is exactly
 * balanced — the three are legally and tonally distinct, not just a sign
 * flip on the same sentence.
 */
export async function buildAdjustmentDocxBlob(c: AdjustmentDocxContent): Promise<Blob> {
    const {
        AlignmentType, BorderStyle, Document, HeadingLevel, Packer,
        Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
    } = await import('docx');

    const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const outcome = adjustmentOutcomeFor(c.overUnderCoverage);

    const sectionHeading = (text: string) => new Paragraph({
        spacing: { before: 240, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY } },
        children: [
            new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: GREY, characterSpacing: 20 }),
        ],
    });

    const field = (label: string, value: string) => new Paragraph({
        spacing: { after: 80 },
        children: [
            new TextRun({ text: `${label}: `, color: GREY }),
            new TextRun({ text: value }),
        ],
    });

    const outcomeColor = outcome === 'nachzahlung' ? WARNING : outcome === 'erstattung' ? SUCCESS : GREY;
    const outcomeBg = outcome === 'nachzahlung' ? WARNING_BG : outcome === 'erstattung' ? SUCCESS_BG : 'F2F4F7';
    const outcomeAmount = Math.abs(c.overUnderCoverage);
    const outcomeHeading = outcome === 'nachzahlung'
        ? 'Ergebnis: Nachzahlung'
        : outcome === 'erstattung'
            ? 'Ergebnis: Erstattung'
            : 'Ergebnis: Ausgeglichen';
    const outcomeBody = outcome === 'nachzahlung'
        ? `Aus der Abrechnung ergibt sich für Sie eine Nachzahlung in Höhe von ${euro(outcomeAmount)}. Wir bitten Sie, diesen Betrag innerhalb von 30 Tagen nach Erhalt dieses Schreibens zu überweisen.`
        : outcome === 'erstattung'
            ? `Aus der Abrechnung ergibt sich zu Ihren Gunsten ein Guthaben in Höhe von ${euro(outcomeAmount)}. Der Betrag wird Ihnen innerhalb von 30 Tagen auf das uns bekannte Konto erstattet bzw. mit der nächsten Mietzahlung verrechnet.`
            : 'Ihre geleisteten Vorauszahlungen entsprechen genau Ihrem Kostenanteil. Es ergibt sich weder eine Nachzahlung noch eine Erstattung.';

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
                        insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    width: { size: 60, type: WidthType.PERCENTAGE },
                                    children: [
                                        new Paragraph({ children: [new TextRun({ text: c.landlordName, bold: true })] }),
                                        new Paragraph({ children: [new TextRun({ text: c.landlordStreet })] }),
                                        new Paragraph({ children: [new TextRun({ text: c.landlordCity })] }),
                                    ],
                                }),
                                new TableCell({
                                    width: { size: 40, type: WidthType.PERCENTAGE },
                                    children: c.tenantNames.map((name) => new Paragraph({
                                        alignment: AlignmentType.RIGHT,
                                        children: [new TextRun({ text: name, color: GREY, size: 20 })],
                                    })),
                                }),
                            ],
                        }),
                    ],
                }),

                new Paragraph({ spacing: { before: 200, after: 40 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${c.issuePlace}, den ${c.issueDate}`, color: GREY, size: 20 })] }),

                new Paragraph({
                    spacing: { before: 300, after: 60 },
                    heading: HeadingLevel.TITLE,
                    children: [new TextRun({ text: `Anpassung der Nebenkostenvorauszahlung ${c.settlementYear}`, bold: true, size: 32 })],
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    children: [new TextRun({ text: `Sehr geehrte${c.tenantNames.length > 1 ? '' : 'r'} ${c.tenantNames.join(' / ')},` })],
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    children: [new TextRun({
                        text: `anbei erhalten Sie das Ergebnis der Nebenkostenabrechnung für den Zeitraum ${formatDate(c.periodStart)} bis ${formatDate(c.periodEnd)} sowie die sich daraus ergebende Anpassung Ihrer monatlichen Nebenkostenvorauszahlung.`,
                    })],
                }),

                sectionHeading('Mietobjekt'),
                field('Adresse', c.propertyAddress),
                field('Einheit', c.unitLabel),

                sectionHeading('Abrechnungsergebnis'),
                field('Gesamtkosten Objekt (umlagefähig)', euro(c.totalActualCosts)),
                field('Ihr Kostenanteil', euro(c.unitActualShare)),
                field('Ihre geleisteten Vorauszahlungen', euro(c.annualPrepayment)),

                new Paragraph({
                    shading: { type: ShadingType.CLEAR, fill: outcomeBg },
                    border: { left: { style: BorderStyle.SINGLE, size: 24, color: outcomeColor } },
                    spacing: { before: 100, after: 300 },
                    children: [
                        new TextRun({ text: `${outcomeHeading}\n`, bold: true, color: outcomeColor }),
                        new TextRun({ text: outcomeBody, color: outcomeColor }),
                    ],
                }),

                sectionHeading('Neue Nebenkostenvorauszahlung'),
                field('Bisherige monatliche Vorauszahlung', euro(c.currentMonthlyPrepayment)),
                field(`Neue monatliche Vorauszahlung ab ${formatDate(c.newPrepaymentEffectiveDate)}`, c.newMonthlyPrepayment != null ? euro(c.newMonthlyPrepayment) : '–'),
                new Paragraph({
                    spacing: { before: 100, after: 300 },
                    children: [new TextRun({
                        text: 'Grundlage für die neue Vorauszahlung ist der Wirtschaftsplan für das Folgejahr gemäß § 560 BGB. Ihre Nettokaltmiete bleibt hiervon unberührt.',
                        color: GREY,
                        size: 18,
                    })],
                }),

                new Paragraph({ spacing: { before: 200, after: 500 }, children: [new TextRun({ text: 'Für Rückfragen stehen wir Ihnen gerne zur Verfügung.' })] }),
                new Paragraph({ spacing: { after: 500 }, children: [new TextRun({ text: 'Mit freundlichen Grüßen' })] }),
                new Paragraph({
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '101828' } },
                    spacing: { after: 40 },
                    children: [new TextRun({ text: ' '.repeat(60) })],
                }),
                new Paragraph({ children: [new TextRun({ text: c.landlordName, size: 18, color: GREY })] }),

                new Paragraph({
                    spacing: { before: 500 },
                    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY } },
                    children: [new TextRun({ text: `Anpassung Nebenkostenvorauszahlung · ${c.propertyAddress} · Seite 1 von 1`, size: 16, color: PRIMARY })],
                }),
            ],
        }],
    });

    return Packer.toBlob(doc);
}
