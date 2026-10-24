// ha-t12 The release switches and T12's patches in a browser (STUDIO-TOUCH-SPEC §1.1–§1.2, §14, §17, §21 T12; DECISIONS
// ST-INT-*): a first visit to `/` opens Ekza Studio's Home (also on the iPad project); Help › About carries the version
// and the beta note; Studio Pro is titled "Ekza Studio Pro" and always offers ▤ Simple layout; the top bar's live AI
// activity line follows the agent and opens Ask (P-T10-3); on a phone the Make tray folds the selection level into one
// chip so the row keeps its chips (P-T8-6). `EKZA_T12_SHOTS=<folder>` saves the release screenshots there.
import { join } from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { HALO_MARKER, halo, loadCubeLadInMake, loadPolybot, openHalo, openSheetFromShell } from './helpers/halo';
import { isTouch } from './helpers/halo-share';
import { call, waitForTestApi } from './helpers/test-api';

const SHOTS = process.env['EKZA_T12_SHOTS'] ?? '';

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  if (SHOTS === '') return;
  await page.screenshot({ path: join(SHOTS, `t12-${name}-${info.project.name}.png`) });
}

test('ha-t12: a first visit to / opens Ekza Studio’s Home, with the doors to Pro and to Rig a model for me', async ({
  page,
}, info) => {
  await page.goto('/?e2e=1');
  await expect(page).toHaveURL(/\/app\?e2e=1$/);
  await waitForTestApi(page);
  await expect(page.locator(`[data-shell="${HALO_MARKER}"]`)).toBeVisible();
  await expect(page.getByTestId('halo-home')).toBeVisible();
  await expect(page.getByTestId('halo-pro-layout')).toBeVisible();
  await expect(page.getByTestId('halo-home-autorig')).toBeVisible();
  await expect(page).toHaveTitle('Ekza Studio');
  await page.waitForTimeout(300);
  await shot(page, info, 'home');
  if (info.project.name === 'chrome') {
    await page.goto('/?chooser=1');
    await expect(page.getByTestId('entry-chooser')).toBeVisible();
    await shot(page, info, 'chooser');
  }
});

test('ha-t12: Help › About names Ekza Studio, its version and the beta note', async ({ page }, info) => {
  await openHalo(page);
  await loadPolybot(page);
  await openSheetFromShell(page, 'help', isTouch(info));
  const about = page.getByTestId('halo-help-about');
  await about.scrollIntoViewIfNeeded();
  await expect(about).toContainText('Ekza Studio');
  await expect(page.getByTestId('halo-help-version')).not.toBeEmpty();
  const beta = page.getByTestId('halo-help-beta');
  await expect(beta).toContainText('Beta');
  await expect(beta).toContainText('The Simple layout is new and in beta');
  await expect(beta).toContainText('opens in the Pro layout too');
  await expect(about).toContainText('One studio, two layouts');
  await shot(page, info, 'about-beta');
});

test('ha-t12: Studio Pro is titled “Ekza Studio Pro” and always offers ▤ Simple layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome', 'Pro’s chrome is the desktop layout');
  // without `?e2e=1` or `?simple=1`: the switch is unconditional since T12
  await page.goto('/editor');
  await expect(page.getByTestId('menubar')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveTitle('Ekza Studio Pro');
  await expect(page.getByTestId('menubar').getByLabel('Ekza Studio Pro')).toBeVisible();
  await expect(page.getByTestId('status-halo')).toHaveText('▤ Simple layout');
  for (const menu of ['help', 'file'] as const) {
    await page.getByTestId(`menu-${menu}`).click();
    await expect(page.getByTestId(`menu-item-shell.${menu}.halo`)).toHaveText('Switch to the Simple Layout');
    await page.keyboard.press('Escape');
  }
  await shot(page, info, 'pro-title');
});

test('ha-t12: the top bar’s live AI line follows the agent and opens Ask (P-T10-3)', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome', 'the agent runs on a computer (§14); the fake session is the e2e hook');
  test.setTimeout(120_000);
  await openHalo(page);
  await loadPolybot(page);
  await expect(page.getByTestId('halo-ai-activity')).toHaveCount(0);
  // search › a request › Ask AI loads the agent module (its e2e hook comes with it)
  await page.getByTestId('halo-search').click();
  await page.getByTestId('halo-palette-input').pressSequentially('make him wave');
  await page.getByTestId('halo-ask-ai').getByRole('button', { name: /make him wave/ }).click();
  await expect.poll(async () => (await halo(page)).sheet).toBe('ask');
  await page.waitForFunction(() => window.__EKZA_AGENT_E2E__ !== undefined, null, { timeout: 30_000 });
  // an agent that claimed the code asks for access: the line says so, with the sheet closed too
  await page.evaluate(() => window.__EKZA_AGENT_E2E__?.installFake({ status: 'claimed', client: 'Claude Code' }));
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await halo(page)).sheet).toBeNull();
  const line = page.getByTestId('halo-ai-activity');
  await expect(line).toHaveText(/AI asks for access/);
  await shot(page, info, 'ai-activity');
  // the line opens Ask, where the pairing card answers it
  await line.click();
  await expect.poll(async () => (await halo(page)).sheet).toBe('ask');
  await page.getByTestId('halo-ask-allow').click();
  await expect.poll(() => page.evaluate(() => window.__EKZA_AGENT_E2E__?.status() ?? null)).toBe('paired');
  // paired and idle: no line
  await expect(page.getByTestId('halo-ai-activity')).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ha-t12: the Make tray folds the selection level into one chip; the row keeps its chips (P-T8-6)', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chrome-touch', 'the phone smoke runs with touch on Chrome (best-effort, OQ-11)');
    test.setTimeout(120_000);
    await openHalo(page);
    await loadCubeLadInMake(page);
    const pick = page.getByTestId('halo-pick');
    await expect(pick).toHaveText(/Whole/);
    await pick.tap();
    await page.getByTestId('halo-make-menu-pick-face').tap();
    await expect.poll(async () => (await call(page, 'state')).mode).toBe('face');
    await expect(pick).toHaveText(/Faces/);
    // the chips beside it have the room: Clean up is on screen once scrolled to, inside the 390 pt row
    const cleanUp = page.getByTestId('halo-make-cleanup');
    await cleanUp.scrollIntoViewIfNeeded();
    const box = await cleanUp.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, info, 'phone-make');
  });
});
