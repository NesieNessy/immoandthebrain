import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Mieterauszug (existing-properties/[propertyId]/tenant-move-out/[unitId]) —
 * handleSave itself already checked every mutation's return value correctly
 * (see the comment on tenancy_move_out.supabase.ts explaining an earlier,
 * already-fixed version of exactly this session's recurring bug class: a
 * direct browser Supabase call silently failing under auth-bypass RLS while
 * still showing a "saved" toast). This review instead found three sibling
 * handlers — handleGenerateProtocol, handleUploadProtocol,
 * handleReleaseDeposit — showing their success toast unconditionally even
 * when the underlying update failed; fixed to throw and surface data.error
 * instead. This spec exercises the meter-reading/move-out-date save (the
 * already-correct path) and the deposit-release fix through the real form.
 *
 * Not part of the shared property/unit/tenancy fixture (fixtures/seed.ts) —
 * this creates its own property + unit with a *current* tenancy, so it
 * can't disturb ExistingProperties.spec.ts's own meter-reading test on that
 * fixture's unit.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Mieterauszug-Straße';
const POSTAL_CODE = '00470';
const CITY = 'E2E Mieterauszug-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

let propertyId: number;
let unitId: number;
let tenancyId: number;

// A year out, computed relative to "now" rather than hardcoded — it must
// stay in the future (the tenancy needs to still be "current" — tenancy_end_date
// IS NULL OR >= CURRENT_DATE — for the second test, which reuses this same
// tenancy) regardless of which year this suite actually runs in.
const FUTURE_MOVE_OUT_DATE = new Date();
FUTURE_MOVE_OUT_DATE.setFullYear(FUTURE_MOVE_OUT_DATE.getFullYear() + 1);
const FUTURE_MOVE_OUT_DATE_UI = [
    String(FUTURE_MOVE_OUT_DATE.getDate()).padStart(2, '0'),
    String(FUTURE_MOVE_OUT_DATE.getMonth() + 1).padStart(2, '0'),
    String(FUTURE_MOVE_OUT_DATE.getFullYear()),
].join('.');
const FUTURE_MOVE_OUT_DATE_DB = [
    FUTURE_MOVE_OUT_DATE.getFullYear(),
    String(FUTURE_MOVE_OUT_DATE.getMonth() + 1).padStart(2, '0'),
    String(FUTURE_MOVE_OUT_DATE.getDate()).padStart(2, '0'),
].join('-');

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

        // Current tenancy (no end date yet) -> the page needs one to render
        // anything but "kein Mieter hinterlegt".
        const tenancyResult = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, deposit, tenant_first_name, tenant_last_name)
             VALUES ($1, $2, true, '2024-01-01', 950, 1800, '', '')
             RETURNING tenancy_id`,
            [propertyId, unitId],
        );
        tenancyId = tenancyResult.rows[0].tenancy_id as number;

        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, tax_id, move_in_date)
             VALUES ($1, 'Peter', 'Klein', true, 0, '11 111 111 111', '2024-01-01')`,
            [tenancyId],
        );
    } finally {
        await client.end();
    }
});

test.afterAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        // ON DELETE CASCADE takes property_unit/tenancy/tenancy_person/tenancy_move_out along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test.beforeEach(async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/tenant-move-out/${unitId}`);
});

test('saving a meter reading and move-out date persists both to the database', async ({ page }) => {
    await page.getByRole('button', { name: 'Zähler hinzufügen' }).click();
    await page.getByLabel('Raum').selectOption('Küche');
    await page.getByLabel('Zählerstand').fill('54321');
    await page.getByLabel('Auszugsdatum', { exact: true }).fill(FUTURE_MOVE_OUT_DATE_UI);

    await page.getByRole('button', { name: 'Mieterauszug speichern' }).click();
    await expect(page.getByText('Auszugsdaten gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: tenancyRows } = await client.query(
            'SELECT tenancy_end_date::text AS tenancy_end_date FROM tenancy WHERE tenancy_id = $1',
            [tenancyId],
        );
        expect(tenancyRows[0].tenancy_end_date).toBe(FUTURE_MOVE_OUT_DATE_DB);

        const { rows: moveOutRows } = await client.query(
            'SELECT meter_readings FROM tenancy_move_out WHERE tenancy_id = $1',
            [tenancyId],
        );
        expect(moveOutRows).toHaveLength(1);
        const readings = moveOutRows[0].meter_readings as { room: string; value: number | null }[];
        expect(readings).toHaveLength(1);
        expect(readings[0].room).toBe('Küche');
        expect(readings[0].value).toBe(54321);
    } finally {
        await client.end();
    }
});

test('releasing the deposit marks it as paid out and replaces the button with a status badge', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Mietkaution auflösen' })).toBeVisible();

    await page.getByRole('button', { name: 'Mietkaution auflösen' }).click();
    await expect(page.getByText('Mietkaution als ausgezahlt markiert.')).toBeVisible();
    await expect(page.getByText('Mietkaution ausgezahlt', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mietkaution auflösen' })).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query('SELECT deposit_paid_out FROM tenancy WHERE tenancy_id = $1', [tenancyId]);
        expect(rows[0].deposit_paid_out).toBe(true);
    } finally {
        await client.end();
    }
});
