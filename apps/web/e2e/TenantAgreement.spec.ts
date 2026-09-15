import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Mietvertrag (existing-properties/[propertyId]/tenant-agreement/[unitId]) —
 * this tab edits the same underlying `tenancy` row as Mieterdaten but has no
 * field of its own for the tenant's name. See orphanedRentalData.test.ts and
 * primaryPersonValidation.test.ts for the pure-function coverage of exactly
 * which states are/aren't valid; this spec exercises the same rules through
 * the actual form (a real save round-trip, both blocked and successful).
 *
 * Not part of the shared property/unit/tenancy fixture (fixtures/seed.ts) —
 * this creates its own property with two fresh units (no tenancy yet), so
 * neither test can disturb the other smoke specs that assert on that
 * fixture's exact tenant/tenancy data.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Mietvertrag-Straße';
const POSTAL_CODE = '00460';
const CITY = 'E2E Mietvertrag-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

let propertyId: number;
/** No tenancy ever created here — used by the "orphaned data" guard test. */
let vacantUnitId: number;
/** Gets a named Hauptmieter via the Mieterdaten tab before the Mietvertrag test runs. */
let tenantedUnitId: number;

test.beforeAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
        const propertyResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 2)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET, CITY, POSTAL_CODE],
        );
        propertyId = propertyResult.rows[0].property_id as number;

        const vacantUnitResult = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 60)
             RETURNING property_unit_id`,
            [propertyId],
        );
        vacantUnitId = vacantUnitResult.rows[0].property_unit_id as number;

        const tenantedUnitResult = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, 'Whg. 2', 1, 'WOHNUNG', 70)
             RETURNING property_unit_id`,
            [propertyId],
        );
        tenantedUnitId = tenantedUnitResult.rows[0].property_unit_id as number;
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

test('saving rental terms with no tenant name anywhere is rejected instead of silently discarded', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/tenant-agreement/${vacantUnitId}`);

    await page.getByLabel('Netto-Mieteinnahmen', { exact: true }).fill('950');
    await page.getByLabel('Einzugsdatum', { exact: true }).fill('01.03.2026');

    await page.getByRole('button', { name: 'Mietvertrag speichern' }).click();
    await expect(page.getByText('Bitte zuerst einen Mieternamen')).toBeVisible();
    await expect(page.getByText('Mieterdaten gespeichert.')).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query('SELECT tenancy_id FROM tenancy WHERE property_unit_id = $1', [vacantUnitId]);
        expect(rows).toHaveLength(0);
    } finally {
        await client.end();
    }
});

test('saving rental terms for a named tenant persists them to the tenancy row', async ({ page }) => {
    // Establish the Hauptmieter first — Mietvertrag has no name field of its own.
    await page.goto(`/existing-properties/${propertyId}/tenant-data/${tenantedUnitId}`);
    await page.getByLabel('Vorname', { exact: true }).fill('Anna');
    await page.getByLabel('Nachname', { exact: true }).fill('Schulz');
    await page.getByLabel('Steuer-ID', { exact: true }).fill('98 765 432 101');
    await page.getByLabel('Einzugsdatum', { exact: true }).fill('01.02.2026');
    await page.getByRole('button', { name: 'Mieterdaten speichern' }).click();
    await expect(page.getByText('Mieterdaten gespeichert.')).toBeVisible();

    await page.goto(`/existing-properties/${propertyId}/tenant-agreement/${tenantedUnitId}`);
    await page.getByLabel('Netto-Mieteinnahmen', { exact: true }).fill('1200');
    await page.getByLabel('NK-Vorauszahlung', { exact: true }).fill('250');

    const saveButton = page.getByRole('button', { name: 'Mietvertrag speichern' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText('Mieterdaten gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT cold_rent, misc_rent, tenancy_start_date::text AS tenancy_start_date
             FROM tenancy WHERE property_unit_id = $1`,
            [tenantedUnitId],
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].cold_rent)).toBe(1200);
        expect(Number(rows[0].misc_rent)).toBe(250);
        // Derived from the Hauptmieter's own Einzugsdatum (single source of
        // truth — see useTenantUnitData's handleSave), not today's date.
        expect(rows[0].tenancy_start_date).toBe('2026-02-01');
    } finally {
        await client.end();
    }
});
