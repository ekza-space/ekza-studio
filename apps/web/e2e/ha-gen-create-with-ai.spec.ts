// E2E-GEN on the touch layout (MODELING-PLAN §7.2 G-d/G-e; T8's *Create with AI* sheet made real; DECISIONS
// M7-GD-16), `chrome-touch` (fingers through CDP), against the real gateway and the mock providers (helpers/gen.ts).
// The Make tray's *Create with AI* opens the sheet; the gateway asks for its token there (P-T8 G-d); words → a
// Character from Tripo: the service's terms, the plan, the price, *Create*, the job's progress; *Bring it in* cleans
// it up in Make (≤ 3,000 triangles, one undo step) and shows the made-with-AI badge; *Rig it* hands the cleaned model
// to Auto-Rig's flow and goes to Rig. A photo → a Meshy prop within the Prop budget, the photo redrawn here.
import { makePng } from '@ekza-studio/gen-gateway/testing';
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { GEN_TOKEN, routeGateway, shot } from './helpers/gen';
import { halo, openHalo } from './helpers/halo';
import { centre, makeSlice } from './helpers/halo-make';
import { call } from './helpers/test-api';
import { fingerTap } from './helpers/touch';

async function tap(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId).first()).toBeVisible();
  await fingerTap(page, await centre(page, testId));
}

/** A segment of a touch Segmented (its items are the group's buttons, by label). */
async function chooseSegment(page: Page, group: string, label: RegExp): Promise<void> {
  const item = page.getByTestId(group).getByRole('radio', { name: label });
  await expect(item).toBeVisible();
  const box = await item.boundingBox();
  if (box === null) throw new Error(`no ${group} ${String(label)}`);
  await fingerTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(item).toHaveAttribute('aria-checked', 'true');
}

/** Make's tray → the sheet, connected with the gateway's token. */
async function openSheet(page: Page): Promise<void> {
  await openHalo(page, '&stage=make');
  await expect.poll(async () => (await makeSlice(page)).ai, { timeout: 30_000 }).toBe('token');
  await tap(page, 'halo-make-ai');
  await expect(page.getByTestId('halo-sheet-createAi')).toBeVisible();
  await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'token', { timeout: 30_000 });
  await page.getByTestId('halo-ai-token').fill(GEN_TOKEN);
  await tap(page, 'halo-ai-connect');
  await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByTestId('halo-ai-status')).toContainText('Tripo');
}

const only = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch (CDP fingers)');

test('E2E-GEN on touch: words → a Tripo character in Make → Bring it in (≤ 3k triangles) → Rig it goes to Rig', async ({
  page,
}, testInfo) => {
  only(testInfo);
  test.setTimeout(300_000);
  const model = makeAiLikeGlb();
  const gateway = await routeGateway(page, { mock: { modelBytes: () => model, pollsToFinish: 4 }, timeScale: 0.2 });
  try {
    await openSheet(page);
    await page.getByTestId('halo-ai-prompt').fill('A low-poly knight with a round shield');
    await expect(page.getByTestId('halo-ai-budget').getByRole('radio', { name: /Character/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('halo-ai-service').getByRole('radio', { name: 'Tripo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('halo-ai-terms')).toContainText('No training on your inputs');
    await expect(page.getByTestId('halo-ai-create')).toBeDisabled();
    await expect(page.getByTestId('halo-ai-blocked')).toHaveText('Say which plan you have with Tripo');
    await chooseSegment(page, 'halo-ai-plan', /Paid/);
    await expect(page.getByTestId('halo-ai-quote')).toHaveText(/ · P1-20260311 · /);
    await expect(page.getByTestId('halo-ai-create')).toBeEnabled();
    await tap(page, 'halo-ai-create');
    await expect(page.getByTestId('halo-ai-job')).toHaveAttribute('data-state', /queued|submitting|running/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('halo-ai-job')).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    await shot(page, testInfo, 'gd-halo-progress');
    await expect(page.getByTestId('halo-ai-job')).toHaveAttribute('data-state', 'succeeded', { timeout: 120_000 });

    const before = (await page.evaluate(() => window.__EKZA_STUDIO_TEST__?.history().undo ?? [])).length;
    await tap(page, 'halo-ai-job-bring');
    await expect(page.getByTestId('halo-ai-result')).toHaveAttribute('data-state', 'done', { timeout: 180_000 });
    expect(Number(await page.getByTestId('halo-ai-result-triangles').getAttribute('data-value'))).toBeLessThanOrEqual(
      3000,
    );
    await expect(page.getByTestId('halo-ai-result-badge')).toHaveText('Made with AI · tripo P1-20260311 · paid plan');
    const after = await page.evaluate(() => window.__EKZA_STUDIO_TEST__?.history().undo ?? []);
    expect(after.slice(before)).toEqual(['Import Generated Model']);
    expect((await halo(page)).stage).toBe('make');
    await shot(page, testInfo, 'gd-halo-result');

    await tap(page, 'halo-ai-rig');
    await expect.poll(async () => (await halo(page)).stage, { timeout: 30_000 }).toBe('rig');
    const meshes = (await call(page, 'meshes')).filter((mesh) => mesh.owner === 'scene');
    expect(meshes.length).toBeGreaterThan(0);
    expect(gateway.requests.filter((request) => request === 'POST /api/gen/v1/jobs')).toHaveLength(1);
  } finally {
    await gateway.close();
  }
});

test('E2E-GEN on touch: a photo → a Meshy prop within the Prop budget', async ({ page }, testInfo) => {
  only(testInfo);
  test.setTimeout(240_000);
  const gateway = await routeGateway(page);
  try {
    await openSheet(page);
    await page
      .getByTestId('halo-ai-photo-input')
      .setInputFiles({ name: 'vase.png', mimeType: 'image/png', buffer: Buffer.from(makePng(256, 256, 'exif')) });
    await expect(page.getByTestId('halo-ai-photo-name')).toHaveText('Photo: vase.png');
    await chooseSegment(page, 'halo-ai-person', /^No$/);
    await chooseSegment(page, 'halo-ai-budget', /Prop/);
    await expect(page.getByTestId('halo-ai-service').getByRole('radio', { name: 'Meshy' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await chooseSegment(page, 'halo-ai-plan', /Paid/);
    await expect(page.getByTestId('halo-ai-quote')).toHaveText(/ · meshy-t2\.5 · /);
    await tap(page, 'halo-ai-create');
    await expect(page.getByTestId('halo-ai-job')).toHaveAttribute('data-state', 'succeeded', { timeout: 120_000 });
    const create = gateway.mock.requests.find((r) => r.provider === 'meshy' && r.path.includes('image-to-3d'));
    expect(create?.json).toMatchObject({ target_polycount: 500 });
    await tap(page, 'halo-ai-job-bring');
    await expect(page.getByTestId('halo-ai-result')).toHaveAttribute('data-state', 'done', { timeout: 120_000 });
    expect(Number(await page.getByTestId('halo-ai-result-triangles').getAttribute('data-value'))).toBeLessThanOrEqual(
      500,
    );
    await expect(page.getByTestId('halo-ai-rig')).toHaveCount(0);
  } finally {
    await gateway.close();
  }
});
