import { Client } from 'pg';
import { expect, test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Steuerunterlagen (existing-properties/[propertyId]/tax-documents) — this
 * session's work on the feature: default categories seeded automatically,
 * categories kept in sync by name across every active property (add/rename/
 * delete all propagate), every row action moved into one "⋮" context menu at
 * the front of the row, a manual Vollständig/Unvollständig override per
 * category, and per-year browsing via the "Dieses Objekt · nach Jahr" cards
 * (the category table's Betrag/Belege are computed from that year's receipts,
 * not the category's own all-time running total).
 *
 * Category rows are located by position (default categories are always
 * seeded in DEFAULT_LABELS order), not by the label TextField's current
 * value — a React-controlled input's live value is a DOM property, not a
 * queryable attribute, and Playwright has no getByDisplayValue (that's a
 * Testing-Library method, not part of Playwright's API).
 *
 * Uses two properties owned by the bypass user (not the shared
 * fixtures/seed.ts fixture) so the cross-property sync/delete behavior has a
 * second, real property to verify against.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET_A = 'E2E Steuerunterlagen-Straße A';
const STREET_B = 'E2E Steuerunterlagen-Straße B';
const POSTAL_CODE = '00495';
const CITY = 'E2E Steuerunterlagen-Stadt';

const DEFAULT_LABELS = ['Fahrtkosten', 'Übernachtungskosten', 'Mahlzeiten', 'Spesen', 'Reparaturen', 'Sonderumlagen'];
const FAHRTKOSTEN_ROW = 0;
const MAHLZEITEN_ROW = 2;
const SONDERUMLAGEN_ROW = 5;
// Unique per run — the category sync propagates to every one of the bypass
// user's active properties (not just this file's A/B pair), so a fixed
// label would already exist everywhere by the second CI run and the "just
// synced" toast would never fire.
const customCategoryLabel = `Sonstiges Custom ${Date.now()}`;

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

// A minimal valid 1x1 PNG, for the "Beleg hinzufügen" file input.
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
let testFilePath: string;

let propertyIdA: number;
let propertyIdB: number;

test.beforeAll(async () => {
    testFilePath = path.join(os.tmpdir(), `e2e-tax-beleg-${Date.now()}.png`);
    fs.writeFileSync(testFilePath, Buffer.from(TEST_PNG_BASE64, 'base64'));

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);

        const propertyAResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 1)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET_A, CITY, POSTAL_CODE],
        );
        propertyIdA = propertyAResult.rows[0].property_id as number;
        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2) VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 60)`,
            [propertyIdA],
        );

        const propertyBResult = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '2', $3, $4, 2000, 1)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET_B, CITY, POSTAL_CODE],
        );
        propertyIdB = propertyBResult.rows[0].property_id as number;
        await client.query(
            `INSERT INTO property_unit (property_id, unit_label, sort_order, usage_type, living_area_m2) VALUES ($1, 'Whg. 1', 0, 'WOHNUNG', 50)`,
            [propertyIdB],
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
        // The custom category created below is synced by name to every one
        // of the bypass user's active properties, not just A/B — clean it up
        // everywhere it may have landed, or a later run finds it already
        // present on every other property and the sync becomes a no-op
        // (breaking the "was just added" toast assertion).
        await client.query('DELETE FROM tax_expense_category WHERE label = $1', [customCategoryLabel]);
        // ON DELETE CASCADE takes property_unit/tax_expense_category/tax_expense_document along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test('shows the default categories on first visit, and naming a newly added category syncs it to other properties', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyIdA}/tax-documents`);

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(DEFAULT_LABELS.length);
    for (let i = 0; i < DEFAULT_LABELS.length; i++) {
        await expect(rows.nth(i).getByRole('textbox')).toHaveValue(DEFAULT_LABELS[i]);
    }

    await page.getByRole('button', { name: 'Kategorie hinzufügen' }).click();
    await expect(rows).toHaveCount(DEFAULT_LABELS.length + 1);
    const newRow = rows.last();
    const nameInput = newRow.getByRole('textbox');
    await expect(nameInput).toHaveAttribute('placeholder', 'Neue Kategorie');
    await expect(nameInput).toHaveValue('');

    await nameInput.fill(customCategoryLabel);
    await nameInput.blur();
    // "Objekt" (1) vs "Objekten" (2+) — the whole "en" suffix is optional,
    // not just the trailing "n" (that previously required a literal "e"
    // before it, so it never matched the singular "Objekt" case).
    //
    // The toast only fires after persistLabel's own update finishes and
    // then, unawaited, syncCategoryToOtherProperties runs its own chain
    // (list other properties -> read each one's categories -> create the
    // missing one) — several sequential round trips against the real
    // hosted Supabase project, not a local DB, so this needs real headroom
    // in CI rather than the default 5s.
    await expect(page.getByText(new RegExp(`^Kategorie "${customCategoryLabel}" zu \\d+ weiteren Objekt(en)? hinzugefügt\\.$`))).toBeVisible({ timeout: 15000 });

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: dbRows } = await client.query(
            `SELECT 1 FROM tax_expense_category WHERE property_id = $1 AND label = $2`,
            [propertyIdB, customCategoryLabel],
        );
        expect(dbRows).toHaveLength(1);
    } finally {
        await client.end();
    }
});

test("uploading a receipt, marking a category complete, and deleting a category all work through the row's context menu, with cross-property delete", async ({ page }) => {
    // Seed property B's own defaults too, so the delete-sync check below has
    // a real row there to verify being removed. Not asserting an exact row
    // count or position here — the previous test's custom category now
    // really does sync onto B (that sync used to silently no-op, which is
    // exactly the bug fixed alongside this), and depending on which of the
    // two sync paths (this test's own direct sync vs. B's "brand new
    // property, adopt every other property's categories" bootstrap) wins
    // the race, it can land at any position in B's row list — checking
    // Sonderumlagen is present anywhere, not at a fixed index, is what's
    // actually stable here.
    await page.goto(`/existing-properties/${propertyIdB}/tax-documents`);
    // evaluateAll(...) is a one-shot read, not an auto-retrying assertion —
    // wrapped in toPass() so it tolerates the table still loading/bootstrapping
    // its rows right after navigation.
    await expect(async () => {
        const propertyBLabels = await page.locator('tbody tr').getByRole('textbox')
            .evaluateAll((inputs) => inputs.map((el) => (el as HTMLInputElement).value));
        expect(propertyBLabels).toContain('Sonderumlagen');
    }).toPass();

    await page.goto(`/existing-properties/${propertyIdA}/tax-documents`);
    const rows = page.locator('tbody tr');
    await expect(rows.nth(FAHRTKOSTEN_ROW).getByRole('textbox')).toHaveValue('Fahrtkosten');

    // ── Beleg hinzufügen, via the row's context menu ──────────────────────
    const fahrtkostenRow = rows.nth(FAHRTKOSTEN_ROW);
    await fahrtkostenRow.getByRole('button', { name: 'Weitere Aktionen' }).click();
    await page.getByRole('button', { name: 'Beleg hinzufügen' }).click();

    const uploadDialog = page.getByRole('dialog', { name: 'Beleg hinzufügen' });
    await expect(uploadDialog).toBeVisible();
    await uploadDialog.getByLabel('Betrag').fill('42');
    await page.setInputFiles('#tax-expense-document-upload', testFilePath);
    await uploadDialog.getByRole('button', { name: 'Hochladen' }).click();
    await expect(uploadDialog).not.toBeVisible();
    // Scoped to the Betrag column specifically — the freshly uploaded
    // receipt's own chip in the Belege column shows the same "42 €" text,
    // which would otherwise make this an ambiguous, strict-mode-violating match.
    await expect(fahrtkostenRow.locator('td').nth(2)).toHaveText('42 €');

    // ── Als vollständig markieren, then back to unvollständig ─────────────
    // The "reopen the same row's ⋮ menu right after using it" step has
    // proven unreliable in CI even with an explicit wait for the popover to
    // close first (Radix's open/close state machine, not a rendering bug —
    // the label reads correctly once reopened, the reopen itself is what's
    // flaky). Reloading between the two menu interactions sidesteps that
    // entirely: every popover open here is a fresh one, and it doubles as a
    // real assertion that the manual-complete flag actually persisted.
    const mahlzeitenRow = rows.nth(MAHLZEITEN_ROW);
    await expect(mahlzeitenRow.getByText('Beleg fehlt')).toBeVisible();
    await mahlzeitenRow.getByRole('button', { name: 'Weitere Aktionen' }).click();
    await page.getByRole('button', { name: 'Als vollständig markieren' }).click();
    await expect(mahlzeitenRow.getByText('Vollständig (manuell)')).toBeVisible();

    await page.reload();
    await expect(mahlzeitenRow.getByText('Vollständig (manuell)')).toBeVisible();
    await mahlzeitenRow.getByRole('button', { name: 'Weitere Aktionen' }).click();
    await page.getByRole('button', { name: 'Als unvollständig markieren' }).click();
    await expect(mahlzeitenRow.getByText('Beleg fehlt')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: uploadRows } = await client.query(
            `SELECT d.amount FROM tax_expense_document d JOIN tax_expense_category c ON c.tax_expense_category_id = d.tax_expense_category_id
             WHERE c.property_id = $1 AND c.label = 'Fahrtkosten'`,
            [propertyIdA],
        );
        expect(uploadRows).toHaveLength(1);
        expect(Number(uploadRows[0].amount)).toBe(42);

        const { rows: manuallyCompleteRows } = await client.query(
            `SELECT manually_complete FROM tax_expense_category WHERE property_id = $1 AND label = 'Mahlzeiten'`,
            [propertyIdA],
        );
        expect(manuallyCompleteRows[0].manually_complete).toBe(false);
    } finally {
        await client.end();
    }

    // ── Löschen, via the same context menu — must warn it deletes ─────────
    // everywhere, and actually does.
    const rowCountBeforeDelete = await rows.count();
    const sonderumlagenRow = rows.nth(SONDERUMLAGEN_ROW);
    await expect(sonderumlagenRow.getByRole('textbox')).toHaveValue('Sonderumlagen');
    await sonderumlagenRow.getByRole('button', { name: 'Weitere Aktionen' }).click();
    await page.getByRole('button', { name: 'Löschen' }).click();

    const deleteDialog = page.getByRole('dialog', { name: 'Kategorie löschen?' });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByText('wird auch bei allen anderen Bestandsobjekten gelöscht')).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Löschen' }).click();
    await expect(rows).toHaveCount(rowCountBeforeDelete - 1);
    // deleteCategoryOnOtherProperties runs fire-and-forget (not awaited by
    // confirmDeleteCategory) — the row disappearing above only confirms
    // property A's own delete landed, not the cross-property one. Waiting
    // for its own confirmation toast (fired only once the sync's delete on
    // every other property has actually completed) is what makes the DB
    // check below safe to run immediately after, instead of racing it.
    await expect(page.getByText(/^Kategorie in \d+ weiteren Objekt(en)? ebenfalls gelöscht\.$/)).toBeVisible({ timeout: 15000 });

    const client2 = new Client({ connectionString: requireDatabaseUrl() });
    await client2.connect();
    try {
        const { rows: remainingA } = await client2.query(
            `SELECT 1 FROM tax_expense_category WHERE property_id = $1 AND label = 'Sonderumlagen'`,
            [propertyIdA],
        );
        expect(remainingA).toHaveLength(0);
        const { rows: remainingB } = await client2.query(
            `SELECT 1 FROM tax_expense_category WHERE property_id = $1 AND label = 'Sonderumlagen'`,
            [propertyIdB],
        );
        expect(remainingB).toHaveLength(0);
    } finally {
        await client2.end();
    }
});

test('year cards reflect the selected year, and the Steuerübersicht link opens the cross-property overview', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyIdA}/tax-documents`);
    const rows = page.locator('tbody tr');
    await expect(rows.nth(FAHRTKOSTEN_ROW).getByRole('textbox')).toHaveValue('Fahrtkosten');

    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    // The UI has no way to backdate a receipt (uploads are always "now") —
    // insert one directly for a past year to exercise year switching.
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows: categoryRows } = await client.query(
            `SELECT tax_expense_category_id FROM tax_expense_category WHERE property_id = $1 AND label = 'Fahrtkosten'`,
            [propertyIdA],
        );
        await client.query(
            `INSERT INTO tax_expense_document (tax_expense_category_id, property_id, storage_path, file_name, amount, created_at)
             VALUES ($1, $2, 'e2e/dummy.pdf', 'AltBeleg.pdf', 77, $3)`,
            [categoryRows[0].tax_expense_category_id, propertyIdA, `${lastYear}-06-01`],
        );
    } finally {
        await client.end();
    }

    await page.reload();
    await expect(page.getByText(`Kostenkategorien ${currentYear}`)).toBeVisible();

    const lastYearCard = page.locator('button').filter({ hasText: String(lastYear) });
    await expect(lastYearCard).toBeVisible();
    await lastYearCard.click();

    await expect(page.getByText(`Kostenkategorien ${lastYear}`)).toBeVisible();
    // Scoped to the Betrag column — see the identical fix above.
    await expect(rows.nth(FAHRTKOSTEN_ROW).locator('td').nth(2)).toHaveText('77 €');
    // Every other category has no receipt in the backdated year.
    await expect(rows.nth(MAHLZEITEN_ROW).getByText('Beleg fehlt')).toBeVisible();

    const overviewLink = page.getByRole('link', { name: 'Steuerübersicht alle Objekte öffnen' });
    await expect(overviewLink).toBeVisible();
    await overviewLink.click();
    await expect(page).toHaveURL(/\/tax-overview$/);
    await expect(page.getByText('Alle Kosten und Unterlagen nach Steuerjahr und Objekt')).toBeVisible();
});
