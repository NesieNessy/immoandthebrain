import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Restnutzungsdauer (RND) and Kaufpreisaufteilung on an existing property —
 * /existing-properties/[id]/adjust-rnd and /adjust-distribution. Both pages
 * share the same Standard/Individuell pattern and the same pure calculation
 * functions as the detail-check wizard's Abschreibung step (see
 * apps/web/src/lib/detailCheck/depreciation.ts and its unit tests), so the
 * numbers asserted here are chosen to match depreciation.test.ts's cases
 * exactly — this is the same math, exercised end-to-end through the UI and
 * persisted to the property_rnd / property_price_split tables instead.
 *
 * Not part of the shared property/unit/tenancy fixture (fixtures/seed.ts) —
 * this creates its own minimal property + acquisition_costs row, matching
 * existing-property-data.spec.ts's pattern, so it can't disturb the other
 * smoke specs that assert on that fixture's exact address/purchase price.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E RND-Kaufpreisaufteilung-Straße';
const POSTAL_CODE = '00440';
const CITY = 'E2E RND-Stadt'; // Deliberately not in city_purchase_price_split -> the 65/35 default applies.
const PURCHASE_PRICE = 300000;

// Age-dependent, so computed relative to "now" rather than hardcoded —
// otherwise this test would silently stop matching its own math once run in
// a year other than the one it was written in.
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OF_CONSTRUCTION = CURRENT_YEAR - 50;

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

let propertyId: number;

test.beforeAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
        const result = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, property_category)
             VALUES ($1, $2, '1', $3, $4, $5, 'EIGENTUMSWOHNUNG')
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET, CITY, POSTAL_CODE, YEAR_OF_CONSTRUCTION],
        );
        propertyId = result.rows[0].property_id as number;
        await client.query(
            'INSERT INTO acquisition_costs (property_id, property_purchase_price) VALUES ($1, $2)',
            [propertyId, PURCHASE_PRICE],
        );
    } finally {
        await client.end();
    }
});

test.afterAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        // ON DELETE CASCADE takes acquisition_costs/property_rnd/property_price_split along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test.describe('Restnutzungsdauer (RND)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`/existing-properties/${propertyId}/adjust-rnd`);
    });

    test('Standard mode shows the fixed 50 years / 2% default and hides the modernization table', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Standard (50 Jahre)' })).toBeVisible();
        await expect(page.getByText('50 Jahre', { exact: true })).toBeVisible();
        await expect(page.getByText('2%', { exact: true })).toBeVisible();
        // Substring text match would also hit the mode-description paragraph
        // ("...Baujahr und Modernisierungen werden nicht berücksichtigt."),
        // which is always rendered — the SectionLabel heading is the actual
        // modernization table's marker, so scope to that specifically.
        await expect(page.getByRole('heading', { name: 'Modernisierungen' })).not.toBeVisible();
    });

    test('Individuell mode computes RND/AfA live from age + modernization, and persists on save', async ({ page }) => {
        await page.getByRole('button', { name: 'Individuell prüfen' }).click();
        await expect(page.getByRole('heading', { name: 'Modernisierungen' })).toBeVisible();

        // Every measure modernized within the last 5 years -> max modernization
        // credit (21 points). At 50 years of age (gnd 80 for EIGENTUMSWOHNUNG)
        // that resolves to RND 59.61 / AfA 1.68% — the same "all recent" case
        // as depreciation.test.ts's computeRemainingUsefulLife suite.
        const modernizationSelects = page.locator('select');
        await expect(modernizationSelects).toHaveCount(7);
        for (let i = 0; i < 7; i++) {
            await modernizationSelects.nth(i).selectOption('0_5');
        }

        await expect(page.getByText('59,61 Jahre', { exact: true })).toBeVisible();
        await expect(page.getByText('1,68%', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'RND speichern' }).click();
        await expect(page.getByText('Restnutzungsdauer gespeichert.')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/existing-properties/${propertyId}$`));

        // Reload from scratch — the computed values must have actually been
        // persisted (property_rnd), not just held in local component state.
        await page.goto(`/existing-properties/${propertyId}/adjust-rnd`);
        await expect(page.getByText('59,61 Jahre', { exact: true })).toBeVisible();
        await expect(page.getByText('1,68%', { exact: true })).toBeVisible();
        for (let i = 0; i < 7; i++) {
            await expect(modernizationSelects.nth(i)).toHaveValue('0_5');
        }

        const client = new Client({ connectionString: requireDatabaseUrl() });
        await client.connect();
        try {
            const { rows } = await client.query(
                `SELECT rnd_mode, remaining_useful_life_years, afa_percent, modernization_roof, modernization_interior
                 FROM property_rnd WHERE property_id = $1`,
                [propertyId],
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].rnd_mode).toBe('INDIVIDUAL');
            expect(Number(rows[0].remaining_useful_life_years)).toBe(59.61);
            expect(Number(rows[0].afa_percent)).toBe(1.68);
            expect(rows[0].modernization_roof).toBe('0_5');
            expect(rows[0].modernization_interior).toBe('0_5');
        } finally {
            await client.end();
        }
    });
});

test.describe('Kaufpreisaufteilung', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`/existing-properties/${propertyId}/adjust-distribution`);
    });

    test('Standard mode uses the 65/35 default for a city with no override', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Standard (65 / 35)' })).toBeVisible();
        await expect(page.getByText('65%', { exact: true })).toBeVisible();
        await expect(page.getByText('195.000 €', { exact: true })).toBeVisible(); // Gebäude: 300.000 * 65%
        await expect(page.getByText('35%', { exact: true })).toBeVisible();
        await expect(page.getByText('105.000 €', { exact: true })).toBeVisible(); // Grund und Boden
    });

    test('Individuell mode computes the split from Bodenrichtwert × Fläche × Miteigentumsanteil, and persists on save', async ({ page }) => {
        await page.getByRole('button', { name: 'Individuell berechnen' }).click();

        await page.getByLabel('Grundstücksgröße').fill('500');
        await page.getByLabel('Bodenrichtwert').fill('800');
        await page.getByLabel('MEA Zähler').fill('250');
        await page.getByLabel('MEA Nenner').fill('1000');

        // Land: 800 €/m² * 500 m² * (250/1000) = 100.000 €.
        // Building: 300.000 - 100.000 = 200.000 € — the same numbers as
        // depreciation.test.ts's computePriceSplitIndividual "normal" case.
        await expect(page.getByText('66,67%', { exact: true })).toBeVisible();
        await expect(page.getByText('200.000 €', { exact: true })).toBeVisible();
        await expect(page.getByText('33,33%', { exact: true })).toBeVisible();
        await expect(page.getByText('100.000 €', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Kaufpreisaufteilung speichern' }).click();
        await expect(page.getByText('Kaufpreisaufteilung gespeichert.')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/existing-properties/${propertyId}$`));

        // Reload from scratch — the raw inputs must have actually been
        // persisted (property_price_split), not just held in local state.
        await page.goto(`/existing-properties/${propertyId}/adjust-distribution`);
        await expect(page.getByRole('button', { name: 'Individuell berechnen' })).toBeVisible();
        await expect(page.getByLabel('Grundstücksgröße')).toHaveValue('500');
        await expect(page.getByLabel('Bodenrichtwert')).toHaveValue('800');
        await expect(page.getByText('66,67%', { exact: true })).toBeVisible();
        await expect(page.getByText('200.000 €', { exact: true })).toBeVisible();

        const client = new Client({ connectionString: requireDatabaseUrl() });
        await client.connect();
        try {
            const { rows } = await client.query(
                `SELECT split_mode, plot_area_m2, land_reference_value, co_ownership_numerator, co_ownership_denominator
                 FROM property_price_split WHERE property_id = $1`,
                [propertyId],
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].split_mode).toBe('INDIVIDUAL');
            expect(Number(rows[0].plot_area_m2)).toBe(500);
            expect(Number(rows[0].land_reference_value)).toBe(800);
            expect(Number(rows[0].co_ownership_numerator)).toBe(250);
            expect(Number(rows[0].co_ownership_denominator)).toBe(1000);
        } finally {
            await client.end();
        }
    });
});
