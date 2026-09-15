import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Mieterdaten (existing-properties/[propertyId]/tenant-data/[unitId]) — the
 * Hauptmieter's (primary tenant's) Nachname/Vorname/Steuer-ID/Einzugsdatum
 * are shown without the "(optional)" marker, backed by the
 * tenancy_person_primary_*_required CHECK constraints
 * (20260911000003_tenancy_person_primary_required_fields.sql,
 * 20260915000001_tenancy_person_primary_name_required.sql). See
 * primaryPersonValidation.test.ts for the pure-function coverage of exactly
 * which states are/aren't valid; this spec exercises the same rule through
 * the actual form (Save gating, inline errors) and a real save round-trip.
 *
 * Not part of the shared property/unit/tenancy fixture (fixtures/seed.ts) —
 * this creates its own property + single unit with no tenancy yet, so the
 * form starts from a clean, untouched state and can't disturb the other
 * smoke specs that assert on that fixture's exact tenant data.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Mieterdaten-Straße';
const POSTAL_CODE = '00450';
const CITY = 'E2E Mieterdaten-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

let propertyId: number;
let unitId: number;

test.beforeAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
        const propertyResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 1)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET, CITY, POSTAL_CODE],
        );
        propertyId = propertyResult.rows[0].property_id as number;

        const unitResult = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 60)
             RETURNING property_unit_id`,
            [propertyId],
        );
        unitId = unitResult.rows[0].property_unit_id as number;
    } finally {
        await client.end();
    }
});

test.afterAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        // ON DELETE CASCADE takes property_unit/tenancy/tenancy_person along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test.beforeEach(async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/tenant-data/${unitId}`);
});

test('save stays disabled until the Hauptmieter\'s mandatory fields are filled, with inline errors explaining why', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Mieterdaten speichern' });
    // Nothing entered yet -> nothing to save (no tenant-yet is a valid state).
    await expect(saveButton).toBeDisabled();

    // Typing a name is what actually triggers the requirement (an entirely
    // blank form is fine; a half-filled Hauptmieter is not) — see
    // primaryPersonValidation.test.ts's "brand-new, entirely blank draft row" case.
    await page.getByLabel('Vorname', { exact: true }).fill('Hans');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText('Pflichtfeld für den Hauptmieter.')).toHaveCount(3); // lastName, taxId, moveInDate

    await page.getByLabel('Nachname', { exact: true }).fill('Müller');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText('Pflichtfeld für den Hauptmieter.')).toHaveCount(2); // taxId, moveInDate

    await page.getByLabel('Steuer-ID', { exact: true }).fill('12 345 678 901');
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText('Pflichtfeld für den Hauptmieter.')).toHaveCount(1); // moveInDate

    await page.getByLabel('Einzugsdatum', { exact: true }).fill('01.01.2024');
    await expect(page.getByText('Pflichtfeld für den Hauptmieter.')).toHaveCount(0);
    await expect(saveButton).toBeEnabled();
});

test('saving persists the Hauptmieter and an additional person, requiring Steuer-ID/Einzugsdatum only for the Hauptmieter', async ({ page }) => {
    await page.getByLabel('Vorname', { exact: true }).fill('Hans');
    await page.getByLabel('Nachname', { exact: true }).fill('Müller');
    await page.getByLabel('Steuer-ID', { exact: true }).fill('12 345 678 901');
    await page.getByLabel('Einzugsdatum', { exact: true }).fill('01.01.2024');

    await page.getByRole('button', { name: 'Person hinzufügen' }).click();
    // The second person is not primary -> only a name is required of it, and
    // even that isn't required to save (an unnamed extra row is just dropped).
    await page.getByLabel('Vorname', { exact: true }).nth(1).fill('Maria');
    await page.getByLabel('Nachname', { exact: true }).nth(1).fill('Schmidt');

    const saveButton = page.getByRole('button', { name: 'Mieterdaten speichern' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText('Mieterdaten gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: tenancyRows } = await client.query(
            'SELECT tenancy_id FROM tenancy WHERE property_unit_id = $1',
            [unitId],
        );
        expect(tenancyRows).toHaveLength(1);
        const tenancyId = tenancyRows[0].tenancy_id as number;

        const { rows: personRows } = await client.query(
            `SELECT first_name, last_name, tax_id, is_primary, move_in_date::text AS move_in_date
             FROM tenancy_person WHERE tenancy_id = $1 ORDER BY sort_order`,
            [tenancyId],
        );
        expect(personRows).toHaveLength(2);

        expect(personRows[0].is_primary).toBe(true);
        expect(personRows[0].first_name).toBe('Hans');
        expect(personRows[0].last_name).toBe('Müller');
        expect(personRows[0].tax_id).toBe('12 345 678 901');
        expect(personRows[0].move_in_date).toBe('2024-01-01');

        expect(personRows[1].is_primary).toBe(false);
        expect(personRows[1].first_name).toBe('Maria');
        expect(personRows[1].last_name).toBe('Schmidt');
        expect(personRows[1].tax_id).toBeNull();
        expect(personRows[1].move_in_date).toBeNull();
    } finally {
        await client.end();
    }
});
