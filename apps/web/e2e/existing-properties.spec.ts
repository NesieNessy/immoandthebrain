import { expect, Page, test } from '@playwright/test';
import { E2E_FIXTURE } from './fixtures/seed';

const propertyAddress = `${E2E_FIXTURE.street} ${E2E_FIXTURE.houseNumber}`;

/**
 * /existing-properties renders a mobile card grid (`md:hidden`) and the
 * desktop grid/list (`hidden md:block`) at the same time — CSS hides
 * whichever doesn't match the viewport, but both stay in the DOM, so a
 * plain getByText() matches both and Playwright's strict mode rejects the
 * ambiguity. `.and(visible=true)` narrows to the one actually shown at the
 * Desktop Chrome viewport this suite runs at.
 */
function visibleText(page: Page, text: string) {
    return page.getByText(text).and(page.locator(':visible'));
}

test('property list renders and a property can be opened', async ({ page }) => {
    await page.goto('/existing-properties');
    await expect(visibleText(page, propertyAddress)).toBeVisible();

    await visibleText(page, propertyAddress).click();

    // Two seeded units -> lands on the unit picker, not stuck loading
    // or "not found" — this is exactly the routing chain that regressed
    // earlier this session (redundant fetches, hardcoded hasMultipleUnits).
    await expect(page.getByText(E2E_FIXTURE.unit1Label, { exact: true })).toBeVisible();
    await expect(page.getByText(E2E_FIXTURE.unit2Label, { exact: true })).toBeVisible();
    await expect(page.getByText('Objekt nicht gefunden')).not.toBeVisible();
});

test('unit hub -> tenant data page shows the real tenant', async ({ page }) => {
    await page.goto('/existing-properties');
    await visibleText(page, propertyAddress).click();
    await page.getByText(E2E_FIXTURE.unit1Label, { exact: true }).click();

    // Now on the per-unit hub — exercises the [unitId] loader that had the
    // hardcoded hasMultipleUnits=true bug.
    await expect(page.getByText('Mieterdaten', { exact: true })).toBeVisible();
    await page.getByText('Mieterdaten', { exact: true }).click();

    // The tenant's full name also appears in the documents table (a filter
    // option plus one cell per document row) and the tenant-certificate
    // card, so asserting on the editable first-/last-name fields themselves
    // is the precise way to check the real tenant loaded — a plain text
    // search for the combined name is ambiguous on this page.
    await expect(page.getByLabel('Vorname', { exact: true })).toHaveValue(E2E_FIXTURE.tenantFirstName);
    await expect(page.getByLabel('Nachname', { exact: true })).toHaveValue(E2E_FIXTURE.tenantLastName);
});

test('a meter reading on the tenant move-out page persists after reload', async ({ page }) => {
    await page.goto('/existing-properties');
    await visibleText(page, propertyAddress).click();
    await page.getByText(E2E_FIXTURE.unit1Label, { exact: true }).click();
    await page.getByText('Mieterauszug', { exact: true }).click();

    await page.getByRole('button', { name: 'Zähler hinzufügen' }).click();
    await page.getByLabel('Raum').last().selectOption('Küche');
    await page.getByLabel('Zählerstand').last().fill('12345');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Auszugsdaten gespeichert.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Zählerstand').last()).toHaveValue('12345');
});
