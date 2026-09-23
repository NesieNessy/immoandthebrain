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
 * Also fixed: Anteil Wohnung (the per-item apartment share) used to default
 * to actualAmount * unit-living-area-share, and an "Automatisch berechnen"
 * link reset a manual override back to that computed value — Gesamt Objekt
 * (the whole building's cost) never automatically corresponds to a specific
 * apartment's share of it, so both the auto-fill and the reset-to-computed
 * function were removed; Anteil Wohnung is now always a plain manual entry,
 * and it stays editable even when the row is marked "nicht umlagefähig"
 * (previously disabled in that case).
 *
 * This spec exercises the real save path: filling in the first (deterministic
 * "Grundsteuer", from DEFAULT_COST_ITEMS) cost-item row (including its Anteil
 * Wohnung, manually), saving, and verifying both the persisted DB rows and
 * the on-screen unit share/coverage figures from settlementMath.ts — then
 * exercises year-to-year navigation to confirm it creates a separate
 * settlement rather than overwriting the one just saved, and that switching
 * years with an unsaved edit pending asks for confirmation first.
 *
 * Further fixes covered by the tests below (each a separate `test()` so a
 * failure in one doesn't hide the others, using distinct years/periods per
 * test to avoid colliding with settlements other tests in this file save):
 *
 * - "Wert vorschlagen" (per-row and "Alle Werte vorschlagen" bulk action)
 *   derives Anteil Wohnung from an allocation factor for that cost item's
 *   label — an explicitly stored Verteilerschlüssel if one exists, else the
 *   ratio learned from that label's own actual/share pair in the unit's most
 *   recent prior settlement — never a living-area or occupancy fraction, and
 *   never fabricated when neither basis exists. It only ever fills an
 *   *empty* field, never overwriting one that already has a value (manual or
 *   previously suggested).
 * - A saved settlement can now be deleted ("Abrechnung löschen"), which
 *   cascade-deletes its cost items and leaves the page on a fresh draft.
 * - Saving with an end date before the start date used to fail with the
 *   generic "konnte nicht gespeichert werden" message; it now names the
 *   actual reason.
 * - Leaving the page entirely (the "Zurück" button, a breadcrumb link) with
 *   an unsaved edit used to navigate away silently; both are now guarded
 *   the same way year-switching already was.
 * - A unit with no current tenancy ("Unvermietet") used to still show
 *   tenant-implying labels like "Nachzahlung durch Mieter" computed against
 *   a nonexistent tenant; it now shows neutral placeholders instead, and
 *   the whole "Anpassung Nebenkostenvorauszahlung" section is replaced with
 *   an explanatory note.
 *
 * Not part of the shared fixture (fixtures/seed.ts) — creates its own
 * property/units/tenancy so it can't disturb the other smoke specs.
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

// A fresh page load with no explicit period defaults to the property's
// *most recently saved* settlement (by period_end), not "this calendar
// year" — so once an earlier test in this file has saved a settlement for a
// later year, a later test's starting point is whatever that latest saved
// year is, not `new Date().getFullYear()`. Reading it back from the page
// instead of assuming it keeps each test correct regardless of what
// settlements earlier tests in this file happened to leave behind.
//
// Waits for the year-picker box itself to be visible first — a plain
// `locator.textContent()` only waits for an element to be *attached*, not
// for the page's initial units/tenancy/settlement fetch to have actually
// resolved, so calling this the instant after `page.goto()` could read (or
// hang on) a still-loading page instead of the real value.
async function readDisplayedYear(page: import('@playwright/test').Page): Promise<number> {
    const yearBox = page.getByText(/Abrechnungsjahr \d{4}/).first();
    await expect(yearBox).toBeVisible();
    const text = await yearBox.textContent();
    const match = text?.match(/\d{4}/);
    if (!match) throw new Error(`Could not read the displayed Abrechnungsjahr from "${text}"`);
    return parseInt(match[0], 10);
}

// A retried click here can land as a *second* click on "Nächstes Jahr"
// after the first one actually succeeded but just rendered slowly (the
// 5s visibility check timed out before the DOM updated) — that second
// click then registers as "navigate away with pending changes" and pops
// the same discard-confirmation dialog the app shows for the Zurück/
// breadcrumb guards, which then sits on top of the button and blocks every
// further click attempt forever. Clearing it (discarding, since this
// helper's whole job is just to land on `targetYear`, not preserve
// whatever incidental dirty state a slow reload left behind) before and
// after each attempt keeps the retry loop from getting stuck on it.
async function dismissDiscardDialogIfPresent(page: import('@playwright/test').Page): Promise<void> {
    const dialog = page.getByRole('dialog', { name: 'Änderungen verwerfen?' });
    if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole('button', { name: 'Verwerfen' }).click();
        await expect(dialog).not.toBeVisible();
    }
}

// Clicks "Nächstes Jahr" the exact number of times needed to reach
// `targetYear` from whatever year is actually displayed right now.
//
// Each click triggers a full reload of that year's settlement/tenancy data
// from the (local, Dockerized) Supabase instance CI runs against. Simply
// waiting longer after a single click (the first fix attempt here) didn't
// help — CI kept timing out on the very first click of a sequence just as
// often as the last, which points to an occasional dropped click or a
// failed fetch that never gets retried by the app, not merely a slow one.
// Waiting longer for something that will never happen doesn't help, so
// this retries the CLICK itself a few times per year step, and re-reads
// the actual displayed year afterwards rather than assuming the click
// advanced it by exactly one — either defends against the same failure
// mode actually causing the flakiness.
async function navigateToYear(page: import('@playwright/test').Page, targetYear: number): Promise<void> {
    let year = await readDisplayedYear(page);
    while (year < targetYear) {
        let advanced = false;
        for (let attempt = 0; attempt < 4 && !advanced; attempt++) {
            await dismissDiscardDialogIfPresent(page);
            await page.getByRole('button', { name: 'Nächstes Jahr' }).click();
            try {
                await expect(page.getByText(`Abrechnungsjahr ${year + 1}`).first()).toBeVisible({ timeout: 5000 });
                advanced = true;
            } catch {
                // isEditing (the app's own unsaved-changes flag) is `true`
                // whenever the *current* period has no saved settlement at
                // all — true for every fresh/unvisited year, not just years
                // with an actual pending edit — so clicking "Nächstes Jahr"
                // out of one of those years deterministically opens the
                // discard-confirmation dialog instead of navigating
                // straight through, exactly like it would for a real edit.
                // Confirming here doesn't await the app's own reload (it's
                // fire-and-forget from the confirm handler's side), so this
                // re-polls for the year text rather than reading it once
                // immediately, giving that reload room to actually finish.
                await dismissDiscardDialogIfPresent(page);
                try {
                    await expect(page.getByText(`Abrechnungsjahr ${year + 1}`).first()).toBeVisible({ timeout: 5000 });
                    advanced = true;
                } catch {
                    // Still not there after dismissing — the next attempt's
                    // click is a genuine retry, not a click into a page that
                    // already moved on.
                }
            }
        }
        if (!advanced) throw new Error(`navigateToYear: could not advance past ${year} towards ${targetYear} after repeated clicks`);
        year = await readDisplayedYear(page);
    }
    // Even on a clean success path, a dialog can be left open: reading the
    // year text only needs it to be visible, which it still is behind/around
    // the dialog overlay — so this function can report "reached targetYear"
    // while a confirm dialog sits on top of the page, ready to block
    // whatever the caller clicks next. Always clear it before returning.
    await dismissDiscardDialogIfPresent(page);
}

let propertyId: number;
let unitId: number;
let unitId2: number;

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

        // Deliberately left with no tenancy at all — the "Unvermietet" case.
        const unit2Result = await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2)
             VALUES ($1, 'Whg. 2', 1, 'WOHNUNG', 40)
             RETURNING property_unit_id`,
            [propertyId],
        );
        unitId2 = unit2Result.rows[0].property_unit_id as number;

        // house_money isn't exercised by any assertion below (it only feeds
        // the separate Nebenkostenvorauszahlung/Über-Unterdeckung math), but
        // tenancy.maintenance_costs_id is required, so a row must exist.
        const maintenanceCostsResult = await client.query(
            `INSERT INTO maintenance_costs (property_id, house_money) VALUES ($1, 400) RETURNING maintenance_costs_id`,
            [propertyId],
        );
        const maintenanceCostsId = maintenanceCostsResult.rows[0].maintenance_costs_id as number;

        const tenancyResult = await client.query(
            `INSERT INTO tenancy (property_id, property_unit_id, maintenance_costs_id, is_rented, tenancy_start_date, cold_rent, misc_rent, tenant_first_name, tenant_last_name, deposit)
             VALUES ($1, $2, $3, true, '2024-01-01', 900, 200, 'Erika', 'Testperson', 1800)
             RETURNING tenancy_id`,
            [propertyId, unitId, maintenanceCostsId],
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
    // index 0 = actualAmount (Gesamt Objekt), 1 = actualShareOverride (Anteil
    // Wohnung — always a manual, independent entry: the total property cost
    // must never be auto-copied or proportionally derived into this field,
    // and it stays editable even though this row is allocable), 2 =
    // budgetAmount, 3 = budgetShareOverride.
    await numberInputs.nth(0).fill('1000');
    await numberInputs.nth(1).fill('600');
    await numberInputs.nth(2).fill('1100');
    await numberInputs.nth(3).fill('660');

    // The manually entered Anteil Wohnung feeds straight into the Summe row
    // as-is (euro() formats with 0 decimals, so "600 €").
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
            `SELECT label, allocable, actual_amount, budget_amount, actual_share_override, budget_share_override
             FROM service_charge_cost_item WHERE service_charge_settlement_id = $1 AND label = 'Grundsteuer'`,
            [settlementId],
        );
        expect(costItemRows).toHaveLength(1);
        expect(costItemRows[0].allocable).toBe(true);
        expect(Number(costItemRows[0].actual_amount)).toBe(1000);
        expect(Number(costItemRows[0].budget_amount)).toBe(1100);
        // The manually entered Anteil Wohnung persists as typed — it must
        // never be silently replaced by a computed value derived from the
        // total amount above.
        expect(Number(costItemRows[0].actual_share_override)).toBe(600);
        expect(Number(costItemRows[0].budget_share_override)).toBe(660);
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
    await expect(page.getByText(`Abrechnungsjahr ${currentYear}`).first()).toBeVisible();

    // No unsaved edits yet -> switching years reloads immediately, no confirm dialog.
    await page.getByRole('button', { name: 'Nächstes Jahr' }).click();
    await expect(page.getByText(`Abrechnungsjahr ${nextYear}`).first()).toBeVisible();
    // No settlement saved for the new period yet -> the default BetrKV
    // template, not a copy of the previous year's saved amount.
    await expect(firstRow.locator('input[type="number"]').nth(0)).toHaveValue('');

    // Gesamt Objekt and Anteil Wohnung are a required pair per column now —
    // filling only one blocks saving, so both must be filled here.
    await firstRow.locator('input[type="number"]').nth(0).fill('2000');
    await firstRow.locator('input[type="number"]').nth(1).fill('1200');
    await firstRow.locator('input[type="number"]').nth(2).fill('2200');
    await firstRow.locator('input[type="number"]').nth(3).fill('1320');

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

test('"Alle Werte vorschlagen" fills only empty Anteil Wohnung fields, using the ratio learned from the previous settlement', async ({ page }) => {
    // Two otherwise-unused years (need not be adjacent — navigateToYear just
    // clicks forward until it reaches each one), distinct from the years the
    // other tests in this file save into.
    const priorYear = new Date().getFullYear() + 2;
    const targetYear = new Date().getFullYear() + 5;

    // Seed a "previous" settlement with a known, easy-to-check Grundsteuer
    // ratio (600/1000 = 60%, and — deliberately the same — 660/1100 = 60%
    // for the budget side) via the app itself, so this test's expectations
    // don't depend on incidental history left behind by other tests in this
    // file.
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId}`);
    await navigateToYear(page, priorYear);
    const priorRowNumbers = page.locator('tbody tr').first().locator('input[type="number"]');
    await priorRowNumbers.nth(0).fill('1000');
    await priorRowNumbers.nth(1).fill('600');
    await priorRowNumbers.nth(2).fill('1100');
    await priorRowNumbers.nth(3).fill('660');
    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gespeichert.')).toBeVisible();

    await navigateToYear(page, targetYear);

    const rows = page.locator('tbody tr');
    const row1Numbers = rows.nth(0).locator('input[type="number"]');
    const row2Numbers = rows.nth(1).locator('input[type="number"]');

    // Row 1 (Grundsteuer): only the amounts are filled in — Anteil Wohnung
    // starts empty and should be picked up by the bulk suggestion, using the
    // 60% ratio learned from the prior settlement seeded above.
    await row1Numbers.nth(0).fill('2000');
    await row1Numbers.nth(2).fill('2200');
    // Row 2 (Wasserversorgung): an amount AND a manually entered Anteil
    // Wohnung — the bulk action must leave this one untouched (and has no
    // prior-settlement history to suggest from anyway).
    await row2Numbers.nth(0).fill('500');
    await row2Numbers.nth(1).fill('42');

    await page.getByRole('button', { name: 'Alle Werte vorschlagen' }).click();

    // 2000 * 60% = 1200; 2200 * 60% = 1320.
    await expect(row1Numbers.nth(1)).toHaveValue('1200');
    await expect(row1Numbers.nth(3)).toHaveValue('1320');
    // The manually entered value on row 2 must survive unchanged.
    await expect(row2Numbers.nth(1)).toHaveValue('42');

    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gespeichert.')).toBeVisible();
});

test('a saved settlement can be deleted, and its cost items are removed with it', async ({ page }) => {
    const targetYear = new Date().getFullYear() + 4;
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId}`);
    await navigateToYear(page, targetYear);

    await expect(page.getByRole('button', { name: 'Abrechnung löschen' })).toHaveCount(0);

    const deleteTestRow = page.locator('tbody tr').first();
    await deleteTestRow.locator('input[type="number"]').nth(0).fill('300');
    await deleteTestRow.locator('input[type="number"]').nth(1).fill('150');
    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    let settlementId: number;
    try {
        const { rows } = await client.query(
            `SELECT service_charge_settlement_id FROM service_charge_settlement
             WHERE property_id = $1 AND period_start = $2`,
            [propertyId, `${targetYear}-01-01`],
        );
        expect(rows).toHaveLength(1);
        settlementId = rows[0].service_charge_settlement_id as number;
    } finally {
        await client.end();
    }

    // Deleting must now be possible from the page for a saved settlement.
    await expect(page.getByRole('button', { name: 'Abrechnung löschen' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrechnung löschen' }).click();
    const confirmDialog = page.getByRole('dialog', { name: 'Abrechnung löschen?' });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('Nebenkostenabrechnung gelöscht.')).toBeVisible();

    // The page falls back to a fresh draft — no settlement loaded anymore.
    await expect(page.getByRole('button', { name: 'Abrechnung löschen' })).toHaveCount(0);

    const secondClient = new Client({ connectionString: requireDatabaseUrl() });
    await secondClient.connect();
    try {
        const { rows: settlementRows } = await secondClient.query(
            'SELECT service_charge_settlement_id FROM service_charge_settlement WHERE service_charge_settlement_id = $1',
            [settlementId],
        );
        expect(settlementRows).toHaveLength(0);
        // ON DELETE CASCADE must have taken the cost items with it.
        const { rows: costItemRows } = await secondClient.query(
            'SELECT service_charge_cost_item_id FROM service_charge_cost_item WHERE service_charge_settlement_id = $1',
            [settlementId],
        );
        expect(costItemRows).toHaveLength(0);
    } finally {
        await secondClient.end();
    }
});

test('an end date before the start date names the actual reason instead of a generic save error', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId}`);
    // force: true — the visible label sometimes still reports as
    // out-of-viewport right after navigation while the rest of the page
    // (units/tenancy fetch) is still settling; the switch itself is
    // otherwise a completely ordinary, always-clickable control.
    await page.getByRole('switch', { name: 'Individueller Zeitraum' }).click({ force: true });

    await page.getByRole('textbox', { name: 'Von' }).fill('01.01.2031');
    await page.getByRole('textbox', { name: 'Bis' }).fill('31.12.2030');
    await page.getByRole('button', { name: 'Abrechnung speichern' }).click();

    await expect(page.getByText('Das Enddatum liegt vor dem Startdatum')).toBeVisible();
    // Nothing must have been persisted for this (invalid) period.
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT 1 FROM service_charge_settlement WHERE property_id = $1 AND period_start = '2031-01-01'`,
            [propertyId],
        );
        expect(rows).toHaveLength(0);
    } finally {
        await client.end();
    }
});

test('leaving the page with unsaved changes (Zurück, breadcrumb) asks for confirmation', async ({ page }) => {
    const targetYear = new Date().getFullYear() + 6;
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId}`);
    await navigateToYear(page, targetYear);

    await page.locator('tbody tr').first().locator('input[type="number"]').first().fill('123');

    // "Zurück" must not navigate away silently.
    await page.getByRole('button', { name: 'Zurück' }).click();
    const dialog = page.getByRole('dialog', { name: 'Änderungen verwerfen?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`service-charge-settlement/${unitId}$`));

    // A breadcrumb link must be guarded the same way.
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Bestandsobjekte' }).click();
    const dialog2 = page.getByRole('dialog', { name: 'Änderungen verwerfen?' });
    await expect(dialog2).toBeVisible();
    await dialog2.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page).toHaveURL(/\/existing-properties$/);
});

test('a unit with no current tenant ("Unvermietet") shows neutral placeholders, not Nachzahlung/Guthaben wording', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/service-charge-settlement/${unitId2}`);

    // Not checking for the page title text itself here: it's "Nebenkostenabrechnung",
    // which is a substring of this spec's own STREET fixture constant
    // ("E2E Nebenkostenabrechnung-Straße"), so a generic getByText(...).first()
    // for it ambiguously matches the breadcrumb's address link instead of the
    // real page title. The assertions below are specific enough on their own.
    await expect(page.getByText('Kein Mieter zu diesem Zeitraum')).toBeVisible();
    await expect(page.getByText('Nachzahlung/Guthaben ohne Mieter nicht anwendbar')).toBeVisible();
    await expect(page.getByText(/eine Anpassung der Nebenkostenvorauszahlung ist erst nach Vermietung möglich/)).toBeVisible();
    // Must never claim there's a tenant to bill when there isn't one.
    await expect(page.getByText('Nachzahlung durch Mieter')).toHaveCount(0);
});
