import { type Browser, expect, type Page, test } from '@playwright/test';
import { SHELL_MARKERS } from './helpers/autorig';
import { HALO_MARKER } from './helpers/halo';
import { waitForTestApi } from './helpers/test-api';

// E2E-AR-02 (AUTORIG-SPEC §3.2–§3.3, §11 AS-AR-8; D2), as STUDIO-TOUCH-SPEC §1.2 changed it at T12 (`HALO_ENTRY` on,
// ST-2, ST-30, ST-INT-1): a first visit to `/` opens Ekza Studio (`/app`, Home) on every device; a remembered choice
// wins; `/?chooser=1` shows the chooser — three plain links, Ekza Studio first, that work without JavaScript —
// where *Remember my choice* makes the next `/` land on the chosen layout and unticking forgets it (the next `/` is a
// first visit again); `/editor` and `/autorig` never redirect; blocked storage is a first visit; returning to
// `/?chooser=1` by Back is no history trap; the rows stack in one column with a 16 px gutter on a phone.

const ENTRY_KEY = 'ekza-studio:entry:v1';

const remembered = (page: Page): Promise<unknown> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, ENTRY_KEY);

async function remember(page: Page, choice: 'autorig' | 'studio' | 'halo'): Promise<void> {
  await page.goto('/?chooser=1');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
    ENTRY_KEY,
    JSON.stringify({ choice, at: Date.now() }),
  ] as const);
}

const haloShell = (page: Page) => page.locator(`[data-shell="${HALO_MARKER}"]`);

test('a first visit opens Ekza Studio (Home), with no first-run dialog, no failed request and no page error', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  const failed: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
  await waitForTestApi(page);
  await expect(haloShell(page)).toBeVisible();
  await expect(page.getByTestId('halo-home')).toBeVisible();
  await expect(page).toHaveTitle('Ekza Studio');
  // Home's quiet doors to the other layout and to Auto-Rig (§1.2, §17)
  await expect(page.getByTestId('halo-pro-layout')).toBeVisible();
  await expect(page.getByTestId('halo-home-autorig')).toBeVisible();
  await expect(page.getByTestId('firstrun-dialog')).toHaveCount(0);
  // nothing is remembered by a first visit; no request fails (no gateway is configured in this build, ST-INT-4)
  expect(await remembered(page)).toBeNull();
  expect(failed).toEqual([]);
  expect(problems).toEqual([]);
});

test('/?chooser=1: three link rows, Ekza Studio first, credits and the privacy line', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
  await page.goto('/?chooser=1');
  await expect(page).toHaveURL(/\/\?chooser=1$/);
  await expect(page.getByRole('heading', { name: 'One studio, two layouts' })).toBeVisible();
  const cards = page.getByTestId('entry-chooser').getByRole('link');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute('data-entry', 'halo');
  await expect(cards.nth(0)).toHaveAttribute('href', '/app');
  await expect(cards.nth(0)).toContainText('Ekza Studio');
  await expect(cards.nth(0)).toContainText('Open Ekza Studio');
  await expect(cards.nth(1)).toHaveAttribute('data-entry', 'studio');
  await expect(cards.nth(1)).toHaveAttribute('href', '/editor');
  await expect(cards.nth(1)).toContainText('Ekza Studio Pro');
  await expect(cards.nth(2)).toHaveAttribute('data-entry', 'autorig');
  await expect(cards.nth(2)).toHaveAttribute('href', '/autorig');
  await expect(cards.nth(2)).toContainText('Rig a model for me');
  await expect(page.getByText('Everything runs in your browser. Your files are never uploaded.')).toBeVisible();
  await expect(page.locator('#credits')).toContainText('"Cube Lad" model by Ekza Studio contributors, MIT.');
  await expect(page.getByRole('link', { name: 'THIRD_PARTY_NOTICES.txt' })).toBeVisible();
  // Nothing remembered: the box is unticked once hydrated, and following a row remembers nothing.
  const box = page.getByTestId('entry-remember');
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
  // Keyboard: the rows are reachable by Tab, Ekza Studio first.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('entry-halo')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('entry-studio')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('entry-autorig')).toBeFocused();
  // No hydration or script warnings; same-origin GETs only (§8.5).
  expect(problems).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(requests.filter((request) => !request.startsWith(`GET ${origin}/`))).toEqual([]);
});

test('Remember + Rig a model for me: the next / lands on /autorig; ?chooser=1 shows it ticked; unticking forgets', async ({
  page,
}) => {
  await page.goto('/?chooser=1&e2e=1');
  await page.getByTestId('entry-remember').check();
  // The row carries the page's switches (e2e) without `chooser`, so the arriving page has the test API.
  await expect(page.getByTestId('entry-autorig')).toHaveAttribute('href', '/autorig?e2e=1');
  await page.getByTestId('entry-autorig').click();
  await expect(page).toHaveURL(/\/autorig\?e2e=1$/);
  await waitForTestApi(page);
  await expect(page.locator(`[data-shell="${SHELL_MARKERS.autorig}"]`)).toBeVisible();
  expect(await remembered(page)).toMatchObject({ choice: 'autorig' });

  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/autorig\?e2e=1$/);

  await page.goto('/?chooser=1');
  await expect(page).toHaveURL(/\/\?chooser=1$/);
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  await expect(page.getByTestId('entry-remember')).toBeChecked();
  await page.getByTestId('entry-remember').uncheck();
  expect(await remembered(page)).toBeNull();

  // forgotten: the next / is a first visit again, which opens Ekza Studio
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
});

test('Remember + Ekza Studio Pro lands on /editor; without Remember nothing is stored', async ({ page }) => {
  await page.goto('/?chooser=1');
  await page.getByTestId('entry-studio').click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page).toHaveTitle('Ekza Studio Pro');
  expect(await remembered(page)).toBeNull();

  await page.goto('/?chooser=1');
  await page.getByTestId('entry-remember').check();
  await page.getByTestId('entry-studio').click();
  await expect(page).toHaveURL(/\/editor$/);
  expect(await remembered(page)).toMatchObject({ choice: 'studio' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/editor$/);
});

test('Remember + Ekza Studio stores the Simple layout, and / keeps opening it', async ({ page }) => {
  await page.goto('/?chooser=1&e2e=1');
  await page.getByTestId('entry-remember').check();
  await page.getByTestId('entry-halo').click();
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
  await waitForTestApi(page);
  await expect(haloShell(page)).toBeVisible();
  expect(await remembered(page)).toMatchObject({ choice: 'halo' });
  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
});

test('deep links never redirect', async ({ page }) => {
  await remember(page, 'autorig');
  await page.goto('/editor?e2e=1');
  await waitForTestApi(page);
  await expect(page).toHaveURL(/\/editor\?e2e=1$/);
  await expect(page.getByTestId('editor-shell')).toBeVisible();

  await remember(page, 'studio');
  await page.goto('/autorig?e2e=1');
  await waitForTestApi(page);
  await expect(page).toHaveURL(/\/autorig\?e2e=1$/);
  await expect(page.locator(`[data-shell="${SHELL_MARKERS.autorig}"]`)).toBeVisible();

  await remember(page, 'studio');
  await page.goto('/app?e2e=1');
  await waitForTestApi(page);
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
  await expect(haloShell(page)).toBeVisible();
});

test('Back to the chooser shows it again (no history trap); a fresh / applies the choice', async ({ page }) => {
  await page.goto('/?chooser=1');
  await page.getByTestId('entry-remember').check();
  await page.getByTestId('entry-autorig').click();
  await expect(page).toHaveURL(/\/autorig$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/\?chooser=1$/);
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  // a fresh visit applies the choice
  await page.goto('/');
  await expect(page).toHaveURL(/\/autorig$/);
});

test('blocked storage is a first visit (Ekza Studio boots); the chooser and its rows still work', async ({ page }) => {
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
  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
  await waitForTestApi(page);
  await expect(haloShell(page)).toBeVisible();

  await page.goto('/?chooser=1');
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  const box = page.getByTestId('entry-remember');
  await expect(box).toBeEnabled();
  await expect(box).not.toBeChecked();
  await box.check();
  await page.getByTestId('entry-studio').click();
  await expect(page).toHaveURL(/\/editor$/);
  expect(errors).toEqual([]);
});

async function noScriptPage(browser: Browser, baseURL: string, stored: string | null): Promise<Page> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    storageState: {
      cookies: [],
      origins: stored === null ? [] : [{ origin: baseURL, localStorage: [{ name: ENTRY_KEY, value: stored }] }],
    },
  });
  return context.newPage();
}

test('without JavaScript the chooser shows (even with a remembered choice) and its rows are links', async ({
  browser,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error('no baseURL');
  const page = await noScriptPage(browser, baseURL, JSON.stringify({ choice: 'autorig', at: 1 }));
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('entry-chooser')).toBeVisible();
  // the box could remember nothing without JavaScript: shown disabled
  await expect(page.getByTestId('entry-remember')).toBeDisabled();
  await page.getByTestId('entry-studio').click();
  await expect(page).toHaveURL(/\/editor$/);
  await page.goto('/');
  await page.getByTestId('entry-autorig').click();
  await expect(page).toHaveURL(/\/autorig$/);
  await page.goto('/');
  await expect(page.getByTestId('entry-halo')).toHaveAttribute('href', '/app');
  await page.context().close();
});

test('the rows stack in one column, Ekza Studio on top, with a 16 px gutter on a phone', async ({ page }) => {
  await page.goto('/?chooser=1');
  const top = async (id: string): Promise<{ x: number; y: number; w: number }> => {
    const box = await page.getByTestId(id).boundingBox();
    if (box === null) throw new Error(`${id} not laid out`);
    return { x: box.x, y: box.y, w: box.width };
  };
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const halo = await top('entry-halo');
    const studio = await top('entry-studio');
    const auto = await top('entry-autorig');
    expect(halo.y).toBeLessThan(studio.y);
    expect(studio.y).toBeLessThan(auto.y);
    expect(Math.abs(halo.x - studio.x)).toBeLessThan(1);
    expect(Math.abs(studio.x - auto.x)).toBeLessThan(1);
    if (width === 390) {
      // 16 px side gutter, no horizontal scroll
      expect(halo.x).toBeGreaterThanOrEqual(16);
      expect(halo.x + halo.w).toBeLessThanOrEqual(390 - 16 + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  }
});
