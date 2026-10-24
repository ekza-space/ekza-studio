// E2E-GEN-02 (MODELING-PLAN §7.2 G-e; ADR 0017 §10): a picture → a prop, in Chrome, against the real gateway and the
// mock providers. The picked file carries an EXIF chunk, which the gateway refuses as it is; the panel re-encodes it
// in the browser (OffscreenCanvas → PNG) and the upload is accepted without it. The photo asks whether it shows a
// real person; the Prop preset picks Meshy (its terms: may train on inputs, AI marks must stay); the import cleans
// the model to the Prop budget (≤ 500 triangles) and keeps its size.
import { makePng } from '@ekza-studio/gen-gateway/testing';
import { expect, test } from '@playwright/test';
import { dataNumber, GEN_TOKEN, jobRow, openGeneratePanel, routeGateway, untilJob } from './helpers/gen';
import { expectKernelStarted, failOnReportedError, openEditor } from './helpers/test-api';

test('E2E-GEN-02: a picture with EXIF → re-encoded here → a Meshy prop within the Prop budget', async ({ page }) => {
  test.setTimeout(240_000);
  const gateway = await routeGateway(page);
  try {
    // The gateway itself refuses the picture as picked (it still carries EXIF).
    const photo = makePng(320, 240, 'exif');
    const direct = await gateway.gateway.handle(
      new Request('http://localhost/api/gen/v1/uploads', {
        method: 'POST',
        headers: { authorization: `Bearer ${GEN_TOKEN}`, 'content-type': 'image/png' },
        body: Buffer.from(photo),
      }),
      { remoteAddress: '127.0.0.1' },
    );
    expect(direct.status).toBeGreaterThanOrEqual(400);

    await openEditor(page);
    await expectKernelStarted(page);
    await openGeneratePanel(page);
    await expect(page.getByTestId('gen-tab-image')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('gen-preset-prop').check();
    await expect(page.getByTestId('gen-provider')).toHaveValue('meshy');
    await expect(page.getByTestId('gen-terms')).toContainText('May train on your inputs');
    await expect(page.getByTestId('gen-terms')).toContainText('AI marks must stay');

    await page
      .getByTestId('gen-image-input')
      .setInputFiles({ name: 'chair.png', mimeType: 'image/png', buffer: Buffer.from(photo) });
    await expect(page.getByTestId('gen-image-preview')).toContainText('chair.png · 320 × 240 · ready', {
      timeout: 30_000,
    });
    const upload = gateway.requests.find((request) => request.endsWith('/v1/uploads'));
    expect(upload).toBe('POST /api/gen/v1/uploads');
    await expect(page.getByTestId('gen-blocked')).toHaveText('Does the picture show a real person?');
    await page.getByTestId('gen-real-person-no').check();
    await page.getByTestId('gen-tier-paid').check();
    await expect(page.getByTestId('gen-quote')).toHaveText(/ · meshy-t2\.5 · /);
    await page.getByTestId('gen-submit').click();
    await untilJob(page, 'succeeded');
    const create = gateway.mock.requests.find(
      (r) => r.provider === 'meshy' && r.method === 'POST' && r.path.includes('image-to-3d'),
    );
    expect(create?.json).toMatchObject({ ai_model: 'meshy-t2.5', target_polycount: 500 });
    // What reached the provider is the re-encoded PNG: no eXIf chunk left.
    const imageUrl = (create?.json as { image_url?: unknown } | undefined)?.image_url;
    const uri = typeof imageUrl === 'string' ? imageUrl : '';
    const sent = Buffer.from(uri.split(',')[1] ?? '', 'base64');
    expect(sent.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(sent.includes(Buffer.from('eXIf', 'latin1'))).toBe(false);
    expect(Buffer.from(photo).includes(Buffer.from('eXIf', 'latin1'))).toBe(true);

    await jobRow(page).getByTestId('gen-job-import').click();
    await expect(page.getByTestId('gen-post-preset-prop')).toBeChecked();
    await page.getByTestId('gen-post-run').click();
    await expect(page.getByTestId('gen-post-result')).toBeVisible({ timeout: 120_000 });
    expect(await dataNumber(page, 'gen-post-triangles')).toBeLessThanOrEqual(500);
    await expect(page.getByTestId('gen-post-rig-auto')).toHaveCount(0);
    await expect(page.getByTestId('gen-post-badge')).toHaveText('Made with AI · meshy meshy-t2.5 · paid plan');
    await page.getByTestId('gen-post-done').click();
    await failOnReportedError(page);
  } finally {
    await gateway.close();
  }
});
