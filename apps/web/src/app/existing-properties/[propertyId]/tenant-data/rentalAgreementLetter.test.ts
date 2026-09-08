import { describe, expect, it } from 'vitest';
import { agreementBodyHtml, type AgreementContent } from './rentalAgreementLetter';

const baseContent: AgreementContent = {
    landlordName: 'Erika Musterfrau',
    landlordStreet: 'Musterweg 1',
    landlordCity: '80331 München',
    propertyAddress: 'Beispielstraße 123, 80801 München',
    unitLabel: 'Whg. 1 (EG links)',
    livingArea: '72.5 m²',
    numberOfRooms: '3',
    tenants: [{ name: 'Hans Müller', role: 'Hauptmieter' }],
    mietbeginn: '01.06.2018',
    befristet: false,
    mietende: '–',
    coldRent: '1.150 €',
    miscRent: '380 €',
    parkingRent: null,
    warmRent: '1.530 €',
    deposit: '2.300 €',
    depositRatio: '2',
    nextRentAdjustmentDate: null,
    nextRentAdjustmentAmount: null,
    renovationAdjustmentPlanned: null,
    petsAllowed: null,
    redecorationClause: null,
    subletAllowed: null,
    additionalTerms: null,
    issuePlace: 'München',
    issueDate: '17.08.2026',
    documentNumber: 'MV-2026-013',
    signatureDataUrl: null,
};

describe('agreementBodyHtml', () => {
    it('includes the landlord, property/unit address, living area and room count', () => {
        const html = agreementBodyHtml(baseContent);
        expect(html).toContain('Erika Musterfrau');
        expect(html).toContain('Beispielstraße 123, 80801 München');
        expect(html).toContain('ca. 72.5 m²');
        expect(html).toContain('3');
    });

    it('slash-joins multiple tenant names and lists each with their role', () => {
        const html = agreementBodyHtml({
            ...baseContent,
            tenants: [
                { name: 'Hans Müller', role: 'Hauptmieter' },
                { name: 'Maria Müller', role: 'Weitere Person' },
            ],
        });
        expect(html).toContain('Hans Müller / Maria Müller');
        expect(html).toContain('Weitere Person');
    });

    it('labels an unbefristetes Mietverhältnis as unlimited', () => {
        const html = agreementBodyHtml({ ...baseContent, befristet: false });
        expect(html).toContain('UNBEFRISTETES MIETVERHÄLTNIS');
        expect(html).toContain('läuft auf unbestimmte Zeit');
    });

    it('labels a befristetes Mietverhältnis with its end date', () => {
        const html = agreementBodyHtml({ ...baseContent, befristet: true, mietende: '31.12.2026' });
        expect(html).toContain('und endet am 31.12.2026');
    });

    it('omits the Stellplatz row when there is no parking rent', () => {
        const html = agreementBodyHtml({ ...baseContent, parkingRent: null });
        expect(html).not.toContain('Stellplatz');
    });

    it('includes the Stellplatz row when parking rent is set', () => {
        const html = agreementBodyHtml({ ...baseContent, parkingRent: '75 €' });
        expect(html).toContain('Stellplatz');
        expect(html).toContain('75 €');
    });

    it('includes the deposit ratio in the Kaution note when present', () => {
        const html = agreementBodyHtml({ ...baseContent, depositRatio: '2' });
        expect(html).toContain('entspricht 2 Nettokaltmieten');
    });

    it('omits the deposit ratio parenthetical when null', () => {
        const html = agreementBodyHtml({ ...baseContent, depositRatio: null });
        expect(html).not.toContain('Nettokaltmieten');
    });

    it('notes no planned Mietanpassung when there is no next adjustment date', () => {
        const html = agreementBodyHtml({ ...baseContent, nextRentAdjustmentDate: null });
        expect(html).toContain('derzeit keine Mietanpassung vorgesehen');
    });

    it('describes an upcoming Mietanpassung with its date and amount', () => {
        const html = agreementBodyHtml({ ...baseContent, nextRentAdjustmentDate: '01.01.2027', nextRentAdjustmentAmount: '50 €' });
        expect(html).toContain('Eine Mieterhöhung ist zum 01.01.2027');
        expect(html).toContain('in Höhe von 50 €');
    });

    it('adds the § 559 renovation note only when a renovation adjustment is planned', () => {
        const withRenovation = agreementBodyHtml({ ...baseContent, nextRentAdjustmentDate: '01.01.2027', renovationAdjustmentPlanned: true });
        expect(withRenovation).toContain('§ 559 BGB');

        const without = agreementBodyHtml({ ...baseContent, nextRentAdjustmentDate: '01.01.2027', renovationAdjustmentPlanned: false });
        expect(without).not.toContain('§ 559 BGB');
    });

    it('falls back to "Nicht geregelt" for unset clause fields', () => {
        const html = agreementBodyHtml({ ...baseContent, petsAllowed: null, redecorationClause: null, subletAllowed: null });
        expect(html).toContain('<span>Nicht geregelt</span>');
    });

    it('shows the chosen clause values when set', () => {
        const html = agreementBodyHtml({
            ...baseContent,
            petsAllowed: 'Erlaubt',
            redecorationClause: 'Mieter trägt Kosten (üblich)',
            subletAllowed: 'Nach Zustimmung',
        });
        expect(html).toContain('Erlaubt');
        expect(html).toContain('Mieter trägt Kosten (üblich)');
        expect(html).toContain('Nach Zustimmung');
    });

    it('includes the additional terms note only when set', () => {
        const withTerms = agreementBodyHtml({ ...baseContent, additionalTerms: 'Sonderregelung XYZ' });
        expect(withTerms).toContain('Sonderregelung XYZ');

        const without = agreementBodyHtml({ ...baseContent, additionalTerms: null });
        expect(without).not.toContain('Sonderregelung XYZ');
    });

    it('shows a placeholder instead of an image when there is no signature', () => {
        const html = agreementBodyHtml({ ...baseContent, signatureDataUrl: null });
        expect(html).not.toContain('<img');
    });

    it('embeds the signature image when one is set', () => {
        const html = agreementBodyHtml({ ...baseContent, signatureDataUrl: 'data:image/png;base64,abc' });
        expect(html).toContain('<img src="data:image/png;base64,abc"');
    });
});
