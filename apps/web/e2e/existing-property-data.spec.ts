import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

/**
 * Objektdaten (existing-properties/[propertyId]/property-data) isn't part of
 * the shared property/unit/tenancy fixture (fixtures/seed.ts) — mutating that
 * property's address here would break the other smoke specs that assert on
 * its exact street/city. Instead this spec creates its own minimal property
 * directly (matching the property table's current NOT NULL columns: user_id,
 * street, city, postal_code, year_of_construction — everything else, e.g.
 * city_id/property_abbreviation/square_meters, is nullable since
 * 20260318_property_optional_fields.sql) and only ever edits that one.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';
const STREET = 'E2E Objektdaten Straße 9';
const POSTAL_CODE = '00430';
const CITY = 'E2E Stadt';

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
            `INSERT INTO property (user_id, street, city, postal_code, year_of_construction)
             VALUES ($1, $2, $3, $4, 2000)
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
        // ON DELETE CASCADE takes acquisition_costs/parking_space/property_image
        // (and anything else FK'd to this property) along with it.
        await client.query('DELETE FROM property WHERE postal_code = $1', [POSTAL_CODE]);
    } finally {
        await client.end();
    }
});

test.beforeEach(async ({ page }) => {
    await page.goto(`/existing-properties/${propertyId}/property-data`);
});

// ---------------------------------------------------------------------------
// Validation — the seeded property already has a valid street/postal
// code/city/year, so only Objektkategorie, Wohnfläche, and Kaufpreis are
// still missing on first load; the mandatory-field gating is exercised by
// filling exactly those in, one at a time.
// ---------------------------------------------------------------------------

test('save stays disabled until every mandatory field is filled', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Objektdaten speichern' });
    await expect(saveButton).toBeDisabled();

    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Wohnfläche').fill('85');
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Kaufpreis').fill('450000');
    await expect(saveButton).toBeEnabled();
});

test('an incomplete postal code keeps save disabled even once every other field is valid', async ({ page }) => {
    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await page.getByLabel('Wohnfläche').fill('85');
    await page.getByLabel('Kaufpreis').fill('450000');
    await page.getByLabel('PLZ').fill('123');

    await expect(page.getByRole('button', { name: 'Objektdaten speichern' })).toBeDisabled();
});

test('a construction year in the future keeps save disabled', async ({ page }) => {
    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await page.getByLabel('Wohnfläche').fill('85');
    await page.getByLabel('Kaufpreis').fill('450000');
    await page.getByLabel('Baujahr').fill(String(new Date().getFullYear() + 1));

    await expect(page.getByRole('button', { name: 'Objektdaten speichern' })).toBeDisabled();
});

test('a purchase price of 0 keeps save disabled', async ({ page }) => {
    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await page.getByLabel('Wohnfläche').fill('85');
    await page.getByLabel('Kaufpreis').fill('0');

    await expect(page.getByRole('button', { name: 'Objektdaten speichern' })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// Saving — persists every field (mandatory and optional) and moves the user
// back to the property hub.
// ---------------------------------------------------------------------------

test('saving persists every field and shows a success toast', async ({ page }) => {
    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await page.getByLabel('Straße & Hausnummer').fill(`${STREET} 5`);
    await page.getByLabel('PLZ').fill(POSTAL_CODE);
    await page.getByLabel('Ort').fill(CITY);
    await page.getByLabel('Bundesland').fill('Bayern');
    await page.getByLabel('Baujahr').fill('1995');
    await page.getByLabel('Wohnfläche').fill('92.5');
    await page.getByLabel('Anzahl Zimmer').fill('4');
    await page.getByLabel('Stellplätze').fill('2');
    await page.getByLabel('Kaufpreis').fill('520000');

    await page.getByRole('button', { name: 'Objektdaten speichern' }).click();
    await expect(page.getByText('Objektdaten gespeichert.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/existing-properties/${propertyId}$`));

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT square_meters, number_of_rooms, property_category, federal_state
               FROM property WHERE property_id = $1`,
            [propertyId],
        );
        expect(Number(rows[0].square_meters)).toBe(92.5);
        expect(Number(rows[0].number_of_rooms)).toBe(4);
        expect(rows[0].property_category).toBe('EIGENTUMSWOHNUNG');
        expect(rows[0].federal_state).toBe('Bayern');

        const parking = await client.query(
            'SELECT number_of_parking_spaces FROM parking_space WHERE property_id = $1',
            [propertyId],
        );
        expect(Number(parking.rows[0].number_of_parking_spaces)).toBe(2);

        const acquisition = await client.query(
            'SELECT property_purchase_price FROM acquisition_costs WHERE property_id = $1',
            [propertyId],
        );
        expect(Number(acquisition.rows[0].property_purchase_price)).toBe(520000);
    } finally {
        await client.end();
    }
});

// Regression test for a bug found in review: "Anzahl Zimmer" is optional but
// property.number_of_rooms has CHECK (number_of_rooms > 0) whenever it's set
// — typing 0 (a value the field's UI didn't actually block) used to reach the
// database as a literal 0 and get rejected there instead of being treated as
// "not specified", the same as leaving the field blank.
test('Anzahl Zimmer = 0 saves successfully, stored as not specified rather than a literal 0', async ({ page }) => {
    await page.getByRole('button', { name: 'Eigentumswohnung' }).click();
    await page.getByLabel('Wohnfläche').fill('60');
    await page.getByLabel('Kaufpreis').fill('300000');
    await page.getByLabel('Anzahl Zimmer').fill('0');

    await page.getByRole('button', { name: 'Objektdaten speichern' }).click();
    await expect(page.getByText('Objektdaten gespeichert.')).toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query('SELECT number_of_rooms FROM property WHERE property_id = $1', [propertyId]);
        expect(rows[0].number_of_rooms).toBeNull();
    } finally {
        await client.end();
    }
});

// ---------------------------------------------------------------------------
// Image upload — requires the local `supabase start` Storage stack (uploads
// go from the browser straight to Supabase Storage, not through the app's
// own Postgres-backed API), so this is skipped unless that stack is up.
// ---------------------------------------------------------------------------

const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for this test.`);
    return value;
}

type VerifyOtpSession = {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    [key: string]: unknown;
};

/**
 * NEXT_PUBLIC_AUTH_BYPASS only fakes the app-level `user` object returned by
 * useRequireAuth — it never creates a real Supabase Auth session. Storage
 * uploads go straight from the browser to Supabase Storage (not through the
 * app's own API) and are RLS-gated on auth.uid(), which is NULL for an
 * unauthenticated anon request, so under bypass mode they're silently
 * rejected. Mint a real GoTrue session for the bypass user (magic-link +
 * verifyOtp, via the service-role key that's only ever available here in
 * the Node test process) and seed it into the page's localStorage under the
 * same key @supabase/supabase-js itself reads on boot, exactly as if the
 * browser had a session persisted from a previous, real login.
 *
 * Talks to GoTrue's REST API directly with plain fetch rather than through
 * @supabase/supabase-js's createClient — that unconditionally spins up a
 * RealtimeClient, which needs a native WebSocket constructor that Node 20
 * (this suite's CI runtime) doesn't have, and failed the whole test before
 * a single request went out. Raw fetch sidesteps that entirely; the two
 * response shapes read below (hashed_token, then the flat session fields)
 * are exactly what the SDK's own generateLink/verifyOtp reshape from.
 */
async function signInBypassUserForStorage(page: Page) {
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
        },
        body: JSON.stringify({ type: 'magiclink', email: 'dev@immoandthebrain.local' }),
    });
    if (!linkResponse.ok) throw new Error(`generateLink failed: ${await linkResponse.text()}`);
    const { hashed_token: tokenHash } = await linkResponse.json() as { hashed_token?: string };
    if (!tokenHash) throw new Error('generateLink did not return a hashed_token.');

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    });
    if (!verifyResponse.ok) throw new Error(`verifyOtp failed: ${await verifyResponse.text()}`);
    const raw = await verifyResponse.json() as VerifyOtpSession;
    if (!raw.access_token || !raw.refresh_token) throw new Error('verifyOtp did not return a session.');
    const session: VerifyOtpSession = {
        ...raw,
        expires_at: raw.expires_at ?? Math.floor(Date.now() / 1000) + (raw.expires_in ?? 3600),
    };

    // Matches @supabase/supabase-js's own default storageKey derivation
    // (`sb-${new URL(url).hostname.split('.')[0]}-auth-token`) so the app's
    // client picks this session up as if it had persisted it itself.
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    await page.evaluate(
        ({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)),
        { key: storageKey, session },
    );
    await page.reload();
}

test('uploading a photo shows it in the gallery as the cover, and it can be removed again', async ({ page, request }) => {
    const storageUp = await request.get('http://localhost:55321/storage/v1/status').catch(() => null);
    test.skip(!storageUp?.ok(), 'Requires the local `supabase start` Storage stack, which is not running.');

    await signInBypassUserForStorage(page);

    await page.locator('input[type="file"]').setInputFiles({
        name: 'test-photo.png',
        mimeType: 'image/png',
        buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
    });

    const photo = page.locator('img[alt=""]').first();
    await expect(photo).toBeVisible();
    // The first (and only) photo is auto-marked as the cover.
    await expect(page.getByRole('button', { name: 'Titelbild' })).toBeVisible();

    await page.getByRole('button', { name: 'Bild entfernen' }).click();
    await expect(photo).not.toBeVisible();

    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    try {
        const { rows } = await client.query('SELECT * FROM property_image WHERE property_id = $1', [propertyId]);
        expect(rows).toHaveLength(0);
    } finally {
        await client.end();
    }
});
