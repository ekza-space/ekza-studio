// M7 G-e (MODELING-PLAN §7.2; ADR 0017 §2; DECISIONS M7-GD-*): the Generate panel is hidden when the gateway is
// disabled. The e2e server is a server build (the client's base is '/api/gen') without GEN_GATEWAY_ENABLED, as every
// deployment is by default: nothing is requested on load (no 404 in the console of a page that never asks), File ›
// Generate with AI… is listed, and once the panel asks, the gateway's 404 hides the Generate controls (a plain line
// says it is not set up) and takes the menu item away for the page's life. No provider origin is ever contacted.
import { expect, test } from '@playwright/test';
import { expectKernelStarted, openEditor } from './helpers/test-api';

test('the Generate panel is hidden when the gateway is disabled (404), and nothing is asked before the panel opens', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const asked: string[] = [];
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/gen/')) asked.push(`${request.method()} ${url.pathname}`);
    if (!(url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:')) foreign.push(url.href);
  });
  await openEditor(page);
  await expectKernelStarted(page);
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);

  await page.getByTestId('menu-file').click();
  await expect(page.getByTestId('menu-item-shell.file.generate')).toBeVisible();
  await page.getByTestId('menu-item-shell.file.generate').click();
  await expect(page.getByTestId('gen-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('gen-unavailable')).toHaveAttribute('data-status', 'unavailable', { timeout: 30_000 });
  await expect(page.getByTestId('gen-unavailable')).toContainText('AI generation is not set up on this server');
  for (const id of ['gen-tab-image', 'gen-tab-text', 'gen-submit', 'gen-provider', 'gen-quote']) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  expect(asked).toEqual(['GET /api/gen/v1/providers']);

  // The menu no longer offers it.
  await page.getByTestId('menu-file').click();
  await expect(page.getByTestId('menu-item-shell.file.import')).toBeVisible();
  await expect(page.getByTestId('menu-item-shell.file.generate')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The operators refuse plainly.
  const submit = await page.evaluate(() =>
    window.__EKZA_STUDIO_TEST__?.run('gen.submit', {
      provider: 'tripo',
      op: 'text-to-model',
      prompt: 'x',
      maxCostUsd: 1,
      tier: 'paid',
    }),
  );
  expect(submit).toMatchObject({ status: 'cancelled', reason: 'AI generation is not set up on this server' });
  expect(foreign).toEqual([]);
});
