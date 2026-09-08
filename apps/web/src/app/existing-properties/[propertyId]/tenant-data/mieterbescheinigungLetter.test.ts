import { describe, expect, it } from 'vitest';
import { certificateBodyHtml, isPersonComplete, type CertificateContent } from './mieterbescheinigungLetter';

const baseContent: CertificateContent = {
    landlordName: 'Erika Musterfrau',
    landlordStreet: 'Musterweg 1',
    landlordCity: '80331 München',
    isLandlordOwner: true,
    propertyAddress: 'Beispielstraße 123, 80801 München',
    unitLabel: 'Whg. 1 (EG links)',
    tenants: [{ name: 'Hans Müller', role: 'Hauptmieter' }],
    mietbeginn: '01.01.2020',
    mietende: null,
    mietvertragAktiv: true,
    issuePlace: 'München',
    issueDate: '17.08.2026',
    documentNumber: 'MB-2026-013',
    signatureDataUrl: null,
};

describe('certificateBodyHtml', () => {
    it('includes the landlord and property/unit address', () => {
        const html = certificateBodyHtml(baseContent);
        expect(html).toContain('Erika Musterfrau');
        expect(html).toContain('Beispielstraße 123, 80801 München');
        expect(html).toContain('Whg. 1 (EG links)');
    });

    it('renders one row per tenant with their role', () => {
        const html = certificateBodyHtml({
            ...baseContent,
            tenants: [
                { name: 'Hans Müller', role: 'Hauptmieter' },
                { name: 'Maria Müller', role: 'Weitere Person' },
            ],
        });
        expect(html).toContain('Hans Müller');
        expect(html).toContain('Hauptmieter');
        expect(html).toContain('Maria Müller');
        expect(html).toContain('Weitere Person');
    });

    it('shows "Ja" for the Eigentümer line when the landlord is the owner', () => {
        const html = certificateBodyHtml({ ...baseContent, isLandlordOwner: true });
        expect(html).toContain('Eigentümer der Wohnung:</span> Ja');
    });

    it('shows "Nein" for the Eigentümer line when the landlord is not the owner', () => {
        const html = certificateBodyHtml({ ...baseContent, isLandlordOwner: false });
        expect(html).toContain('Eigentümer der Wohnung:</span> Nein');
    });

    it('falls back to "noch nicht bekannt" when there is no move-out date', () => {
        const html = certificateBodyHtml({ ...baseContent, mietende: null });
        expect(html).toContain('Mietauszug:</span> noch nicht bekannt');
    });

    it('shows the move-out date when one is set', () => {
        const html = certificateBodyHtml({ ...baseContent, mietende: '31.12.2026' });
        expect(html).toContain('Mietauszug:</span> 31.12.2026');
    });

    it('shows a placeholder instead of an image when there is no signature', () => {
        const html = certificateBodyHtml({ ...baseContent, signatureDataUrl: null });
        expect(html).toContain('[Unterschrift nicht hinterlegt]');
        expect(html).not.toContain('<img');
    });

    it('embeds the signature image when one is set', () => {
        const html = certificateBodyHtml({ ...baseContent, signatureDataUrl: 'data:image/png;base64,abc' });
        expect(html).toContain('<img src="data:image/png;base64,abc"');
        expect(html).not.toContain('[Unterschrift nicht hinterlegt]');
    });

    it('reflects an inactive Mietvertrag as "Nein"', () => {
        const html = certificateBodyHtml({ ...baseContent, mietvertragAktiv: false });
        expect(html).toContain('Mietvertrag aktiv:</span> Nein');
    });
});

describe('isPersonComplete', () => {
    const base = { firstName: 'Hans', lastName: 'Müller', isPrimary: false, taxId: '', moveInDate: undefined };

    it('is false when the first name is missing', () => {
        expect(isPersonComplete({ ...base, firstName: '' })).toBe(false);
    });

    it('is false when the last name is missing', () => {
        expect(isPersonComplete({ ...base, lastName: '' })).toBe(false);
    });

    it('is true for a non-primary person with just a name', () => {
        expect(isPersonComplete({ ...base, isPrimary: false })).toBe(true);
    });

    it('requires a tax ID and move-in date for the primary tenant', () => {
        expect(isPersonComplete({ ...base, isPrimary: true, taxId: '', moveInDate: undefined })).toBe(false);
        expect(isPersonComplete({ ...base, isPrimary: true, taxId: '12 345 678 901', moveInDate: undefined })).toBe(false);
        expect(isPersonComplete({ ...base, isPrimary: true, taxId: '12 345 678 901', moveInDate: new Date(2026, 0, 1) })).toBe(true);
    });
});
