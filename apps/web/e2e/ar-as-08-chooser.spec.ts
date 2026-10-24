// E2E-AR-02's AS-AR-8 in full (AUTORIG-SPEC §11, §3.2–§3.3; D7; D2 owns the scenario's checks at its merge):
// "Chooser memory and deep links". *Remember* ticked and Auto-Rig chosen → the next `/` lands on `/autorig`;
// `/?chooser=1` shows the chooser again; `/editor` never redirects. Since T12 (STUDIO-TOUCH-SPEC §1.2, ST-2) the
// chooser is `/?chooser=1` — a first visit, a forgotten choice and blocked storage open Ekza Studio (`/app`).
import { expect, test } from '@playwright/test';
import { SHELL_MARKERS } from './helpers/autorig';
import { waitForTestApi } from './helpers/test-api';

test('AS-AR-8: Remember lands / on /autorig; ?chooser=1 shows the chooser; /editor never redirects', async ({
  page,
}) => {
  await page.goto('/?chooser=1&e2e=1');
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  await page.getByTestId('entry-remember').check();
  await page.getByTestId('entry-autorig').click();
  await expect(page).toHaveURL(/\/autorig\?e2e=1$/);
  await waitForTestApi(page);
  await expect(page.locator(`[data-shell="${SHELL_MARKERS.autorig}"]`)).toBeVisible();

  // the next visit of / goes straight to Auto-Rig
  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/autorig\?e2e=1$/);
  await waitForTestApi(page);

  // ?chooser=1: the chooser, with the box still ticked
  await page.goto('/?chooser=1');
  await expect(page).toHaveURL(/\/\?chooser=1$/);
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  await expect(page.getByTestId('entry-remember')).toBeChecked();

  // a deep link to Studio never redirects, whatever is remembered
  await page.goto('/editor?e2e=1');
  await waitForTestApi(page);
  await expect(page).toHaveURL(/\/editor\?e2e=1$/);
  await expect(page.getByTestId('editor-shell')).toBeVisible();
});

test('AS-AR-8: with storage blocked, / is a first visit and the chooser’s rows still work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/?chooser=1');
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  await page.getByTestId('entry-remember').check();
  await page.getByTestId('entry-autorig').click();
  await expect(page).toHaveURL(/\/autorig$/);
  // nothing could be remembered: the next / is a first visit again
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
  expect(errors).toEqual([]);
});
