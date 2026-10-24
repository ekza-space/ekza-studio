// E2E-GEN-01 (MODELING-PLAN §7.2 G-e; DECISIONS M7-GD-*): words → a character, in Chrome, against the real gateway
// and the mock providers (helpers/gen.ts). File › Generate with AI… opens the panel; the gateway asks for its token;
// From words, the Character preset picks Tripo with its terms; Generate stays off until the plan is attested and the
// quote line is shown; the job tray (and the help line's pill) follows the job; *Bring it in* opens the clean-up:
// `gen.import` → `mesh.intake` brings Tripo's procedural stand-in (96,824 triangles, facing +X) to ≤ 3,000 triangles
// and ≤ 16 colours, standing 1.70 m tall, in ONE undo step, with the provenance badge; *Clean up again* with 8
// colours undoes the first import (one import stays); undo takes the import away.
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { expect, test } from '@playwright/test';
import { dataNumber, jobRow, openGeneratePanel, routeGateway, shot, untilJob } from './helpers/gen';
import { call, expectKernelStarted, failOnReportedError, openEditor, runOk } from './helpers/test-api';

test('E2E-GEN-01: words → a Tripo character, cleaned to ≤ 3,000 triangles and ≤ 16 colours in one undo step', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const model = makeAiLikeGlb();
  const gateway = await routeGateway(page, { mock: { modelBytes: () => model, pollsToFinish: 5 }, timeScale: 0.35 });
  try {
    await openEditor(page);
    await expectKernelStarted(page);
    await openGeneratePanel(page);

    await page.getByTestId('gen-tab-text').click();
    await page.getByTestId('gen-prompt').fill('A low-poly knight with a round shield, flat colours');
    await expect(page.getByTestId('gen-preset-character')).toBeChecked();
    await expect(page.getByTestId('gen-provider')).toHaveValue('tripo');
    await expect(page.getByTestId('gen-terms')).toContainText('No training on your inputs');
    await expect(page.getByTestId('gen-submit')).toBeDisabled();
    await expect(page.getByTestId('gen-blocked')).toHaveText('Say which plan you have with Tripo');
    await page.getByTestId('gen-tier-paid').check();
    await expect(page.getByTestId('gen-quote')).toHaveText(
      /^\$\d+\.\d\d \(\d+ credits\) · P1-20260311 · \$5\.00 left today/,
    );
    await expect(page.getByTestId('gen-submit')).toBeEnabled();
    await shot(page, testInfo, 'gd-pro-panel');

    await page.getByTestId('gen-submit').click();
    await expect(jobRow(page)).toHaveAttribute('data-state', /queued|submitting|running/, { timeout: 30_000 });
    await expect(page.getByTestId('gen-tray-pill')).toBeVisible();
    await expect(jobRow(page)).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    await expect(jobRow(page).getByTestId('gen-job-progress')).toBeVisible();
    await shot(page, testInfo, 'gd-job-progress');
    await untilJob(page, 'succeeded', 120_000);
    await expect(jobRow(page).getByTestId('gen-job-state')).toHaveText('Ready');
    // The provider saw the pinned low-poly model and the preset's face budget.
    const create = gateway.mock.requests.find((r) => r.path.endsWith('/generation/text-to-model'));
    expect(create?.json).toMatchObject({ model: 'P1-20260311', face_limit: 3000 });

    const before = (await page.evaluate(() => window.__EKZA_STUDIO_TEST__?.history().undo ?? [])).length;
    await jobRow(page).getByTestId('gen-job-import').click();
    await expect(page.getByTestId('gen-post')).toBeVisible();
    await page.getByTestId('gen-post-run').click();
    await expect(page.getByTestId('gen-post-result')).toBeVisible({ timeout: 180_000 });
    expect(await dataNumber(page, 'gen-post-triangles')).toBeLessThanOrEqual(3000);
    expect(await dataNumber(page, 'gen-post-triangles')).toBeGreaterThan(2500);
    expect(await dataNumber(page, 'gen-post-colours-count')).toBeLessThanOrEqual(16);
    await expect(page.getByTestId('gen-post-badge')).toHaveText('Made with AI · tripo P1-20260311 · paid plan');
    await expect(page.getByTestId('gen-post-rig-auto')).toBeVisible();
    await shot(page, testInfo, 'gd-post-chain');
    const history = await page.evaluate(() => window.__EKZA_STUDIO_TEST__?.history().undo ?? []);
    expect(history.slice(before)).toEqual(['Import Generated Model']);
    const meshes = (await call(page, 'meshes')).filter((mesh) => mesh.owner === 'scene');
    expect(meshes.length).toBeGreaterThan(0);
    const tris = await Promise.all(
      meshes.map(async (mesh) => (await call(page, 'meshInfo', mesh.id))?.counts.tris ?? 0),
    );
    expect(tris.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3000);
    // Standing on the ground, 1.70 m tall (Tripo's +X facing turned to +Z by the clean-up).
    const ys = (
      await Promise.all(meshes.map((mesh) => call(page, 'meshPositions', mesh.id, undefined, 'world')))
    ).flat();
    const height = Math.max(...ys.map((p) => p[1] as number)) - Math.min(...ys.map((p) => p[1] as number));
    expect(height).toBeGreaterThan(1.6);
    expect(height).toBeLessThan(1.8);

    // Again with 8 colours: the first import is undone first; one import stays.
    await page.getByTestId('gen-post-colours').fill('8');
    await page.getByTestId('gen-post-run').click();
    await expect(page.getByTestId('gen-post-run')).toHaveText('Clean up again with these settings', {
      timeout: 180_000,
    });
    expect(await dataNumber(page, 'gen-post-colours-count')).toBeLessThanOrEqual(8);
    const again = await page.evaluate(() => window.__EKZA_STUDIO_TEST__?.history().undo ?? []);
    expect(again.slice(before)).toEqual(['Import Generated Model']);
    await page.getByTestId('gen-post-done').click();
    await expect(jobRow(page).getByTestId('gen-badge')).toBeVisible();

    // Undo takes the whole import away; the tray offers it again.
    await runOk(page, 'edit.undo');
    expect((await call(page, 'meshes')).filter((mesh) => mesh.owner === 'scene')).toEqual([]);
    await expect(jobRow(page).getByTestId('gen-job-import')).toHaveText('Bring it in');
    // The token and the provider keys never reach the gateway's log.
    for (const secret of [gateway.mock.keys.tripo, gateway.mock.keys.meshy]) {
      expect(gateway.lines.join('\n')).not.toContain(secret);
    }
    await failOnReportedError(page);
  } finally {
    await gateway.close();
  }
});
