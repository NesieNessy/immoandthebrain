import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Mieterhistorie (existing-properties/[propertyId]/tenant-history/[unitId])
 * — UnitHistoryTable.tsx's reactivate/delete handlers discarded
 * updateTenancy/deleteTenancy/deleteTenancyDocument's return values with no
 * feedback at all (no toast import even existed): a failure and a success
 * looked identical — the confirmation modal just closed and the list
 * reloaded either way. Fixed to check every return value and show a
 * success/error toast, matching the pattern used throughout the rest of
 * this feature area. This spec exercises both write paths against a real,
 * already-ended ("past") tenancy.
 *
 * Not part of the shared property/unit/tenancy fixture (fixtures/seed.ts) —
 * this creates its own property with two past tenancies (one per test, so
 * reactivating in the first test can't affect the second), so it can't
 * disturb the other smoke specs.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Mieterhistorie-Straße';
const POSTAL_CODE = '00480';
const CITY = 'E2E Mieterhistorie-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

function isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

let propertyId: number;
let reactivateUnitId: number;
let reactivateTenancyId: number;
let deleteUnitId: number;
let deleteTenancyId: number;

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

        async function seedPastTenancy(unitLabel: string, sortOrder: number, tenantLastName: string) {
            const unitResult = await client.query(
                `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
                 VALUES ($1, $2, $3, 'WOHNUNG', 60)
                 RETURNING property_unit_id`,
                [propertyId, unitLabel, sortOrder],
            );
            const unitId = unitResult.rows[0].property_unit_id as number;

            // Ended yesterday -> not "current" (getCurrentTenancyByUnit requires
            // tenancy_end_date IS NULL OR >= CURRENT_DATE), so it lands in the
            // "past" list this page shows.
            const tenancyResult = await client.query(
                `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, tenancy_end_date, cold_rent, deposit, tenant_first_name, tenant_last_name)
                 VALUES ($1, $2, true, $3, $4, 900, 1500, '', '')
                 RETURNING tenancy_id`,
                [propertyId, unitId, isoDaysAgo(200), isoDaysAgo(1)],
            );
            const tenancyId = tenancyResult.rows[0].tenancy_id as number;

            await client.query(
                `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, tax_id, move_in_date)
                 VALUES ($1, 'Klaus', $2, true, 0, '22 222 222 222', $3)`,
                [tenancyId, tenantLastName, isoDaysAgo(200)],
            );

            return { unitId, tenancyId };
        }

        ({ unitId: reactivateUnitId, tenancyId: reactivateTenancyId } = await seedPastTenancy('Whg. 1', 0, 'Weber'));
        ({ unitId: deleteUnitId, tenancyId: deleteTenancyId } = await seedPastTenancy('Whg. 2', 1, 'Fischer'));
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

test('reactivating a past tenancy clears its move-out date and marks it rented again', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/tenant-history/${reactivateUnitId}`);

    const row = page.getByRole('row', { name: /Weber/ });
    await row.getByRole('button').click();
    await page.getByRole('button', { name: 'Reaktivieren' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Mietverhältnis reaktivieren?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Reaktivieren' }).click();

    await expect(page.getByText('Mietverhältnis reaktiviert.')).toBeVisible();
    await expect(row).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            'SELECT tenancy_end_date, is_rented FROM tenancy WHERE tenancy_id = $1',
            [reactivateTenancyId],
        );
        expect(rows[0].tenancy_end_date).toBeNull();
        expect(rows[0].is_rented).toBe(true);
    } finally {
        await client.end();
    }
});

test('deleting a past tenancy removes it permanently', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/tenant-history/${deleteUnitId}`);

    const row = page.getByRole('row', { name: /Fischer/ });
    await row.getByRole('button').click();
    await page.getByRole('button', { name: 'Löschen' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Eintrag löschen?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Löschen' }).click();

    await expect(page.getByText('Mietverhältnis gelöscht.')).toBeVisible();
    await expect(row).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query('SELECT tenancy_id FROM tenancy WHERE tenancy_id = $1', [deleteTenancyId]);
        expect(rows).toHaveLength(0);
    } finally {
        await client.end();
    }
});
