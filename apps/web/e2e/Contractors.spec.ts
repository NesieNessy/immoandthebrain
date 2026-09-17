import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Handwerkerleistungen (existing-properties/[propertyId]/contractors) — the
 * renovation-measure list page and its per-measure detail page. Covers this
 * session's fixes: the customer-confirmation gate now also requires an
 * actual completion date (not just craftsman confirmation), clearing that
 * date resets the confirmation on both the list AND detail pages (they used
 * to disagree), only one quote can be accepted per measure (server-enforced,
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

test('adding a measure requires a title, and cost summary tiles reflect estimated/quoted/deviation', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    await expect(page.getByText('Noch keine Sanierungsmaßnahmen erfasst.')).toBeVisible();

    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Maßnahme hinzufügen' });
    const addButton = addDialog.getByRole('button', { name: 'Hinzufügen' });
    await expect(addButton).toBeDisabled();

    const titleA = `E2E Badsanierung ${Date.now()}`;
    await addDialog.getByLabel('Maßnahme').fill(titleA);
    await addDialog.getByLabel('Kosten veranschlagt (optional)').fill('3000');
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(addDialog).not.toBeVisible();

    const rowA = page.locator('tbody tr').filter({ hasText: titleA });
    await expect(rowA).toBeVisible();

    // A second, unquoted measure — proves totalEstimated sums every measure
    // while totalQuoted/deviation only count quoted ones.
    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    const titleB = `E2E Fenstersanierung ${Date.now()}`;
    await addDialog.getByLabel('Maßnahme').fill(titleB);
    await addDialog.getByLabel('Kosten veranschlagt (optional)').fill('2000');
    await addButton.click();
    await expect(addDialog).not.toBeVisible();

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

test('quote acceptance locks the measure and syncs quotedCost; switching quotes needs an unlock first', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    const title = `E2E Dachsanierung ${Date.now()}`;
    const addDialog = page.getByRole('dialog', { name: 'Maßnahme hinzufügen' });
    await addDialog.getByLabel('Maßnahme').fill(title);
    await addDialog.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(addDialog).not.toBeVisible();

    await page.locator('tbody tr').filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/contractors\/\d+$/);
    // The measure title is the last breadcrumb item — a plain styled <span>
    // in Header.tsx, not a semantic heading role. Header also renders the
    // breadcrumb twice (an aria-hidden/invisible spacer plus the real fixed
    // bar), so scope to the breadcrumb nav rather than a bare text search.
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByText(title)).toBeVisible();

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

    // ── Accept A: measure locks, quotedCost = 1000 ─────────────────────
    await page.getByRole('button', { name: 'Angebot A auswählen' }).click();
    await expect(page.getByLabel('Kosten lt. Angebot')).toHaveValue('1000');
    await expect(page.getByLabel('Kosten kalkuliert')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Angebot hinzufügen' })).not.toBeVisible();
    // Once locked, only the currently-accepted quote's own button stays
    // enabled (disabled={isLocked && !quote.accepted}) — B can't be
    // selected directly, by design: switching needs an explicit unlock first.
    await expect(page.getByRole('button', { name: 'Angebot B auswählen' })).toBeDisabled();

    // ── Unlock via the list page's "Beauftragt" toggle ─────────────────
    // (the only unlock control — the detail page's quote section offers
    // no way back out once a quote is accepted: delete is hidden while
    // locked, and B's own button is disabled as just verified above).
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    const listRow = page.locator('tbody tr').filter({ hasText: title });
    await listRow.getByRole('button', { name: `${title} als nicht beauftragt markieren` }).click();
    await expect(listRow.getByRole('button', { name: `${title} als beauftragt markieren` })).toBeVisible();

    await listRow.click();
    await expect(page.getByLabel('Kosten kalkuliert')).toBeEnabled();

    // ── Now accept B instead: the FE's own unaccept-others logic (client-
    // side, not the server's exclusiveBooleanOnUpdate — that's covered
    // directly, bypassing the FE, in the "server enforces" test below) ──
    await page.getByRole('button', { name: 'Angebot B auswählen' }).click();
    await expect(page.getByLabel('Kosten lt. Angebot')).toHaveValue('1500');
    await expect(page.getByRole('button', { name: 'Angebot A auswählen' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Angebot B auswählen' })).toHaveAttribute('aria-pressed', 'true');

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT company_name, accepted FROM renovation_measure_quote q
             JOIN renovation_measure m ON m.renovation_measure_id = q.renovation_measure_id
             WHERE m.property_id = $1 AND m.title = $2 ORDER BY company_name`,
            [propertyId, title],
        );
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.company_name === 'Handwerk A GmbH')?.accepted).toBe(false);
        expect(rows.find((r) => r.company_name === 'Handwerk B GmbH')?.accepted).toBe(true);

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

test('customer confirmation requires a completion date too, and clearing the date resets it on both pages', async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/contractors`);
    await page.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
    const title = `E2E Elektrik ${Date.now()}`;
    const addDialog = page.getByRole('dialog', { name: 'Maßnahme hinzufügen' });
    await addDialog.getByLabel('Maßnahme').fill(title);
    await addDialog.getByRole('button', { name: 'Hinzufügen' }).click();
    await expect(addDialog).not.toBeVisible();

    await page.locator('tbody tr').filter({ hasText: title }).click();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(title)).toBeVisible();

    // ── Mängel (defects): add and remove ────────────────────────────────
    await page.getByPlaceholder('Mangel beschreiben…').fill('Riss in der Wand');
    await page.getByRole('button', { name: 'Mangel hinzufügen' }).click();
    await expect(page.getByText('Riss in der Wand')).toBeVisible();
    await page.getByRole('button', { name: 'Mangel löschen' }).click();
    await page.getByRole('dialog', { name: 'Mangel löschen?' }).getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('Riss in der Wand')).not.toBeVisible();

    // Craftsman-confirmed alone isn't enough — no completion date yet.
    await page.getByRole('checkbox', { name: 'Handwerker bestätigt' }).click({ force: true });
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).toBeDisabled();

    await page.getByLabel('Abschluss ist').fill('01.06.2026');
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Kunde bestätigt' }).click({ force: true });
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).toBeChecked();

    // Clearing the completion date from the DETAIL page resets it (the bug: this used to only happen on the list page).
    await page.getByLabel('Abschluss ist').fill('');
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).toBeDisabled();

    // Re-confirm, then verify the LIST page's cascade too.
    await page.getByLabel('Abschluss ist').fill('01.06.2026');
    await page.getByRole('checkbox', { name: 'Kunde bestätigt' }).click({ force: true });
    await expect(page.getByRole('checkbox', { name: 'Kunde bestätigt' })).toBeChecked();

    await page.goto(`/existing-properties/${propertyId}/contractors`);
    const row = page.locator('tbody tr').filter({ hasText: title });
    await expect(row.getByRole('button', { name: `${title} als nicht abgeschlossen markieren` })).toBeVisible();

    await row.getByLabel(`Tatsächlicher Abschluss für ${title}`).fill('');
    await expect(row.getByRole('button', { name: `${title} als abgeschlossen bestätigen` })).toBeVisible();
    await expect(row.getByRole('button', { name: `${title} als abgeschlossen bestätigen` })).toBeDisabled();
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
