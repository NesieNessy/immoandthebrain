import { Client } from 'pg';
import { expect, test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Steuerübersicht (/tax-overview) — the cross-property Steuerjahr overview
 * reachable from the dashboard. Verifies: a property that has never had its
 * own Steuerunterlagen page opened still gets its default categories seeded
 * here (ensureDefaultTaxExpenseCategories runs for every active property on
 * load, not just on that property's own page); property cards are collapsed
 * by default; an expanded card's category rows show "Hochladen"/"Beleg
 * fehlt" for anything without a receipt yet and "Vorschau" once one exists;
 * and the "ZIP herunterladen"/"Alle exportieren" actions were replaced with
 * a roadmap teaser rather than half-built features.
 *
 * Category labels are plain table text here (unlike the per-property
 * Steuerunterlagen page, where they're editable TextFields) — so, unlike
 * TaxDocuments.spec.ts, rows can be located directly by label text.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Steuerübersicht-Straße';
const POSTAL_CODE = '00496';
const CITY = 'E2E Steuerübersicht-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

// A minimal valid 1x1 PNG, for the "Beleg hinzufügen" file input.
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let testFilePath: string;

let propertyId: number;

test.beforeAll(async () => {
    testFilePath = path.join(os.tmpdir(), `e2e-tax-overview-beleg-${Date.now()}.png`);
    fs.writeFileSync(testFilePath, Buffer.from(TEST_PNG_BASE64, 'base64'));

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);

        // Deliberately no tax_expense_category rows here — the point of this
        // spec is that the overview seeds them itself, without the
        // per-property Steuerunterlagen page ever having been opened.
        const propertyResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 1)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET, CITY, POSTAL_CODE],
        );
        propertyId = propertyResult.rows[0].property_id as number;
        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2) VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 60)`,
            [propertyId],
        );
    } finally {
        await client.end();
    }
});

test.afterAll(async () => {
    fs.rmSync(testFilePath, { force: true });
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        // ON DELETE CASCADE takes property_unit/tax_expense_category/tax_expense_document along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test('seeds default categories for a never-visited property, keeps property cards collapsed by default, and shows the export teaser', async ({ page }) => {
    await page.goto('/tax-overview');

    const propertyCard = page.getByRole('button', { name: new RegExp(STREET) });
    await expect(propertyCard).toBeVisible();

    // Collapsed by default: no property's category table is rendered yet,
    // anywhere on the page.
    await expect(page.getByText('Fahrtkosten')).not.toBeVisible();

    await propertyCard.click();
    await expect(page.getByText('Fahrtkosten')).toBeVisible();
    await expect(page.getByText('Sonderumlagen')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT label FROM tax_expense_category WHERE property_id = $1 ORDER BY sort_order`,
            [propertyId],
        );
        expect(rows.map((r) => r.label)).toEqual(['Fahrtkosten', 'Übernachtungskosten', 'Mahlzeiten', 'Spesen', 'Reparaturen', 'Sonderumlagen']);
    } finally {
        await client.end();
    }

    // Replaced by the roadmap teaser, not half-built.
    await expect(page.getByRole('button', { name: 'Alle exportieren' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ZIP herunterladen' })).toHaveCount(0);
    await expect(page.getByText('Entwicklungsstufe 1:')).toBeVisible();
    await expect(page.getByText('Entwicklungsstufe 2:')).toBeVisible();
    await expect(page.getByText('Integration mit WISO.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Steuerbericht generieren' })).toBeVisible();
});

test("uploading a receipt from the overview's own row updates that category from Beleg fehlt to Vorschau", async ({ page }) => {
    await page.goto('/tax-overview');
    const propertyCard = page.getByRole('button', { name: new RegExp(STREET) });
    await propertyCard.click();

    const fahrtkostenRow = page.locator('tbody tr').filter({ hasText: 'Fahrtkosten' });
    await expect(fahrtkostenRow.getByText('Beleg fehlt')).toBeVisible();
    await fahrtkostenRow.getByRole('button', { name: 'Hochladen' }).click();

    const uploadDialog = page.getByRole('dialog', { name: 'Beleg hinzufügen' });
    await expect(uploadDialog).toBeVisible();
    await uploadDialog.getByLabel('Betrag').fill('55');
    await page.setInputFiles('#tax-overview-document-upload', testFilePath);
    await uploadDialog.getByRole('button', { name: 'Hochladen' }).click();
    await expect(uploadDialog).not.toBeVisible();

    await expect(fahrtkostenRow.getByText('55 €')).toBeVisible();
    await expect(fahrtkostenRow.getByRole('button', { name: 'Vorschau' })).toBeVisible();
    await expect(fahrtkostenRow.getByText('Beleg fehlt')).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT d.amount FROM tax_expense_document d JOIN tax_expense_category c ON c.tax_expense_category_id = d.tax_expense_category_id
             WHERE c.property_id = $1 AND c.label = 'Fahrtkosten'`,
            [propertyId],
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].amount)).toBe(55);
    } finally {
        await client.end();
    }
});
