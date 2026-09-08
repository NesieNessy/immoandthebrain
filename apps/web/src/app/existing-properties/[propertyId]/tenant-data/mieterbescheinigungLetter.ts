export function isPersonComplete(person: { firstName: string; lastName: string; isPrimary: boolean; taxId: string; moveInDate: Date | undefined }): boolean {
    if (person.firstName.trim() === '' || person.lastName.trim() === '') return false;
    if (person.isPrimary) return person.taxId.trim() !== '' && person.moveInDate != null;
    return true;
}

export interface CertificateContent {
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

export function certificateBodyHtml(c: CertificateContent): string {
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
