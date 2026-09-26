import { Client } from 'pg';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Handwerkerleistungen (existing-properties/[propertyId]/contractors) — one
 * page: the add/edit form, "Erfasste Maßnahmen", and "Status & Beauftragung"
 * where a measure's panel holds its Angebote, Rückfragen and Mängel (old
 * per-measure links redirect there). Covers: the customer-confirmation gate
 * requires craftsman confirmation and an actual completion date, clearing
 * that date resets the confirmation, only one quote can be accepted per measure (server-enforced,
 * not just client-side), and a locked (quote-accepted) measure's protected
 * fields/delete are rejected server-side even via a direct API call.
 *
 * Rows are located by their (test-unique) title text rather than by
 * position — unlike the tax-documents default-category rows, nothing here
 * seeds a fixed row set, so there's no stable index to key off in the first
 * place.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Handwerker-Straße';
const POSTAL_CODE = '00470';
const CITY = 'E2E Handwerker-Stadt';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

let propertyId: number;

/**
 * Fills the add-measure dialog with a free-text measure ("Andere Maßnahme…")
 * rather than a catalog one — the tests key their rows off a unique title,
 * which catalog names can't provide.
 */
async function fillCustomMeasure(dialog: Locator, title: string) {
    await dialog.getByLabel('Kategorie').selectOption({ label: 'Sonstiges' });
    await dialog.getByLabel('Maßnahme').selectOption({ label: 'Andere Maßnahme…' });
    await dialog.getByLabel('Bezeichnung').fill(title);
}

test.beforeAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
        const result = await client.query(
            `INSERT INTO property (user_id, street, house_number, city, postal_code, year_of_construction, number_of_units)
             VALUES ($1, $2, '1', $3, $4, 2000, 1)
             RETURNING property_id`,
            [BYPASS_USER_ID, STREET, CITY, POSTAL_CODE],
        );
        propertyId = result.rows[0].property_id as number;
    } finally {
        await client.end();
    }
});

test.afterAll(async () => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        // ON DELETE CASCADE takes renovation_measure(_quote|_defect|_photo) along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test('adding a measure requires a Maßnahme, and cost summary tiles reflect estimated/quoted/deviation', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    await expect(page.getByText('Noch keine Sanierungsmaßnahmen erfasst.')).toBeVisible();

    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    // An inline form (like Sanierung), not a dialog.
    const addForm = page.getByRole('region', { name: 'Neue Maßnahme' });
    const addButton = addForm.getByRole('button', { name: 'Hinzufügen', exact: true });
    await expect(addButton).toBeDisabled();

    const titleA = `E2E Badsanierung ${Date.now()}`;
    await fillCustomMeasure(addForm, titleA);
    await addForm.getByLabel('Kosten veranschlagt (optional)').fill('3000');
    await expect(addButton).toBeEnabled();
    await addButton.click();

    // Each measure is a row in both tables ("Erfasste Maßnahmen" and
    // "Status & Beauftragung") — .first() is the one in the first table.
    const rowA = page.locator('tbody tr').filter({ hasText: titleA }).first();
    await expect(rowA).toBeVisible();

    // A second, unquoted measure — proves totalEstimated sums every measure
    // while totalQuoted/deviation only count quoted ones. The form stays open
    // and empty after adding, ready for the next one.
    await expect(addButton).toBeDisabled();
    const titleB = `E2E Fenstersanierung ${Date.now()}`;
    await fillCustomMeasure(addForm, titleB);
    await addForm.getByLabel('Kosten veranschlagt (optional)').fill('2000');
    await addButton.click();
    await expect(page.locator('tbody tr').filter({ hasText: titleB }).first()).toBeVisible();

    // Closed, so the tiles below are the only "Kosten veranschlagt" text left.
    await addForm.getByRole('button', { name: 'Formular schließen' }).click();
    await expect(addForm).not.toBeVisible();

    // Each summary tile is a flat <div> with two direct <p> children (label
    // + value), no nested divs — .last() on a hasText filter reliably
    // resolves to the tile itself rather than some ancestor wrapper.
    const estimatedTile = page.locator('div').filter({ hasText: /^Kosten veranschlagt/ }).last();
    await expect(estimatedTile.getByText('5.000 €')).toBeVisible();
    // Neither measure has a quotedCost yet — "Kosten lt. Angebot" and
    // "Abweichung" both still show the empty-state dash.
    const quotedTile = page.locator('div').filter({ hasText: /^Kosten lt\. Angebot/ }).last();
    await expect(quotedTile.getByText('–', { exact: true })).toBeVisible();
});

/** A measure's two rows: in "Erfasste Maßnahmen" (data) and "Status & Beauftragung" (status). */
function measureRows(page: Page, title: string) {
    const rows = page.locator('tbody tr').filter({ hasText: title });
    return { dataRow: rows.first(), statusRow: rows.last() };
}

/** "Bearbeiten" in the measure's ⋮ menu (a row click opens its details instead). */
async function openEditForm(page: Page, title: string) {
    await measureRows(page, title).dataRow.getByRole('button', { name: `Aktionen für ${title}` }).click();
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
}

async function addMeasure(page: Page, title: string) {
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    const addForm = page.getByRole('region', { name: 'Neue Maßnahme' });
    await fillCustomMeasure(addForm, title);
    await addForm.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
    await expect(measureRows(page, title).dataRow).toBeVisible();
    await addForm.getByRole('button', { name: 'Formular schließen' }).click();
}

test('quote acceptance locks the measure and syncs quotedCost; switching quotes needs an unlock first', async ({ page }) => {
    const title = `E2E Dachsanierung ${Date.now()}`;
    await addMeasure(page, title);
    const { dataRow, statusRow } = measureRows(page, title);

    // Everything on one page: a click on the measure in "Status &
    // Beauftragung" opens its Angebote, Rückfragen and Mängel below it.
    await statusRow.getByText(title, { exact: true }).click();

    // ── Add two quotes ──────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Angebot hinzufügen' }).click();
    const quoteDialog = page.getByRole('dialog', { name: 'Angebot hinzufügen' });
    await quoteDialog.getByLabel('Firma').fill('Handwerk A GmbH');
    await quoteDialog.getByLabel('Kosten lt. Angebot (optional)').fill('1000');
    await quoteDialog.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(quoteDialog).not.toBeVisible();
    await expect(page.getByText('Angebot A – Handwerk A GmbH')).toBeVisible();

    await page.getByRole('button', { name: 'Angebot hinzufügen' }).click();
    await quoteDialog.getByLabel('Firma').fill('Handwerk B GmbH');
    await quoteDialog.getByLabel('Kosten lt. Angebot (optional)').fill('1500');
    await quoteDialog.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(quoteDialog).not.toBeVisible();
    await expect(page.getByText('Angebot B – Handwerk B GmbH')).toBeVisible();

    // ── Accept A: measure is commissioned and locked, quotedCost = 1000 ──
    await page.getByRole('button', { name: 'Angebot A auswählen' }).click();
    await expect(statusRow.getByRole('img', { name: `${title} beauftragt` })).toBeVisible();
    await expect(dataRow.getByText('1.000 €')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Angebot hinzufügen' })).not.toBeVisible();
    // B can't be chosen directly while locked — switching needs an unlock first.
    await expect(page.getByRole('button', { name: 'Angebot B auswählen' })).toBeDisabled();

    // The locked fields can't be changed in the edit form either.
    await openEditForm(page, title);
    const editForm = page.getByRole('region', { name: 'Maßnahme bearbeiten' });
    await expect(editForm.getByLabel('Kosten veranschlagt (optional)')).toBeDisabled();
    await editForm.getByRole('button', { name: 'Formular schließen' }).click();

    // ── Unlock in the panel ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Beauftragung aufheben' }).click();
    await expect(statusRow.getByRole('img', { name: `${title} nicht beauftragt` })).toBeVisible();

    // ── Now accept B instead: the FE's own unaccept-others logic (client-
    // side, not the server's exclusiveBooleanOnUpdate — that's covered
    // directly, bypassing the FE, in the "server enforces" test below) ──
    await page.getByRole('button', { name: 'Angebot B auswählen' }).click();
    await expect(dataRow.getByText('1.500 €')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Angebot A auswählen' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Angebot B auswählen' })).toHaveAttribute('aria-pressed', 'true');

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        await expect.poll(async () => {
            const { rows } = await client.query(
                `SELECT company_name, accepted FROM renovation_measure_quote q
                 JOIN renovation_measure m ON m.renovation_measure_id = q.renovation_measure_id
                 WHERE m.property_id = $1 AND m.title = $2 ORDER BY company_name`,
                [propertyId, title],
            );
            return rows.map((r) => `${r.company_name}:${r.accepted}`).join(',');
        }).toBe('Handwerk A GmbH:false,Handwerk B GmbH:true');

        const { rows: measureRows } = await client.query(
            `SELECT quote_accepted, quoted_cost FROM renovation_measure WHERE property_id = $1 AND title = $2`,
            [propertyId, title],
        );
        expect(measureRows[0].quote_accepted).toBe(true);
        expect(Number(measureRows[0].quoted_cost)).toBe(1500);
    } finally {
        await client.end();
    }
});

test('customer confirmation requires craftsman confirmation and a completion date; clearing the date resets it', async ({ page }) => {
    const title = `E2E Elektrik ${Date.now()}`;
    await addMeasure(page, title);
    const { dataRow, statusRow } = measureRows(page, title);

    // ── Mängel (defects) in the measure's panel: add and remove ─────────
    await statusRow.getByText(title, { exact: true }).click();
    await page.getByPlaceholder('Mangel beschreiben…').fill('Riss in der Wand');
    await page.getByRole('button', { name: 'Mangel hinzufügen' }).click();
    await expect(page.getByText('Riss in der Wand')).toBeVisible();
    await page.getByRole('button', { name: 'Mangel löschen' }).click();
    await page.getByRole('dialog', { name: 'Mangel löschen?' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('Riss in der Wand')).not.toBeVisible();

    // Craftsman-confirmed alone isn't enough — no completion date yet.
    await statusRow.getByRole('button', { name: `${title}: vom Handwerker bestätigt` }).click();
    await expect(statusRow.getByRole('button', { name: `${title} als abgeschlossen bestätigen` })).toBeDisabled();

    // The completion date is set in the edit form ("Bearbeiten").
    // CalendarField's "Kalender öffnen" button also carries the label, so
    // scope to role=textbox.
    const setCompletionDate = async (value: string) => {
        await openEditForm(page, title);
        const editForm = page.getByRole('region', { name: 'Maßnahme bearbeiten' });
        await editForm.getByRole('textbox', { name: 'Abschluss ist' }).fill(value);
        await editForm.getByRole('button', { name: 'Übernehmen' }).click();
        await expect(editForm).not.toBeVisible();
    };

    await setCompletionDate('01.06.2026');
    await expect(dataRow.getByText('01.06.2026')).toBeVisible();
    await statusRow.getByRole('button', { name: `${title} als abgeschlossen bestätigen` }).click();
    await expect(statusRow.getByRole('button', { name: `${title} als nicht abgeschlossen markieren` })).toBeVisible();

    // Clearing the completion date resets the customer confirmation.
    await setCompletionDate('');
    await expect(statusRow.getByRole('button', { name: `${title} als abgeschlossen bestätigen` })).toBeDisabled();

    // Costs and dates are read-only in the table — changed in the form only.
    await expect(dataRow.getByRole('textbox')).toHaveCount(0);
});

test('an old measure link opens the measure on the Handwerkerleistungen page', async ({ page }) => {
    const title = `E2E Altlink ${Date.now()}`;
    await addMeasure(page, title);
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    let measureId: number;
    try {
        const { rows } = await client.query('SELECT renovation_measure_id FROM renovation_measure WHERE property_id = $1 AND title = $2', [propertyId, title]);
        measureId = rows[0].renovation_measure_id as number;
    } finally {
        await client.end();
    }
    await page.goto(`/existing-properties/${propertyId}/contractors/${measureId}`);
    await expect(page).toHaveURL(new RegExp(`/contractors\\?measure=${measureId}$`));
    await expect(page.getByRole('button', { name: 'Angebot hinzufügen' })).toBeVisible();
});

test('a locked measure rejects edits to protected fields and deletion via a direct API call', async ({ request }) => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    let measureId: number;
    try {
        const { rows } = await client.query(
            `INSERT INTO renovation_measure (property_id, title, quote_accepted, estimated_cost)
             VALUES ($1, $2, true, 1000) RETURNING renovation_measure_id`,
            [propertyId, `E2E Gesperrt ${Date.now()}`],
        );
        measureId = rows[0].renovation_measure_id as number;
    } finally {
        await client.end();
    }

    // No auth header needed — the app's own bypass-mode short-circuit
    // (isAuthBypassEnabled()) resolves the request to the bypass user
    // before it ever looks at Authorization, same as every page load here.
    const lockedPatch = await request.fetch('/api/property-resources/renovation-measures', {
        method: 'PATCH',
        data: { id: measureId, values: { estimated_cost: 9999 } },
        failOnStatusCode: false,
    });
    expect(lockedPatch.status()).toBe(409);

    const lockedDelete = await request.fetch(`/api/property-resources/renovation-measures?id=${measureId}`, {
        method: 'DELETE',
        failOnStatusCode: false,
    });
    expect(lockedDelete.status()).toBe(409);

    const client2 = new Client({ connectionString: requireDatabaseUrl() });
    await client2.connect();
    try {
        const { rows } = await client2.query(
            'SELECT estimated_cost FROM renovation_measure WHERE renovation_measure_id = $1',
            [measureId],
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].estimated_cost)).toBe(1000);
    } finally {
        await client2.end();
    }

    // customer_confirmed_completed stays editable even while locked —
    // unlocking a measure has no bearing on this field, it's the one
    // exception the DB comment calls out explicitly.
    const unlockedFieldPatch = await request.fetch('/api/property-resources/renovation-measures', {
        method: 'PATCH',
        data: { id: measureId, values: { customer_confirmed_completed: true } },
        failOnStatusCode: false,
    });
    expect(unlockedFieldPatch.status()).toBe(200);
});

test('the server unaccepts a sibling quote even when the client skips the FE\'s own sequencing', async ({ request }) => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    let measureId: number;
    let quoteAId: number;
    let quoteBId: number;
    try {
        await client.connect();
        const { rows: measureRows } = await client.query(
            `INSERT INTO renovation_measure (property_id, title) VALUES ($1, $2) RETURNING renovation_measure_id`,
            [propertyId, `E2E Exklusiv ${Date.now()}`],
        );
        measureId = measureRows[0].renovation_measure_id as number;
        const { rows: quoteRows } = await client.query(
            `INSERT INTO renovation_measure_quote (renovation_measure_id, property_id, company_name, accepted)
             VALUES ($1, $2, 'Handwerk A GmbH', true), ($1, $2, 'Handwerk B GmbH', false)
             RETURNING renovation_measure_quote_id, company_name`,
            [measureId, propertyId],
        );
        quoteAId = quoteRows.find((r) => r.company_name === 'Handwerk A GmbH').renovation_measure_quote_id as number;
        quoteBId = quoteRows.find((r) => r.company_name === 'Handwerk B GmbH').renovation_measure_quote_id as number;
    } finally {
        await client.end();
    }

    // A single direct PATCH accepting B — never touches A at all. The
    // server (exclusiveBooleanOnUpdate on renovation-measure-quotes) has to
    // unaccept A on its own; nothing here does it client-side.
    const response = await request.fetch('/api/property-resources/renovation-measure-quotes', {
        method: 'PATCH',
        data: { id: quoteBId, values: { accepted: true } },
        failOnStatusCode: false,
    });
    expect(response.ok()).toBe(true);

    const client2 = new Client({ connectionString: requireDatabaseUrl() });
    await client2.connect();
    try {
        const { rows } = await client2.query(
            `SELECT renovation_measure_quote_id, accepted FROM renovation_measure_quote WHERE renovation_measure_quote_id IN ($1, $2)`,
            [quoteAId, quoteBId],
        );
        expect(rows.find((r) => r.renovation_measure_quote_id === quoteAId)?.accepted).toBe(false);
        expect(rows.find((r) => r.renovation_measure_quote_id === quoteBId)?.accepted).toBe(true);
    } finally {
        await client2.end();
    }
});
