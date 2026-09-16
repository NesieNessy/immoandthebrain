import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Nebenkostenabrechnung (existing-properties/[propertyId]/service-charge-settlement/[unitId])
 * — useServiceChargeSettlementData.tsx's handleSave/handleApplyPrepayment
 * discarded several supabase write results (updateSettlement, deleteCostItem,
 * updateCostItem/createCostItem, the rent-updating updateTenancy calls,
 * addAdjustmentHistoryEntry): a failed write still produced the unconditional
 * "Nebenkostenabrechnung gespeichert." success toast and updated local state
 * as if it had worked. Fixed to check every return value and throw instead.
 * Also added a `landlord != null` gate to canGeneratePdf/canGenerateAdjustmentDocx
 * (previously missing, unlike the sibling Mieterbescheinigung generator) since
 * without it the generated documents silently ship with a blank sender.
 *
 * Also fixed: settlements are now per billing period. `/api/settlement-aggregate`
 * used to always load the *most recent* settlement/tenancy for a unit
 * regardless of which period was being viewed, and handleSave renamed
 * ("updated") that settlement's period in place whenever it differed from
 * the form — so navigating to a new year and saving silently overwrote the
 * previous year's settlement instead of keeping settlement history. Fixed by
 * making the loader accept an explicit period (exact settlement match +
 * tenant-overlap match) and making handleSave create a new settlement for a
 * changed period (erroring instead of duplicating if one already exists for
 * that exact period) rather than repurposing the loaded row.
 *
 * This spec exercises the real save path: filling in the first (deterministic
 * "Grundsteuer", from DEFAULT_COST_ITEMS) cost-item row, saving, and verifying
 * both the persisted DB rows and the on-screen computed unit share/coverage
 * figures from settlementMath.ts — then exercises year-to-year navigation to
 * confirm it creates a separate settlement rather than overwriting the one
 * just saved, and that switching years with an unsaved edit pending asks for
 * confirmation first.
 *
 * Not part of the shared fixture (fixtures/seed.ts) — creates its own
 * property/unit/tenancy so it can't disturb the other smoke specs.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Nebenkostenabrechnung-Straße';
const POSTAL_CODE = '00490';
const CITY = 'E2E Nebenkostenabrechnung-Stadt';

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

        // Two units (60 m² + 40 m² = 100 m² total) so the unit's Anteil is a
        // clean, easy-to-check 60% of every cost position.
        const propertyResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 2)
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

        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, 'Whg. 2', 1, 'WOHNUNG', 40)`,
            [propertyId],
        );

        const tenancyResult = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, is_rented, tenancy_start_date, cold_rent, misc_rent, tenant_first_name, tenant_last_name, deposit)
             VALUES ($1, $2, true, '2024-01-01', 900, 200, 'Erika', 'Testperson', 1800)
             RETURNING tenancy_id`,
            [propertyId, unitId],
        );
        const tenancyId = tenancyResult.rows[0].tenancy_id as number;

        await client.query(
            `INSERT INTO tenancy_person (tenancy_id, first_name, last_name, is_primary, sort_order, tax_id, move_in_date)
             VALUES ($1, 'Erika', 'Testperson', true, 0, '12345678901', '2024-01-01')`,
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
        // ON DELETE CASCADE takes property_unit/tenancy/tenancy_person/
        // service_charge_settlement/service_charge_cost_item along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test('filling in a cost item and saving persists the settlement and computes the unit share, and navigating to a different year creates a separate settlement instead of overwriting it', async ({ page }) => {
    // Kept as one test (rather than two that build on each other) so that a
    // CI retry — which Playwright runs in a fresh worker, re-seeding the
    // fixture via beforeAll — always replays the whole scenario instead of
    // a later part silently depending on state a skipped earlier test would
    // otherwise have committed.
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId}`);

    const firstRow = page.locator('tbody tr').first();
    // The label cell is an editable TextField (an <input>), so its value
    // never shows up in the row's text content — toContainText can't see it.
    await expect(firstRow.getByRole('textbox').first()).toHaveValue('Grundsteuer');

    const numberInputs = firstRow.locator('input[type="number"]');
    // index 0 = actualAmount, 1 = actualShareOverride (disabled until an
    // amount is entered), 2 = budgetAmount, 3 = budgetShareOverride.
    await numberInputs.nth(0).fill('1000');
    await numberInputs.nth(2).fill('1100');

    // 60 m² of 100 m² total living area -> the unit's Anteil is 60% of the
    // whole-building actual amount entered above (settlementMath.ts's
    // area-proportional split, no per-item override set here). euro()
    // formats with 0 decimals (deCurrencyFormatter), so 1000 * 0.6 -> "600 €".
    await expect(page.getByText('600 €').first()).toBeVisible();

    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: settlementRows } = await client.query(
            'SELECT service_charge_settlement_id, period_start, period_end FROM service_charge_settlement WHERE property_id = $1',
            [propertyId],
        );
        expect(settlementRows).toHaveLength(1);
        const settlementId = settlementRows[0].service_charge_settlement_id as number;

        const { rows: costItemRows } = await client.query(
            `SELECT label, allocable, actual_amount, budget_amount FROM service_charge_cost_item
             WHERE service_charge_settlement_id = $1 AND label = 'Grundsteuer'`,
            [settlementId],
        );
        expect(costItemRows).toHaveLength(1);
        expect(costItemRows[0].allocable).toBe(true);
        expect(Number(costItemRows[0].actual_amount)).toBe(1000);
        expect(Number(costItemRows[0].budget_amount)).toBe(1100);
    } finally {
        await client.end();
    }

    // The document-generation buttons need a saved settlement + tenancy +
    // landlord (personal_data, seeded for the bypass user by
    // 20260224000006_zz_dev_user.sql) — all three are present now, so the
    // PDF button should be enabled.
    await expect(page.getByRole('button', { name: 'PDF generieren' })).toBeEnabled();

    // ── Now browse to a different year: must not overwrite the settlement above ──
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    // "Abrechnungsjahr {year}" also appears in the "Gesamtkosten Objekt"
    // MetricCard's detail text — .first() picks the year-picker's own display.
    await expect(page.getByText(`Abrechnungsjahr ${currentYear}`).first()).toBeVisible();

    // No unsaved edits yet -> switching years reloads immediately, no confirm dialog.
    await page.getByRole('button', { name: 'Nächstes Jahr' }).click();
    await expect(page.getByText(`Abrechnungsjahr ${nextYear}`).first()).toBeVisible();
    // No settlement saved for the new period yet -> the default BetrKV
    // template, not a copy of the previous year's saved amount.
    await expect(firstRow.locator('input[type="number"]').nth(0)).toHaveValue('');

    await firstRow.locator('input[type="number"]').nth(0).fill('2000');
    await firstRow.locator('input[type="number"]').nth(2).fill('2200');

    // An unsaved edit now exists -> navigating away must ask for
    // confirmation instead of silently discarding it.
    await page.getByRole('button', { name: 'Vorheriges Jahr' }).click();
    const discardDialog = page.getByRole('dialog', { name: 'Änderungen verwerfen?' });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(discardDialog).not.toBeVisible();
    // Cancelling kept the edit and stayed on the next-year draft.
    await expect(page.getByText(`Abrechnungsjahr ${nextYear}`).first()).toBeVisible();
    await expect(firstRow.locator('input[type="number"]').nth(0)).toHaveValue('2000');

    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gespeichert.')).toBeVisible();

    const secondClient = new Client({ connectionString: requireDatabaseUrl() });
    await secondClient.connect();
    try {
        const { rows: settlementRows } = await secondClient.query(
            'SELECT service_charge_settlement_id, period_start FROM service_charge_settlement WHERE property_id = $1 ORDER BY period_start',
            [propertyId],
        );
        // The year-navigation save above must not have overwritten this
        // year's settlement (the original bug) — there are now two rows.
        expect(settlementRows).toHaveLength(2);
        const [thisYearSettlement, nextYearSettlement] = settlementRows;

        const { rows: originalItems } = await secondClient.query(
            `SELECT actual_amount FROM service_charge_cost_item WHERE service_charge_settlement_id = $1 AND label = 'Grundsteuer'`,
            [thisYearSettlement.service_charge_settlement_id],
        );
        expect(Number(originalItems[0].actual_amount)).toBe(1000);

        const { rows: nextYearItems } = await secondClient.query(
            `SELECT actual_amount, budget_amount FROM service_charge_cost_item WHERE service_charge_settlement_id = $1 AND label = 'Grundsteuer'`,
            [nextYearSettlement.service_charge_settlement_id],
        );
        expect(Number(nextYearItems[0].actual_amount)).toBe(2000);
        expect(Number(nextYearItems[0].budget_amount)).toBe(2200);
    } finally {
        await secondClient.end();
    }
});
