import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';
import { computeRemainingUsefulLife, MODERNIZATION_FIELDS, type ModernizationSelections } from '../src/lib/detailCheck/depreciation';

/**
 * Detailbewertung, steps Objektdaten → Sanierung — walked through twice, once
 * for each way a detail check can start:
 *
 *  - "mit Ersteinschätzung": from a quick check (?quickCheckId=…). Address,
 *    year, purchase price and cold rent are taken over from it; its rows live
 *    under workflow_id "quick-check:<id>".
 *  - "ohne Ersteinschätzung": via "Neue Detailbewertung" on the overview
 *    (?new=true). Everything is entered by hand; the first save mints a fresh
 *    "detail-check:<uuid>" workflow that every later step must carry along
 *    (?workflowId=…).
 *
 * Both flows use the same property values, so they must arrive at the same
 * amounts — the steps below are shared and only differ where a value is
 * pre-filled vs. typed in.
 *
 * Within a flow the steps build on each other (Kaufkosten reads the living
 * area from Objektdaten, Finanzierung the costs from Kaufkosten, …), so each
 * flow runs serially and every test continues where the previous one left off.
 *
 * Expected amounts (München, 80331 → Bayern: Makler 3,57 %, Notar 1,5 %,
 * Grundbuch 0,5 %, Grunderwerbsteuer 3,5 %) for a purchase price of 300.000 €:
 * Makler 10.710 · Notar 4.500 · Grundbuch 1.500 · GrESt 10.500
 * → Nebenkosten 27.210 → Gesamtkosten 327.210.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const POSTAL_CODE = '80331';
const CITY = 'München';
const YEAR_OF_CONSTRUCTION = 1995;
const PURCHASE_PRICE = 300000;
const COLD_RENT = 900;

const DETAIL_CHECK_TABLES = [
    'detail_check_property_data',
    'detail_check_acquisition_costs',
    'detail_check_rental',
    'detail_check_financing',
    'detail_check_depreciation',
    'detail_check_renovation',
] as const;
type DetailCheckTable = (typeof DETAIL_CHECK_TABLES)[number];

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e detail-check DB checks.');
    return databaseUrl;
}

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        return await run(client);
    } finally {
        await client.end();
    }
}

/**
 * Removes everything a flow created, found by its distinctive street. Detail-
 * check rows are *not* cascade-deleted with a quick check (ON DELETE SET NULL),
 * and a standalone workflow has no quick check at all — so its workflow ids
 * are collected from both places.
 */
async function removeFixture(street: string) {
    await withDb(async (client) => {
        const fromQuickChecks = await client.query('SELECT quick_check_id FROM quick_check WHERE street = $1', [street]);
        const fromPropertyData = await client.query('SELECT workflow_id FROM detail_check_property_data WHERE street_house_number = $1', [street]);
        const workflowIds = [
            ...fromQuickChecks.rows.map((row) => `quick-check:${row.quick_check_id}`),
            ...fromPropertyData.rows.map((row) => row.workflow_id as string),
        ];
        for (const table of DETAIL_CHECK_TABLES) {
            await client.query(`DELETE FROM ${table} WHERE workflow_id = ANY($1)`, [workflowIds]);
        }
        // Test documents are metadata only (no file in storage), marked by their path.
        await client.query('DELETE FROM document WHERE storage_path LIKE $1', [`${documentPathPrefix(street)}%`]);
        await client.query('DELETE FROM quick_check WHERE street = $1', [street]);
    });
}

function documentPathPrefix(street: string): string {
    return `e2e-detail-check/${encodeURIComponent(street)}/`;
}

interface Flow {
    title: string;
    street: string;
    fromQuickCheck: boolean;
    /** Known after setup (quick check) or after the first save (standalone). */
    query: string;
    workflowId: string;
}

function detailCheckSteps(flow: Flow) {
    test.describe(`Detailbewertung ${flow.title}`, () => {
        test.describe.configure({ mode: 'serial' });

        const goToStep = (page: Page, path: string) => page.goto(`/property-valuation/detail-check/${path}?${flow.query}`);

        const savedRow = (table: DetailCheckTable) => withDb(async (client) => {
            const { rows } = await client.query(`SELECT * FROM ${table} WHERE workflow_id = $1`, [flow.workflowId]);
            return rows[0] ?? null;
        });

        type SavedCase = { massnahme: string; cost_selected?: number; ai?: { price_min: number; price_max: number } };
        const savedRenovationCases = async (): Promise<SavedCase[]> => ((await savedRow('detail_check_renovation'))?.cases ?? []) as SavedCase[];

        /** Every step's row belongs to this flow's origin: its quick check, or none. */
        const expectOrigin = (row: { quick_check_id: number | null } | null) => {
            if (flow.fromQuickCheck) expect(row?.quick_check_id).not.toBeNull();
            else expect(row?.quick_check_id).toBeNull();
        };

        test.beforeAll(async () => {
            await removeFixture(flow.street);
            if (!flow.fromQuickCheck) return;
            const quickCheckId = await withDb(async (client) => {
                const { rows } = await client.query(
                    `INSERT INTO quick_check (user_id, data_entry_source, purchase_price, cold_rent, street, postal_code, city, year_of_construction, condition, kpf_multiplier)
                     VALUES ($1, 'MANUELL', $2, $3, $4, $5, $6, $7, 'Standard', 27.8)
                     RETURNING quick_check_id`,
                    [BYPASS_USER_ID, PURCHASE_PRICE, COLD_RENT, flow.street, POSTAL_CODE, CITY, YEAR_OF_CONSTRUCTION],
                );
                return rows[0].quick_check_id as number;
            });
            flow.query = `quickCheckId=${quickCheckId}`;
            flow.workflowId = `quick-check:${quickCheckId}`;
        });

        test.afterAll(async () => {
            await removeFixture(flow.street);
        });

        // ── Step 1 — Objektdaten ────────────────────────────────────────────
        test('Objektdaten: requires a plausible living area and saves', async ({ page }) => {
            const next = page.getByRole('button', { name: 'Weiter' });
            // exact: a substring match on "Ort" would also hit "P-ort-al…".
            const city = page.getByLabel('Ort', { exact: true });

            if (flow.fromQuickCheck) {
                await goToStep(page, 'property-data');
                // Address and year come over from the quick check.
                await expect(page.getByLabel('Straße + Hausnummer')).toHaveValue(flow.street);
                await expect(page.getByLabel('Postleitzahl')).toHaveValue(POSTAL_CODE);
                await expect(city).toHaveValue(CITY);
                await expect(page.getByLabel('Baujahr')).toHaveValue(String(YEAR_OF_CONSTRUCTION));
            } else {
                await page.goto('/property-valuation/detail-check');
                await page.getByRole('link', { name: 'Neue Detailbewertung' }).click();
                await expect(page).toHaveURL(/\/detail-check\/property-data\?new=true/);
                // A new detail check starts blank.
                await expect(page.getByLabel('Straße + Hausnummer')).toHaveValue('');
                await expect(next).toBeDisabled();
                await page.getByLabel('Straße + Hausnummer').fill(flow.street);
                await page.getByLabel('Postleitzahl').fill(POSTAL_CODE);
                await city.fill(CITY);
                await page.getByLabel('Baujahr').fill(String(YEAR_OF_CONSTRUCTION));
            }

            // The living area is never pre-filled — "Weiter" waits for a plausible one.
            await expect(next).toBeDisabled();
            await page.getByLabel('Wohnfläche').fill('0');
            await expect(page.getByText('Wohnfläche muss größer als 0 und maximal 10.000 sein.')).toBeVisible();
            await expect(next).toBeDisabled();

            await page.getByLabel('Wohnfläche').fill('75');
            await expect(city).toHaveValue(CITY);
            await expect(next).toBeEnabled();
            await next.click();

            if (flow.fromQuickCheck) {
                await expect(page).toHaveURL(/\/detail-check\/acquisition-costs\?quickCheckId=\d+$/);
            } else {
                // The first save minted a fresh workflow, carried on in the URL.
                await expect(page).toHaveURL(/\/detail-check\/acquisition-costs\?workflowId=detail-check%3A[0-9a-f-]{36}$/);
                flow.workflowId = new URL(page.url()).searchParams.get('workflowId') as string;
                flow.query = `workflowId=${encodeURIComponent(flow.workflowId)}`;
            }

            const saved = await savedRow('detail_check_property_data');
            expect(Number(saved?.living_area_m2)).toBe(75);
            expect(saved?.postal_code).toBe(POSTAL_CODE);
            expect(saved?.street_house_number).toBe(flow.street);
            expectOrigin(saved);
        });

        // ── Step 2 — Kaufkosten ─────────────────────────────────────────────
        test('Kaufkosten: computes every Nebenkosten position from the Bavarian rates and blocks an implausible broker fee', async ({ page }) => {
            await goToStep(page, 'acquisition-costs');

            const purchasePrice = page.getByLabel('Kaufpreis', { exact: true });
            const next = page.getByRole('button', { name: 'Weiter' });
            if (flow.fromQuickCheck) {
                await expect(purchasePrice).toHaveValue('300.000');
            } else {
                // No Ersteinschätzung to take a price over from: the field starts
                // empty, and a price above 0 is required before "Weiter".
                await expect(purchasePrice).toHaveValue('');
                await expect(next).toBeDisabled();
                await purchasePrice.fill('0');
                await expect(page.getByText('Bitte einen Kaufpreis größer als 0 € eingeben', { exact: false })).toBeVisible();
                await expect(next).toBeDisabled();
                await purchasePrice.fill(String(PURCHASE_PRICE));
            }
            // No parking spaces were recorded in Objektdaten — nothing to price.
            await expect(page.getByLabel('Kaufpreis Stellplatz')).toBeDisabled();

            for (const amount of ['4.000,00', '10.710,00', '4.500,00', '1.500,00', '10.500,00', '27.210,00', '327.210,00']) {
                await expect(page.getByText(amount, { exact: true })).toBeVisible();
            }

            await page.getByLabel('Makler', { exact: true }).fill('25');
            await expect(page.getByText('Bitte einen Prozentsatz zwischen 0 und 20 eingeben.')).toBeVisible();
            await expect(next).toBeDisabled();

            await page.getByLabel('Makler', { exact: true }).fill('3,57');
            await expect(next).toBeEnabled();
            await next.click();
            await expect(page).toHaveURL(new RegExp(`/detail-check/leasing-or-rentals\\?${escapeRegExp(flow.query)}$`));

            const saved = await savedRow('detail_check_acquisition_costs');
            expect(saved?.state).toBe('BY');
            expect(Number(saved?.total_costs)).toBe(327210);
            expectOrigin(saved);
        });

        // ── Step 3 — Vermietung ─────────────────────────────────────────────
        test('Vermietung: saves the cold rent and sums the Nebenkosten parts into the total', async ({ page }) => {
            await goToStep(page, 'leasing-or-rentals');

            const coldRent = page.getByLabel('Kaltmiete');
            if (flow.fromQuickCheck) {
                await expect(coldRent).toHaveValue('900');
            } else {
                await expect(coldRent).toHaveValue('');
                await coldRent.fill(String(COLD_RENT));
            }
            await expect(page.getByLabel('Stellplatz')).toBeDisabled();
            // Available with and without a quick check.
            await expect(page.getByRole('button', { name: 'Nebenkostenabrechnung hochladen' })).toBeEnabled();

            await page.getByLabel('NK umlagefähig').fill('150');
            await page.getByLabel('NK nicht umlagefähig').fill('50');
            await expect(page.getByLabel('NK gesamt')).toHaveValue('200');

            await page.getByRole('button', { name: 'Weiter' }).click();
            await expect(page).toHaveURL(new RegExp(`/detail-check/financing\\?${escapeRegExp(flow.query)}$`));

            const saved = await savedRow('detail_check_rental');
            expect(Number(saved?.cold_rent)).toBe(COLD_RENT);
            expect(Number(saved?.service_charges_allocable)).toBe(150);
            expect(Number(saved?.service_charges_total)).toBe(200);
            expectOrigin(saved);
        });

        // ── Step 4 — Finanzierung ───────────────────────────────────────────
        test('Finanzierung: carries the Kaufkosten over and derives the loan from the equity', async ({ page }) => {
            await goToStep(page, 'financing');

            await expect(page.getByRole('group', { name: 'Kaufpreis (Angebot)' })).toContainText('300.000,00');
            await expect(page.getByRole('group', { name: 'Kaufnebenkosten gesamt (Angebot)' })).toContainText('27.210,00');
            await expect(page.getByRole('group', { name: 'Ermittelte Gesamtkosten (Angebot)' })).toContainText('327.210,00');

            const equity = page.getByRole('textbox', { name: 'Anteil Eigenkapital (Angebot)' });
            await equity.fill('60000');
            await equity.blur();
            await expect(page.getByRole('group', { name: 'Darlehenssumme (Angebot)' })).toContainText('267.210,00');
            await expect(page.getByRole('group', { name: 'Darlehensquote (Angebot)' })).toContainText('81,66');

            const next = page.getByRole('button', { name: 'Weiter' });
            await page.getByLabel('Tilgungssatz p.a.').fill('25');
            await expect(page.getByText('Bitte einen Tilgungssatz zwischen 0 und 20 % eingeben.')).toBeVisible();
            await expect(next).toBeDisabled();
            await page.getByLabel('Tilgungssatz p.a.').fill('2');

            await next.click();
            await expect(page).toHaveURL(new RegExp(`/detail-check/depreciation\\?${escapeRegExp(flow.query)}$`));

            const saved = await savedRow('detail_check_financing');
            expect(Number(saved?.offer_equity)).toBe(60000);
            expect(saved?.selected_variant).toBe('OFFER');
            expectOrigin(saved);
        });

        // ── Step 5 — Restnutzungsdauer ──────────────────────────────────────
        test('Restnutzungsdauer: standard is 50 years; the individual one is computed once every modernisation is answered', async ({ page }) => {
            await goToStep(page, 'depreciation');

            await expect(page.getByRole('button', { name: 'Standard (50 Jahre)' })).toHaveAttribute('aria-pressed', 'true');
            await expect(page.getByText('50 Jahre', { exact: true })).toBeVisible();

            await page.getByRole('button', { name: 'Individuell prüfen' }).click();
            await expect(page.getByText('Bitte zunächst alle Modernisierungsangaben auswählen.')).toBeVisible();

            for (const [, label] of MODERNIZATION_FIELDS) {
                await page.getByLabel(`${label} – zuletzt erneuert`).selectOption({ label: '> 20 Jahre' });
            }
            const expected = computeRemainingUsefulLife({
                category: 'EIGENTUMSWOHNUNG',
                yearOfConstruction: YEAR_OF_CONSTRUCTION,
                selections: Object.fromEntries(MODERNIZATION_FIELDS.map(([field]) => [field, 'GT_20'])) as ModernizationSelections,
            });
            const years = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(expected.remainingUsefulLifeYears);
            await expect(page.getByText(`${years} Jahre`, { exact: true })).toBeVisible();

            await page.getByRole('button', { name: 'Weiter' }).click();
            await expect(page).toHaveURL(new RegExp(`/detail-check/renovation\\?${escapeRegExp(flow.query)}$`));

            const saved = await savedRow('detail_check_depreciation');
            expect(saved?.depreciation_mode).toBe('INDIVIDUAL');
            expect(Number(saved?.remaining_useful_life_years)).toBe(expected.remainingUsefulLifeYears);
            expectOrigin(saved);
        });

        // ── Step 6 — Sanierung ──────────────────────────────────────────────
        test('Sanierung: add → autosave → edit → evaluate & set the price by hand → delete', async ({ page }) => {
            await goToStep(page, 'renovation');

            // Nothing captured yet: the form is open and "Überspringen" is possible.
            await expect(page.getByText('Neue Modernisierung')).toBeVisible();
            await expect(page.getByRole('button', { name: 'Überspringen' })).toBeEnabled();

            // ── Add — the KI-Preisindikation shows before the measure is added ──
            await page.getByLabel('Kategorie').selectOption({ label: 'Sanitär' });
            await page.getByLabel('Maßnahme').selectOption({ label: 'Badsanierung komplett' });
            await expect(page.getByText('KI-Preisindikation')).toBeVisible();
            const description = 'Wanne undicht, Fliesen im Bad gesprungen – komplette Erneuerung inklusive Leitungen geplant.';
            await page.getByLabel('Beschreibung').fill(description);
            await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();

            const row = page.locator('tbody tr').filter({ hasText: 'Badsanierung komplett' });
            await expect(row).toBeVisible();
            await expect(row.getByText(description)).toBeVisible(); // shown in full, not truncated
            await expect(page.getByRole('button', { name: 'Überspringen' })).toBeDisabled();

            // Autosaved without pressing anything — into this flow's workflow.
            await expect.poll(async () => (await savedRenovationCases()).map((item) => item.massnahme)).toEqual(['Badsanierung komplett']);
            expectOrigin(await savedRow('detail_check_renovation'));
            // The page header is rendered twice (an invisible layout spacer plus
            // the real one), so the save indicator exists twice — check the visible one.
            await expect(page.getByText('Gespeichert', { exact: true }).and(page.locator(':visible'))).toBeVisible();

            // ── Edit via the row's action menu ──
            await page.getByRole('button', { name: 'Aktionen für Badsanierung komplett' }).click();
            await page.getByRole('button', { name: 'Bearbeiten' }).click();
            await expect(page.getByText('Modernisierung bearbeiten')).toBeVisible();
            await page.getByLabel('Maßnahme').selectOption({ label: 'Wassersparende Armaturen' });
            await page.getByRole('button', { name: 'Übernehmen' }).click();
            await expect(page.locator('tbody tr').filter({ hasText: 'Wassersparende Armaturen' })).toBeVisible();
            await expect.poll(async () => (await savedRenovationCases()).map((item) => item.massnahme)).toEqual(['Wassersparende Armaturen']);

            // ── Evaluate, then set the price by hand (kept within the range) ──
            await expect(page.getByText('Auswertung & Planung')).not.toBeVisible();
            await page.getByRole('button', { name: 'Auswertung prüfen & anpassen' }).click();
            await expect(page.getByText('Auswertung & Planung')).toBeVisible();
            await expect(page.getByRole('checkbox', { name: 'Wassersparende Armaturen auswählen' })).toBeChecked();

            const price = page.getByRole('textbox', { name: 'Ausgewählter Preis' });
            await price.fill('9999999');
            await price.press('Enter');
            await expect.poll(async () => {
                const [saved] = await savedRenovationCases();
                return saved?.ai ? saved.cost_selected === saved.ai.price_max : false;
            }).toBe(true);

            // ── Delete via the action menu, with confirmation ──
            await page.getByRole('button', { name: 'Aktionen für Wassersparende Armaturen' }).click();
            await page.getByRole('button', { name: 'Löschen' }).click();
            await page.getByRole('dialog', { name: 'Modernisierung löschen?' }).getByRole('button', { name: 'Löschen' }).click();
            // (Both the list and the evaluation table now show their empty
            // message, so assert on the row instead of that text.)
            await expect(page.locator('tbody tr').filter({ hasText: 'Wassersparende Armaturen' })).toHaveCount(0);
            await expect.poll(async () => (await savedRenovationCases()).length).toBe(0);
        });

        // ── Documents — linked to the detail check, with or without quick check ──
        // Goes through the metadata API directly (what uploadDocument calls
        // after storing the file), so no storage bucket is involved.
        test('Dokumente: an upload is linked to this detail check; deleting the detail check keeps the file but unlinks it', async ({ request }) => {
            const upload = (workflowId: string) => request.post('/api/documents', {
                data: {
                    category: 'Detailbewertung',
                    name: 'Nebenkostenabrechnung',
                    file_name: 'nebenkosten.pdf',
                    storage_path: `${documentPathPrefix(flow.street)}${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
                    content_type: 'application/pdf',
                    detail_check_workflow_id: workflowId,
                },
                failOnStatusCode: false,
            });

            const linked = await upload(flow.workflowId);
            expect(linked.status()).toBe(201);
            const document = await linked.json();
            expect(document.detail_check_workflow_id).toBe(flow.workflowId);
            if (flow.fromQuickCheck) expect(document.quick_check_id).toBe(Number(flow.workflowId.split(':')[1]));
            else expect(document.quick_check_id).toBeNull();

            // A workflow that isn't one of the user's detail checks is refused.
            const unknown = await upload('detail-check:00000000-0000-4000-8000-000000000000');
            expect(unknown.status()).toBe(404);

            const deleted = await request.delete('/api/detail-checks', { data: { workflowId: flow.workflowId } });
            expect(deleted.ok()).toBe(true);
            expect(await savedRow('detail_check_property_data')).toBeNull();
            const kept = await withDb(async (client) => {
                const { rows } = await client.query('SELECT detail_check_workflow_id FROM document WHERE document_id = $1', [document.document_id]);
                return rows[0] ?? null;
            });
            expect(kept).not.toBeNull();
            expect(kept?.detail_check_workflow_id).toBeNull();
        });
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

detailCheckSteps({ title: 'mit Ersteinschätzung', street: 'E2E Detailbewertung-Straße 1', fromQuickCheck: true, query: '', workflowId: '' });
detailCheckSteps({ title: 'ohne Ersteinschätzung', street: 'E2E Detailbewertung-Straße 2', fromQuickCheck: false, query: '', workflowId: '' });

// A broken link must be refused, not silently opened as the (shared, empty)
// draft — whose saves would then land somewhere the user can't see.
test('a malformed workflow id is rejected instead of falling back to the draft', async ({ request }) => {
    for (const query of ['workflowId=detail-check%3Aa%20b', 'workflowId=quick-check%3A42', 'quickCheckId=abc']) {
        const response = await request.get(`/api/detail-check/property-data?${query}`, { failOnStatusCode: false });
        expect(response.status(), query).toBe(400);
    }
});

// The Grunderwerbsteuer rate comes from the postal_code_state table. Potsdam
// (144xx) is the classic case the old two-digit rule got wrong: prefix 14 was
// treated as Berlin (6,0 %), but Potsdam is Brandenburg (6,5 %).
test.describe('Kaufkosten – Bundesland aus der PLZ-Tabelle', () => {
    const street = 'E2E Detailbewertung-Straße 3';

    test.beforeAll(() => removeFixture(street));
    test.afterAll(() => removeFixture(street));

    test('Potsdam (14467) is Brandenburg, not Berlin', async ({ request }) => {
        const workflowId = `detail-check:${randomUUID()}`;
        await withDb((client) => client.query(
            `INSERT INTO detail_check_property_data (user_id, workflow_id, property_category, data_entry_source, tenancy_type, street_house_number, postal_code, city, year_of_construction, living_area_m2)
             VALUES ($1, $2, 'EIGENTUMSWOHNUNG', 'MANUELL', 'STANDARD', $3, '14467', 'Potsdam', 1995, 75)`,
            [BYPASS_USER_ID, workflowId, street],
        ));

        const response = await request.get(`/api/detail-check/acquisition-costs?workflowId=${encodeURIComponent(workflowId)}`);
        expect(response.ok()).toBe(true);
        const data = await response.json();
        expect(data.state).toBe('BB');
        expect(data.propertyTransferTaxPercent).toBe(6.5);
    });
});
