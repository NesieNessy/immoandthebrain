import { Client } from 'pg';
import { expect, test } from '@playwright/test';

/**
 * Einstellungen (/user-settings) — sidebar-based redesign covering Profil,
 * Sicherheit, Unterschrift, Plan & Abonnement, Benachrichtigungen, and Konto
 * & Daten. Sidebar navigation is scoped to `aside` (the desktop sidebar) —
 * the same items also render in a `lg:hidden` mobile tab row that stays in
 * the DOM at the default (desktop-sized) Playwright viewport, so an
 * unscoped `getByRole('button', { name })` would match both and violate
 * strict mode.
 *
 * Not covered here, structurally, under this repo's auth-bypass e2e mode:
 * - Avatar/signature upload and TOTP MFA enrollment both go straight to
 *   Supabase (Storage / Auth MFA) from the browser and are gated by RLS on
 *   a *real* `auth.uid()` — the bypass user has no real Supabase session,
 *   so these would 403 under bypass regardless of the app's own logic.
 *   (No existing spec covers the equivalent property-image upload for the
 *   same reason.)
 * - The deactivate → /account-reactivate → reactivate round trip: bypass
 *   mode short-circuits useRequireAuth before it ever loads personalData,
 *   so the deactivation gate never runs under bypass either.
 */
const BYPASS_USER_ID = '00000000-0000-4000-8000-000000000001';

function requireDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for e2e DB checks.');
    return databaseUrl;
}

test('sidebar navigates between every section', async ({ page }) => {
    await page.goto('/user-settings');
    const sidebar = page.locator('aside');

    await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Sicherheit' }).click();
    await expect(page.getByRole('heading', { name: 'Sicherheit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passwort ändern' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Unterschrift' }).click();
    await expect(page.getByRole('heading', { name: 'Unterschrift' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Plan & Abonnement' }).click();
    await expect(page.getByRole('heading', { name: 'Plan & Abonnement' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Benachrichtigungen' }).click();
    await expect(page.getByRole('heading', { name: 'Benachrichtigungen' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Konto löschen' }).click();
    await expect(page.getByRole('heading', { name: 'Konto & Daten' })).toBeVisible();
    await expect(page.getByText('Gefahrenzone')).toBeVisible();
});

test('Profil form saves and persists across reload', async ({ page }) => {
    await page.goto('/user-settings');

    const uniqueLastName = `E2E-Settings-${Date.now()}`;
    await page.getByLabel('Nachname').fill(uniqueLastName);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Profil gespeichert.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Nachname')).toHaveValue(uniqueLastName);
});

// NOTIFICATION_PREFERENCE_ITEMS renders Fristen (4) then KI-Hinweise (2)
// then Kanäle (2), in that fixed order — E-Mail-Benachrichtigungen is the
// 7th switch on the page (0-indexed 6). Located by position rather than by
// its label text for the same reason tax category rows are (see
// TaxDocuments.spec.ts): the label sits in a sibling <p>, not an ancestor
// of the switch, so a text-based `filter({ hasText })` on a generic `div`
// resolves to whichever nested div happens to be last in document order —
// which is the label's own wrapper, not the row that actually holds the switch.
const EMAIL_NOTIFICATION_SWITCH_INDEX = 6;

test('Benachrichtigungen toggle persists across reload', async ({ page }) => {
    await page.goto('/user-settings?section=benachrichtigungen');

    const emailSwitch = page.getByRole('switch').nth(EMAIL_NOTIFICATION_SWITCH_INDEX);
    const wasChecked = await emailSwitch.isChecked();

    // Switch's actual input is visually hidden (sr-only) — the visible
    // toggle track is its <label>, sitting at the same screen position, so
    // Playwright's actionability check sees the label "intercepting"
    // pointer events on the input and refuses a plain click. force: true is
    // correct here: a real user's click lands on that same label anyway,
    // which is what actually toggles the (native <label for>-linked) input.
    await emailSwitch.click({ force: true });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Benachrichtigungen gespeichert.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('switch').nth(EMAIL_NOTIFICATION_SWITCH_INDEX)).toBeChecked({ checked: !wasChecked });

    // Restore original state so repeated runs don't drift.
    await page.getByRole('switch').nth(EMAIL_NOTIFICATION_SWITCH_INDEX).click({ force: true });
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Benachrichtigungen gespeichert.')).toBeVisible();
});

test('Plan & Abonnement shows the real active property count', async ({ page }) => {
    const client = new Client({ connectionString: requireDatabaseUrl() });
    await client.connect();
    let expectedCount: number;
    try {
        const { rows } = await client.query(
            'SELECT COUNT(*)::int AS count FROM property WHERE user_id = $1 AND archived_at IS NULL',
            [BYPASS_USER_ID],
        );
        expectedCount = rows[0].count as number;
    } finally {
        await client.end();
    }

    await page.goto('/user-settings?section=abonnement');
    await expect(page.getByText('Bestandsobjekte')).toBeVisible();
    await expect(page.getByText(String(expectedCount), { exact: true })).toBeVisible();
});

test('Konto löschen requires typing the exact account email before it is enabled', async ({ page }) => {
    await page.goto('/user-settings?section=konto-daten');

    await page.getByRole('button', { name: 'Konto löschen' }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Konto dauerhaft löschen?' });
    await expect(dialog).toBeVisible();

    // ConfirmDeleteModal's confirm button always uses the shared
    // BUTTON_DETAILS.Delete.label ("Löschen") — there's no per-instance
    // custom label prop, so this isn't "Endgültig löschen" despite the
    // section's own copy talking about permanent deletion.
    const confirmButton = dialog.getByRole('button', { name: 'Löschen' });
    await expect(confirmButton).toBeDisabled();

    await dialog.getByRole('textbox').fill('not-the-right-email@example.com');
    await expect(confirmButton).toBeDisabled();

    // Never actually confirms — this only proves the gate, real deletion
    // is far too destructive to exercise repeatably in CI.
    await dialog.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).not.toBeVisible();
});
