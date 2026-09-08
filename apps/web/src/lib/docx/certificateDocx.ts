export interface CertificateDocxContent {
    landlordName: string;
    landlordStreet: string;
    landlordCity: string;
    /** Whether the Vermieter is also the Eigentümer of the unit — shown as a
     *  Ja/Nein line, matching the Ja/Nein checkbox on the reference
     *  Vermieterbescheinigung form. */
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

const GREY = '475467';
const LIGHT_GREY = '98A2B3';
const BORDER_GREY = 'D0D5DD';
const PRIMARY = '224B96';
const PRIMARY_BG = 'E9EDF4';

/** Splits a `data:image/png;base64,....` URL into what ImageRun needs. */
export function parseImageDataUrl(dataUrl: string): { type: 'png' | 'jpg'; base64: string } | null {
    const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    return { type: match[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png', base64: match[2] };
}

/**
 * Builds the Mieterbescheinigung as a real (editable) Word document instead
 * of a rasterized PDF — same content the HTML preview shows, laid out with
 * docx's Paragraph/Table primitives so the output is genuinely a .docx.
 *
 * `docx` is imported dynamically (not at module scope) — statically importing
 * it here made it part of the server bundle too, and its class-inheritance
 * chain (ImageRun extends XmlComponent, etc.) doesn't survive Next's SSR/RSC
 * bundling of a browser-only library, throwing "super() is only valid in
 * derived class constructors" the moment this module loaded. htmlToPdf.ts's
 * jspdf/html2canvas imports use the same dynamic pattern for the same reason.
 */
export async function buildCertificateDocxBlob(c: CertificateDocxContent): Promise<Blob> {
    const {
        AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer,
        Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
    } = await import('docx');

    const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

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

    const tenantParagraphs = c.tenants.map((t) => new Paragraph({
        spacing: { after: 80 },
        shading: { type: ShadingType.CLEAR, fill: 'F2F4F7' },
        children: [
            new TextRun({ text: t.name, bold: true }),
            new TextRun({ text: `   —   ${t.role}`, color: GREY, size: 20 }),
        ],
    }));

    const parsedSignature = c.signatureDataUrl ? parseImageDataUrl(c.signatureDataUrl) : null;
    const signatureParagraph = parsedSignature
        ? new Paragraph({
            spacing: { after: 80 },
            children: [
                new ImageRun({
                    type: parsedSignature.type,
                    data: parsedSignature.base64,
                    transformation: { width: 180, height: 60 },
                }),
            ],
        })
        : new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: '[Unterschrift nicht hinterlegt]', italics: true, color: LIGHT_GREY })],
        });

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
                                    children: [
                                        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Ausgestellt am: ${c.issueDate}`, color: GREY, size: 18 })] }),
                                        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Ausstellungsort: ${c.issuePlace}`, color: GREY, size: 18 })] }),
                                        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Dokument-Nr.: ${c.documentNumber}`, color: GREY, size: 18 })] }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                }),

                new Paragraph({
                    spacing: { before: 300, after: 60 },
                    alignment: AlignmentType.CENTER,
                    heading: HeadingLevel.TITLE,
                    children: [new TextRun({ text: 'Mieterbescheinigung', bold: true, size: 40 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                    children: [new TextRun({ text: 'Bestätigung eines bestehenden Mietverhältnisses', color: GREY, size: 20 })],
                }),

                sectionHeading('Vermieter'),
                field('Name', c.landlordName),
                field('Adresse', `${c.landlordStreet}, ${c.landlordCity}`),
                field('Eigentümer der Wohnung', c.isLandlordOwner ? 'Ja' : 'Nein'),

                sectionHeading('Mietobjekt'),
                field('Adresse', c.propertyAddress),
                field('Einheit', c.unitLabel),

                sectionHeading('Mietpartei(en)'),
                new Paragraph({
                    spacing: { after: 100 },
                    children: [new TextRun({ text: 'Folgende Person(en) sind laut Mietvertrag Mieter der oben genannten Wohnung:' })],
                }),
                ...tenantParagraphs,

                sectionHeading('Mietverhältnis'),
                field('Mieteinzug', c.mietbeginn),
                field('Mietauszug', c.mietende ?? 'noch nicht bekannt'),
                field('Mietvertrag aktiv', c.mietvertragAktiv ? 'Ja' : 'Nein'),

                sectionHeading('Bescheinigung'),
                new Paragraph({
                    shading: { type: ShadingType.CLEAR, fill: PRIMARY_BG },
                    border: { left: { style: BorderStyle.SINGLE, size: 24, color: PRIMARY } },
                    spacing: { before: 100, after: 400 },
                    children: [new TextRun({
                        text: 'Hiermit wird bestätigt, dass die oben genannten Personen derzeit in dem genannten Objekt wohnen und ein gültiger Mietvertrag besteht.',
                    })],
                }),

                new Paragraph({ spacing: { after: 500 }, children: [new TextRun({ text: `${c.issuePlace}, ${c.issueDate}` })] }),
                signatureParagraph,
                new Paragraph({
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '101828' } },
                    spacing: { after: 40 },
                    children: [new TextRun({ text: ' '.repeat(60) })],
                }),
                new Paragraph({ children: [new TextRun({ text: 'Unterschrift Vermieter', size: 18, color: GREY })] }),

                new Paragraph({
                    spacing: { before: 500 },
                    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_GREY } },
                    children: [new TextRun({ text: `Mieterbescheinigung · ${c.propertyAddress} · Seite 1 von 1`, size: 16, color: LIGHT_GREY })],
                }),
            ],
        }],
    });

    return Packer.toBlob(doc);
}
