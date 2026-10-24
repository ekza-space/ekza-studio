// ha-14 Portrait Rig editing (STUDIO-TOUCH-SPEC §4.3, §12, §22 AS-ST-7; T9 exit test): Rig & Skin, weight painting
// included, is editable at iPad portrait widths (834 pt, and 744 pt: iPad mini), unlike Studio Pro's view-only rule
// below 1024 px (AR-V1, which Halo never calls), also after a round trip to Pro. On a Regular container the *Adjust
// dots* session shows one pane with a *Front · Side* toggle (§12.2), and the cards and sheets rise from the bottom.
// `chrome-touch` drives it with real touch; `webkit-ipad` boots the Rig stage in portrait.
import { expect, type Page, test } from '@playwright/test';
import { halo, openHalo } from './helpers/halo';
import { bonePoint, dotPoint, rig, tapId } from './helpers/halo-rig';
import { call } from './helpers/test-api';
import { fingerDrag } from './helpers/touch';

async function paintSteps(page: Page): Promise<number> {
  return (await call(page, 'history')).undo.filter((label) => /Paint/i.test(label)).length;
}

function navigate(page: Page, request: Parameters<NonNullable<Window['__EKZA_STUDIO_TEST__']>['navigate']>[0]) {
  return page.evaluate(async (r) => await window.__EKZA_STUDIO_TEST__?.navigate(r), request);
}

/** A finger stroke over the right forearm; resolves once its Paint step is in the history. */
async function strokeForearm(page: Page, character: string): Promise<void> {
  const before = await paintSteps(page);
  const at = await bonePoint(page, character, 'rightLowerArm', 'rightHand');
  await fingerDrag(page, { x: at.x - 18, y: at.y }, { x: at.x + 18, y: at.y + 4 }, 12);
  await expect.poll(() => paintSteps(page)).toBe(before + 1);
}

for (const viewport of [
  { width: 834, height: 1194, name: '834' },
  { width: 744, height: 1133, name: '744' },
] as const) {
  test.describe(`portrait ${viewport.name} pt`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`ha-14 (${viewport.name}): Adjust dots one pane at a time, then paint — also after a round trip to Pro`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP touch)');
      test.setTimeout(300_000);
      await openHalo(page);
      await tapId(page, 'halo-home-sample-more', info);
      await tapId(page, 'halo-home-sample-cube-lad', info);
      await expect.poll(async () => (await halo(page)).stage, { timeout: 60_000 }).toBe('rig');
      await expect(page.getByTestId('halo-shell')).toHaveAttribute('data-size', 'regular');
      await tapId(page, 'halo-rig-it', info);
      await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');

      // Regular: one dots pane and the Front · Side toggle (§12.2)
      await tapId(page, 'halo-rig-adjust', info);
      await expect.poll(async () => (await rig(page)).dots.panes).toEqual(['pane-front']);
      await tapId(page, 'halo-rig-dots-view-side', info);
      await expect.poll(async () => (await rig(page)).dots.panes).toEqual(['pane-side']);
      await page.waitForTimeout(400);
      const knee = await dotPoint(page, 'knee', 'pane-side');
      if (knee === null) throw new Error('the knee dot is off screen');
      const before = (await call(page, 'quickRig'))?.markers['knee'] ?? [];
      // the side view writes depth (z) and height (y); x stays
      await fingerDrag(page, knee, { x: knee.x + 20, y: knee.y - 10 }, 10);
      await expect.poll(async () => (await call(page, 'quickRig'))?.moved ?? []).toContain('knee');
      const after = (await call(page, 'quickRig'))?.markers['knee'] ?? [];
      expect(after[0]).toBe(before[0]);
      await page.screenshot({ path: shot(info, viewport.name, 'dots') });
      await tapId(page, 'halo-session-done', info);
      await expect.poll(async () => (await rig(page)).dots.open).toBe(false);
      await tapId(page, 'halo-rig-go', info);
      await expect.poll(async () => (await rig(page)).card.phase, { timeout: 180_000 }).toBe('done');
      await page.screenshot({ path: shot(info, viewport.name, 'rigged') });
      await tapId(page, 'halo-rig-not-now', info);
      const character = (await call(page, 'characters'))[0]?.id ?? '';

      // the brush paints at this width (Halo never applies Pro's view-only rule, AR-V1)
      await tapId(page, 'halo-rig-paint', info);
      await expect.poll(async () => (await rig(page)).painting).toBe(true);
      await strokeForearm(page, character);
      await page.screenshot({ path: shot(info, viewport.name, 'paint') });

      // a round trip to Pro (view-only there below 1024 px) and back: Halo still edits
      await navigate(page, { to: 'studio', from: 'halo', workspace: 'rig' });
      await expect.poll(async () => call(page, 'mountedShell')).toBe('studio');
      await navigate(page, { to: 'halo', from: 'studio' });
      await expect.poll(async () => call(page, 'mountedShell')).toBe('halo');
      await expect.poll(async () => (await halo(page)).stage, { timeout: 30_000 }).toBe('rig');
      await page.waitForTimeout(400);
      if (!(await rig(page)).painting) await tapId(page, 'halo-rig-paint', info);
      await expect.poll(async () => (await rig(page)).painting).toBe(true);
      await strokeForearm(page, character);
    });
  });
}

test.describe('portrait (WebKit)', () => {
  test.use({ viewport: { width: 834, height: 1194 } });
  test('ha-14 (WebKit): the Rig stage boots in portrait; the card opens by touch', async ({ page }, info) => {
    test.skip(info.project.name !== 'webkit-ipad', 'WebKit compatibility only');
    test.setTimeout(180_000);
    await openHalo(page);
    await tapId(page, 'halo-home-sample-more', info);
    await tapId(page, 'halo-home-sample-cube-lad', info);
    await expect.poll(async () => (await halo(page)).stage, { timeout: 90_000 }).toBe('rig');
    await expect(page.getByTestId('halo-shell')).toHaveAttribute('data-size', 'regular');
    await expect(page.getByTestId('halo-rig-tray')).toBeVisible();
    await tapId(page, 'halo-rig-it', info);
    await expect.poll(async () => (await rig(page)).card.phase, { timeout: 90_000 }).toBe('dots');
    await page.screenshot({ path: shot(info, '834', 'card') });
  });
});

function shot(info: { project: { name: string } }, size: string, name: string): string {
  const dir = process.env['EKZA_T9_SHOTS'] ?? 'test-results';
  return `${dir}/t9-ha14-${info.project.name}-${size}-${name}.png`;
}

test.describe('phone (best-effort, OQ-11)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('ha-14 (phone): the Rig tray and the card fit a Compact container; the dots show one pane', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP touch)');
    test.setTimeout(240_000);
    await openHalo(page);
    await tapId(page, 'halo-home-sample-more', info);
    await tapId(page, 'halo-home-sample-cube-lad', info);
    await expect.poll(async () => (await halo(page)).stage, { timeout: 60_000 }).toBe('rig');
    await expect(page.getByTestId('halo-shell')).toHaveAttribute('data-size', 'compact');
    await tapId(page, 'halo-rig-it', info);
    await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');
    // every control of the card is on screen (nothing cut at an edge, §4.1)
    for (const id of ['halo-rig-go', 'halo-rig-adjust', 'halo-rig-card-more']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390, id).toBe(true);
    }
    await page.screenshot({ path: shot(info, 'phone', 'card') });
    await tapId(page, 'halo-rig-adjust', info);
    await expect.poll(async () => (await rig(page)).dots.panes).toEqual(['pane-front']);
    await page.screenshot({ path: shot(info, 'phone', 'dots') });
  });
});
