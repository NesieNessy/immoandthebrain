import { Client } from 'pg';
import { expect, Page, test } from '@playwright/test';

/**
 * Quick Check isn't part of the property/unit fixture —
 * unlike the other smoke tests, these create their own records through the
 * UI itself (create → save → reopen), since that's the actual flow under
 * test (the create form, the overview table, and the edit/detail view all
 * reading/writing the same quick_check row). Three distinctive postal codes
 * identify the rows created by this run without needing their ids:
 *   - PRIMARY (00420): create → read-back → edit/save, which is also the
 *     "Übernehmen" flow (see quick_check.supabase.ts) and therefore inserts
 *     a matching `property` row too — cleaned up alongside it.
 *   - DISCARD (00421): exercises every way to leave an edit unsaved.
 *   - SEARCH  (00422): a disposable row for the overview's search + delete.
 *
 * Unlike fixtures/seed.ts, this data isn't shared setup — it's created by
 * the tests themselves. Still needs the same delete-before-insert
 * idempotency though: without it, re-running this spec against a stack that
 * wasn't freshly `supabase db reset` (e.g. a local dev loop) would leave
 * multiple rows with the same postal code and break the getByText(POSTAL_CODE)
 * lookups (Playwright's strict mode rejects ambiguous matches).
 */
const STREET = 'E2E Ersteinschätzungsstraße 5';
const POSTAL_CODE = '00420';
const CITY = 'E2E Stadt';

const DISCARD_STREET = 'E2E Ersteinschätzung Verwerfen';
const DISCARD_POSTAL_CODE = '00421';
const DISCARD_CITY = 'E2E Stadt';

const SEARCH_STREET = 'E2E Ersteinschätzung Suchtreffer';
const SEARCH_POSTAL_CODE = '00422';
const SEARCH_CITY = 'E2E Stadt';

const ALL_POSTAL_CODES = [POSTAL_CODE, DISCARD_POSTAL_CODE, SEARCH_POSTAL_CODE];

/**
 * Both the overview table (desktop `<Table>` + mobile `renderMobileCard`)
 * and the Header component's page title render a mobile and a desktop copy
 * at the same time — CSS hides whichever doesn't match the viewport, but
 * both stay in the DOM, so a plain getByText() matches both and Playwright's
 * strict mode rejects the ambiguity. `.and(':visible')` narrows to the one
 * actually shown at the Desktop Chrome viewport this suite runs at.
 */
function visibleText(page: Page, text: string, options?: { exact?: boolean }) {
    return page.getByText(text, options).and(page.locator(':visible'));
}

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e quick-check DB checks.');
    return databaseUrl;
}

/** Fills the create/edit form's shared fields. Leaves street/city/portal alone. */
async function fillFinancials(page: Page, opts: {
    purchasePrice: string; coldRent: string; condition: string; yearOfConstruction: string;
}) {
    await page.getByLabel('Kaufpreis').fill(opts.purchasePrice);
    await page.getByLabel('Kaltmiete').fill(opts.coldRent);
    await page.getByLabel('Zustand').selectOption(opts.condition);
    await page.getByLabel('Baujahr').fill(opts.yearOfConstruction);
}

test.beforeAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM quick_check WHERE postal_code = ANY($1)', [ALL_POSTAL_CODES]);
        // The PRIMARY row's edit/save test accepts it (see quick_check.supabase.ts
        // acceptQuickCheck), which inserts a `property` row from the same street —
        // that's this suite's only source of `property` rows, so scoping the
        // cleanup to ALL_POSTAL_CODES is enough.
        await client.query('DELETE FROM property WHERE postal_code = ANY($1)', [ALL_POSTAL_CODES]);
    } finally {
        await client.end();
    }
});

// ---------------------------------------------------------------------------
// Create form validation — pure client-side checks on /new, nothing saved.
// ---------------------------------------------------------------------------

test.describe('Neue Ersteinschätzung – Validierung', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/property-valuation/quick-check/new');
    });

    test('an incomplete postal code is rejected and blocks saving', async ({ page }) => {
        await page.getByLabel('Postleitzahl').fill('123');
        await expect(page.getByText('Genau 5 Ziffern erforderlich')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ersteinschätzung speichern' })).toBeDisabled();
    });

    test('a purchase price of 0 is rejected', async ({ page }) => {
        await page.getByLabel('Kaufpreis').fill('0');
        await expect(page.getByText('Muss größer als 0 sein')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ersteinschätzung speichern' })).toBeDisabled();
    });

    test('a construction year before 1850 is rejected', async ({ page }) => {
        await page.getByLabel('Baujahr').fill('1700');
        await expect(page.getByText(`Zwischen 1850 und ${new Date().getFullYear()}`)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Ersteinschätzung speichern' })).toBeDisabled();
    });

    // Unlike the edit view (canShowResult only needs the financial fields —
    // see QuickCheckResultView's comment on legacy records with a missing
    // address), the NEW form's result panel needs street+city too because
    // isFormValid gates it, not the narrower financialsValid.
    test('the result panel stays hidden until street and city are filled too', async ({ page }) => {
        await fillFinancials(page, { purchasePrice: '450000', coldRent: '1200', condition: 'Standard', yearOfConstruction: '1995' });
        await page.getByLabel('Postleitzahl').fill('80331');

        await expect(page.getByText('Kein Ergebnis vorhanden')).toBeVisible();

        await page.getByLabel('Straße & Hausnummer').fill('Teststraße 1');
        await page.getByLabel('Stadt').fill('München');

        await expect(page.getByText('Kein Ergebnis vorhanden')).not.toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// PRIMARY row: create → list → navigate-to-detail-check → read-back →
// edit/save (which also accepts it into the Portfolio).
// ---------------------------------------------------------------------------

test('create a quick check and see it in the overview', async ({ page }) => {
    await page.goto('/property-valuation/quick-check');
    await page.getByRole('button', { name: 'Neue Ersteinschätzung' }).click();

    await expect(page).toHaveURL(/\/property-valuation\/quick-check\/new/);

    await page.getByLabel('Straße & Hausnummer').fill(STREET);
    await page.getByLabel('Postleitzahl').fill(POSTAL_CODE);
    await page.getByLabel('Stadt').fill(CITY);
    await fillFinancials(page, { purchasePrice: '450000', coldRent: '1200', condition: 'Standard', yearOfConstruction: '1995' });

    // All required fields filled -> the live KPF result panel replaces the
    // "no result yet" placeholder.
    await expect(page.getByText('Kein Ergebnis vorhanden')).not.toBeVisible();

    await page.getByRole('button', { name: 'Ersteinschätzung speichern' }).click();
    await expect(page.getByText('Ersteinschätzung gespeichert.')).toBeVisible();

    // Saving navigates back to the overview — the new row must show up there.
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);
    await expect(visibleText(page, POSTAL_CODE)).toBeVisible();
});

test('starting a detail check from the overview row menu navigates to the wizard', async ({ page }) => {
    await page.goto('/property-valuation/quick-check');

    const row = page.getByRole('row', { name: new RegExp(POSTAL_CODE) });
    await row.getByRole('button').click();
    await page.getByRole('button', { name: 'Detailbewertung starten' }).click();

    await expect(page).toHaveURL(/\/property-valuation\/detail-check\/property-data\?quickCheckId=\d+/);
});

test('opening a quick check row loads its data', async ({ page }) => {
    await page.goto('/property-valuation/quick-check');
    await visibleText(page, POSTAL_CODE).click();

    await expect(page).toHaveURL(/\/property-valuation\/quick-check\/\d+$/);

    // The breadcrumb's last crumb is the loaded record's street, and the
    // form is pre-filled from the same row — both must reflect what was
    // saved by the previous test, exercising the full read-back path
    // (useQuickCheckById -> edit form -> KPF recompute).
    await expect(visibleText(page, STREET, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Postleitzahl')).toHaveValue(POSTAL_CODE);
    await expect(page.getByLabel('Stadt')).toHaveValue(CITY);
});

test('opening a non-existent quick check shows Not Found, not a loading flash stuck open', async ({ page }) => {
    await page.goto('/property-valuation/quick-check/999999999');
    await expect(page.getByText('Ersteinschätzung nicht gefunden.')).toBeVisible();
});

test('editing and saving recomputes the KPF, persists the change, and accepts it into the Portfolio', async ({ page }) => {
    await page.goto('/property-valuation/quick-check');
    await visibleText(page, POSTAL_CODE).click();

    const saveButton = page.getByRole('button', { name: 'Ersteinschätzung speichern' });
    // Nothing changed yet since the record loaded -> save stays disabled.
    await expect(saveButton).toBeDisabled();

    // 450000 -> 500000 at the unchanged 1200 cold rent: 500000 / (1200*12) = 34.7222 -> 34.7.
    await page.getByLabel('Kaufpreis').fill('500000');
    await expect(page.getByText('34.7', { exact: true })).toBeVisible();
    await expect(saveButton).toBeEnabled();

    await saveButton.click();
    await expect(page.getByText('Ersteinschätzung gespeichert.')).toBeVisible();
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);

    await visibleText(page, POSTAL_CODE).click();
    await expect(page.getByLabel('Kaufpreis')).toHaveValue('500000');

    // "Ersteinschätzung speichern" on this view is handleTakeOver — it saves
    // AND calls acceptQuickCheck, which inserts a `property` row from the
    // quick_check's street/postal_code/city/year (see quick_check.supabase.ts).
    // That's the one meaningful side effect not visible from the UI alone.
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const result = await client.query(
            'SELECT property_id FROM property WHERE street = $1 AND postal_code = $2',
            [STREET, POSTAL_CODE],
        );
        expect(result.rowCount).toBe(1);
    } finally {
        await client.end();
    }
});

// ---------------------------------------------------------------------------
// DISCARD row: every way of leaving an edit unsaved must actually not save it.
// ---------------------------------------------------------------------------

test('discarding an edit — via the unsaved-changes modal or the back button — never persists it', async ({ page }) => {
    await page.goto('/property-valuation/quick-check/new');
    await page.getByLabel('Straße & Hausnummer').fill(DISCARD_STREET);
    await page.getByLabel('Postleitzahl').fill(DISCARD_POSTAL_CODE);
    await page.getByLabel('Stadt').fill(DISCARD_CITY);
    await fillFinancials(page, { purchasePrice: '300000', coldRent: '1250', condition: 'Standard', yearOfConstruction: '2000' });
    await page.getByRole('button', { name: 'Ersteinschätzung speichern' }).click();
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);

    await visibleText(page, DISCARD_POSTAL_CODE).click();

    // 1) Breadcrumb navigation while editing -> confirmation modal; "Abbrechen"
    //    keeps the edit and stays on the page (nothing lost, nothing saved yet).
    await page.getByLabel('Kaufpreis').fill('999999');
    await page.getByRole('link', { name: 'Ersteinschätzungen' }).click();
    await expect(page.getByText('Änderungen verwerfen?')).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByText('Änderungen verwerfen?')).not.toBeVisible();
    await expect(page.getByLabel('Kaufpreis')).toHaveValue('999999');
    await expect(page).toHaveURL(/\/property-valuation\/quick-check\/\d+$/);

    // 2) Same navigation, this time confirming "Verwerfen" -> leaves without
    //    saving (UnsavedChangesModal's onDiscard only navigates; it never
    //    calls the API — see quick_check.supabase.ts's actual discardQuickCheck).
    await page.getByRole('link', { name: 'Ersteinschätzungen' }).click();
    await page.getByRole('button', { name: 'Verwerfen' }).click();
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);

    await visibleText(page, DISCARD_POSTAL_CODE).click();
    await expect(page.getByLabel('Kaufpreis')).toHaveValue('300000');

    // 3) The sticky bar's "Zurück" button (handleDiscard) leaves immediately,
    //    with no confirmation modal — it also must not persist the edit.
    await page.getByLabel('Kaufpreis').fill('123456');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);

    await visibleText(page, DISCARD_POSTAL_CODE).click();
    await expect(page.getByLabel('Kaufpreis')).toHaveValue('300000');
});

// ---------------------------------------------------------------------------
// Overview: search filtering and row deletion.
// ---------------------------------------------------------------------------

test('search narrows the overview to matching rows, and a row can be deleted from its menu', async ({ page }) => {
    await page.goto('/property-valuation/quick-check/new');
    await page.getByLabel('Straße & Hausnummer').fill(SEARCH_STREET);
    await page.getByLabel('Postleitzahl').fill(SEARCH_POSTAL_CODE);
    await page.getByLabel('Stadt').fill(SEARCH_CITY);
    await fillFinancials(page, { purchasePrice: '350000', coldRent: '1300', condition: 'Standard', yearOfConstruction: '2005' });
    await page.getByRole('button', { name: 'Ersteinschätzung speichern' }).click();
    await expect(page).toHaveURL(/\/property-valuation\/quick-check$/);

    // Search matches portalId/postalCode/condition (see toEntry/allEntries'
    // filter in QuickCheckOverviewTable) — the distinctive postal code
    // isolates this row from the PRIMARY one created earlier in this file.
    const searchBox = page.getByPlaceholder('Suche nach Portal, PLZ, Zustand…');
    await searchBox.fill(SEARCH_POSTAL_CODE);
    await expect(visibleText(page, SEARCH_POSTAL_CODE)).toBeVisible();
    await expect(visibleText(page, POSTAL_CODE)).not.toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(SEARCH_POSTAL_CODE) });
    await row.getByRole('button').click();
    await page.getByRole('button', { name: 'Löschen' }).click();
    await expect(visibleText(page, SEARCH_POSTAL_CODE)).not.toBeVisible();

    // Clear the search — deletion must be real, not just filtered away.
    await searchBox.fill('');
    await expect(visibleText(page, SEARCH_POSTAL_CODE)).not.toBeVisible();
});
