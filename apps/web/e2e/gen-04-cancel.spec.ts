// E2E-GEN-04 (MODELING-PLAN §7.2 G-e; ADR 0017 §10): cancel, in Chrome, against the real gateway and the mock
// providers. A Meshy job waits in the provider's queue (the mock keeps it pending); *Stop* asks the gateway to cancel
// it (Meshy refunds a pending task), the tray says "Stopped", nothing comes in, and the help line's pill goes away.
import { expect, test } from '@playwright/test';
import { jobRow, openGeneratePanel, routeGateway, untilJob } from './helpers/gen';
import { call, expectKernelStarted, failOnReportedError, openEditor } from './helpers/test-api';

test('E2E-GEN-04: Stop cancels a waiting generation; nothing is charged or imported', async ({ page }) => {
  test.setTimeout(180_000);
  const gateway = await routeGateway(page, { mock: { pollsQueued: { meshy: 100_000 } } });
  try {
    await openEditor(page);
    await expectKernelStarted(page);
    await openGeneratePanel(page);
    await page.getByTestId('gen-tab-text').click();
    await page.getByTestId('gen-prompt').fill('A wooden chair');
    await page.getByTestId('gen-preset-prop').check();
    await page.getByTestId('gen-tier-paid').check();
    await expect(page.getByTestId('gen-quote')).toHaveText(/ · meshy-t2\.5 · /);
    await page.getByTestId('gen-submit').click();
    await expect(jobRow(page).getByTestId('gen-job-state')).toHaveText('Waiting at the provider', { timeout: 60_000 });
    await expect(page.getByTestId('gen-tray-pill')).toContainText('Waiting at the provider');

    await jobRow(page).getByTestId('gen-job-cancel').click();
    await untilJob(page, 'canceled');
    await expect(jobRow(page).getByTestId('gen-job-state')).toHaveText('Stopped');
    await expect(jobRow(page).getByTestId('gen-job-import')).toHaveCount(0);
    await expect(jobRow(page).getByTestId('gen-job-retry')).toBeVisible();
    await expect(page.getByTestId('gen-tray-pill')).toHaveCount(0);
    expect(gateway.requests.filter((request) => request.startsWith('DELETE /api/gen/v1/jobs/'))).toHaveLength(1);
    expect((await call(page, 'meshes')).length).toBe(0);
    await failOnReportedError(page);
  } finally {
    await gateway.close();
  }
});
