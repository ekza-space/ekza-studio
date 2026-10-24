// E2E-GEN-03 (MODELING-PLAN §7.2 G-e; ADR 0017 §10, M7-GB-4): a failure and a retry, in Chrome, against the real
// gateway and the mock providers. The provider fails the first task: the tray says so plainly and offers *Try again*
// (no *Bring it in*); *Try again* sends the same request under a new idempotency key (never the old one), the new job
// finishes and its model comes in. A quote above the person's limit keeps Generate off.
import { expect, test } from '@playwright/test';
import { jobRow, openGeneratePanel, routeGateway, untilJob } from './helpers/gen';
import { expectKernelStarted, failOnReportedError, openEditor } from './helpers/test-api';

test('E2E-GEN-03: a failed generation says why, and Try again sends it once more under a new key', async ({ page }) => {
  test.setTimeout(240_000);
  const gateway = await routeGateway(page);
  gateway.mock.inject({ on: 'task', kind: 'outcome', outcome: 'failed', provider: 'meshy', times: 1 });
  try {
    await openEditor(page);
    await expectKernelStarted(page);
    await openGeneratePanel(page);
    await page.getByTestId('gen-tab-text').click();
    await page.getByTestId('gen-prompt').fill('A red tulip in a clay pot');
    await page.getByTestId('gen-preset-prop').check();
    await page.getByTestId('gen-tier-paid').check();
    await expect(page.getByTestId('gen-quote')).toHaveText(/ · meshy-t2\.5 · /);
    // The most it may cost, below the quote: Generate is off and says why.
    await page.getByTestId('gen-max-cost').fill('0.1');
    await expect(page.getByTestId('gen-blocked')).toHaveText('It costs more than your limit of $0.10');
    await expect(page.getByTestId('gen-submit')).toBeDisabled();
    await page.getByTestId('gen-max-cost').fill('2');
    await expect(page.getByTestId('gen-submit')).toBeEnabled();
    await page.getByTestId('gen-submit').click();

    await untilJob(page, 'failed');
    await expect(jobRow(page).getByTestId('gen-job-state')).toHaveText(/^Failed: /);
    await expect(jobRow(page).getByTestId('gen-job-import')).toHaveCount(0);
    await expect(jobRow(page).getByTestId('gen-job-retry')).toBeVisible();
    const first = await jobRow(page).getAttribute('data-job-id');

    await jobRow(page).getByTestId('gen-job-retry').click();
    await expect(page.getByTestId('gen-job')).toHaveCount(2);
    const second = await jobRow(page).getAttribute('data-job-id');
    expect(second).not.toBe(first);
    await untilJob(page, 'succeeded');
    // Two creates at the provider, the second a new task; the gateway saw two submits with different keys.
    const creates = gateway.mock.requests.filter(
      (r) => r.provider === 'meshy' && r.method === 'POST' && r.path.includes('text-to-3d'),
    );
    expect(creates.length).toBeGreaterThanOrEqual(2);
    const submits = gateway.requests.filter((request) => request === 'POST /api/gen/v1/jobs');
    expect(submits).toHaveLength(2);
    await expect(page.getByTestId('gen-job').nth(1)).toHaveAttribute('data-state', 'failed');

    await jobRow(page).getByTestId('gen-job-import').click();
    await page.getByTestId('gen-post-run').click();
    await expect(page.getByTestId('gen-post-result')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('gen-post-done').click();
    // The failed one can leave the tray.
    await page.getByTestId('gen-job').nth(1).getByTestId('gen-job-dismiss').click();
    await expect(page.getByTestId('gen-job')).toHaveCount(1);
    await failOnReportedError(page);
  } finally {
    await gateway.close();
  }
});
