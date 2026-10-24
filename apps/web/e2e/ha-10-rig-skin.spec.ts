// ha-10 Rig and Skin (STUDIO-TOUCH-SPEC §12, §5.7, §15.5–§15.6, §22; T9 exit test), on `chrome-touch` with real touch
// (CDP), booting on `webkit-ipad`:
// - the Rig-it card on the intake's subject and the native *Adjust dots* session (§12.2 step 3): the front and side
//   panes take the canvas, a finger drag on a dot moves it (`skel.quickRig.setMarker` by M6b's axis rule), a tap on a
//   dot opens the dot's Halo, ✓ Done returns to the card;
// - the segment `[Character │ Skeleton │ Skin]` is `rig.mode`; Checks opens the Checks sheet;
// - weight painting (§12.4): *Who owns this?* on a finger held on the skin names the bones there, a bone paints, a
//   stroke is one `skin.weights.paint` step, a Pencil stroke too, and **strokes survive a stage switch** (leaving
//   commits, P15); the brush tray's ⋯ and *All bones* open the Weights and Bones sheets;
// - *Rig a model for me* from Home, then Auto-Rig's *Back to Studio ▸* returns to `/app` with the document.
import { expect, type Page, test } from '@playwright/test';
import { halo, openHalo, tapStage } from './helpers/halo';
import { bonePoint, dotPoint, rig, rigCubeLadThroughCard, tapId } from './helpers/halo-rig';
import { call } from './helpers/test-api';
import { fingerDrag, fingerHold, fingerTap, penStroke, type Point } from './helpers/touch';

const touchOnly = (name: string): boolean => name === 'chrome-touch';

async function paintSteps(page: Page): Promise<number> {
  return (await call(page, 'history')).undo.filter((label) => /Paint/i.test(label)).length;
}

/** A short stroke across a point (a finger, or the Pencil at a force). */
function across(at: Point, dx = 40): [Point, Point] {
  return [
    { x: at.x - dx / 2, y: at.y },
    { x: at.x + dx / 2, y: at.y + 6 },
  ];
}

test('ha-10: the Rig-it card and the native Adjust dots session (drag a dot, its Halo, Done)', async ({
  page,
}, info) => {
  test.skip(!touchOnly(info.project.name), 'chrome-touch only (CDP touch)');
  test.setTimeout(240_000);
  await openHalo(page);
  await tapId(page, 'halo-home-sample-more', info);
  await tapId(page, 'halo-home-sample-cube-lad', info);
  await expect.poll(async () => (await halo(page)).stage, { timeout: 60_000 }).toBe('rig');
  await tapId(page, 'halo-rig-it', info);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');

  // Adjust dots: a session on the same canvas (§12.2 step 3), the front and side panes side by side on Wide
  await tapId(page, 'halo-rig-adjust', info);
  await expect(page.getByTestId('halo-session')).toHaveAttribute('data-session', 'adjustDots');
  await expect.poll(async () => (await rig(page)).dots.panes).toEqual(['pane-front', 'pane-side']);
  await expect(page.getByTestId('pane-pane-single')).toBeHidden();
  await page.waitForTimeout(400);
  const before = (await call(page, 'quickRig'))?.markers['elbow'] ?? [];
  const elbow = await dotPoint(page, 'elbow', 'pane-front');
  expect(elbow).not.toBeNull();
  if (elbow === null) return;
  // a finger drag on a dot moves it (the dot is a handle, §5.1): front writes x / y, the depth stays
  await fingerDrag(page, elbow, { x: elbow.x - 30, y: elbow.y + 24 }, 10);
  await expect.poll(async () => (await call(page, 'quickRig'))?.moved ?? []).toContain('elbow');
  const after = (await call(page, 'quickRig'))?.markers['elbow'] ?? [];
  expect(after[2]).toBe(before[2]);
  expect(Math.abs((after[1] ?? 0) - (before[1] ?? 0))).toBeGreaterThan(0.01);
  // a tap on a dot selects it and opens the dot's Halo (Re-guess · Mirror to other side · Clear dots)
  const moved = await dotPoint(page, 'elbow', 'pane-front');
  if (moved === null) throw new Error('the elbow dot is off screen');
  await fingerTap(page, moved);
  await expect.poll(async () => (await halo(page)).noun?.kind).toBe('rigDot');
  expect((await halo(page)).petals).toEqual(
    expect.arrayContaining(['skel.quickRig.guess', expect.stringMatching(/^skel\.quickRig\.setMarker/)]),
  );
  await page.screenshot({ path: shot(info, 'dots') });
  // a drag on the panes away from the dots pans the view, never a dot
  await fingerDrag(page, { x: moved.x - 160, y: moved.y - 120 }, { x: moved.x - 120, y: moved.y - 100 }, 6);
  expect((await call(page, 'quickRig'))?.moved ?? []).toEqual(['elbow']);
  // ✓ Done: the panes go, the card asks again; Rig it rigs the moved dot
  await tapId(page, 'halo-session-done', info);
  await expect.poll(async () => (await rig(page)).dots.open).toBe(false);
  await expect(page.getByTestId('pane-pane-single')).toBeVisible();
  await expect.poll(async () => (await rig(page)).card.phase).toBe('dots');
  await tapId(page, 'halo-rig-go', info);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 180_000 }).toBe('done');
  expect((await call(page, 'history')).undo).toEqual(['Import Static Model', 'Create Skeleton', 'Bind Skin']);
});

test('ha-10: weights — Who owns this?, a bone, strokes (finger and Pencil) that survive a stage switch', async ({
  page,
}, info) => {
  test.skip(!touchOnly(info.project.name), 'chrome-touch only (CDP touch)');
  test.setTimeout(240_000);
  await openHalo(page);
  const character = await rigCubeLadThroughCard(page, info);

  // the segment is rig.mode
  await tapId(page, 'halo-rig-mode-skeleton', info);
  await expect.poll(async () => (await rig(page)).mode).toBe('skeleton');
  await tapId(page, 'halo-rig-mode-object', info);
  await expect.poll(async () => (await rig(page)).mode).toBe('object');
  // Checks opens the Rig stage's Checks sheet
  await tapId(page, 'halo-rig-checks', info);
  await expect(page.getByTestId('halo-sheet-checks')).toBeVisible();
  await page.getByTestId('halo-sheet-checks').getByRole('button', { name: /close/i }).first().click();
  await expect.poll(async () => (await halo(page)).sheet).toBeNull();

  // Who owns this? — a finger held on the forearm's skin names the bones there (§12.4 step 2)
  const forearm = await bonePoint(page, character, 'rightLowerArm', 'rightHand');
  await fingerHold(page, forearm, 700);
  await expect(page.getByTestId('halo-rig-owns')).toBeVisible();
  const spot = (await rig(page)).spot;
  expect(spot?.bones.length ?? 0).toBeGreaterThan(0);
  const top = spot?.bones[0]?.joint ?? '';
  await page.screenshot({ path: shot(info, 'owns') });
  // a bone of the list paints it: Skin, that bone, the brush
  await tapId(page, `halo-rig-owner-${top}`, info);
  await expect.poll(async () => (await rig(page)).painting).toBe(true);
  expect((await rig(page)).active).toBe(top);
  await expect(page.getByTestId('halo-session')).toHaveAttribute('data-session', 'paintWeights');
  await expect(page.getByTestId('halo-rig-follows')).toBeVisible();

  // a finger stroke on the skin: one Paint step (the stroke starts after the brush delay)
  const before = await paintSteps(page);
  const [a, b] = across(await bonePoint(page, character, 'rightLowerArm', 'rightHand'));
  await fingerDrag(page, a, b, 12);
  await expect.poll(() => paintSteps(page)).toBe(before + 1);
  // a Pencil stroke: pressure is read for the pen (the routing switches to Pencil edits on its first press)
  const [c, d] = across(await bonePoint(page, character, 'rightUpperArm', 'rightLowerArm'), 50);
  await penStroke(page, [c, { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 }, d], 0.4);
  await expect.poll(() => paintSteps(page)).toBe(before + 2);
  expect((await rig(page)).strokes).toBe(2);
  expect((await rig(page)).pressure).toBe(true);
  await page.screenshot({ path: shot(info, 'paint') });

  // the brush tray's ⋯ is the Weights sheet; All bones is the Bones sheet
  await tapId(page, 'halo-rig-brush-more', info);
  await expect(page.getByTestId('halo-sheet-weights')).toBeVisible();
  await page.getByTestId('halo-sheet-weights').getByRole('button', { name: /close/i }).first().click();
  await expect.poll(async () => (await halo(page)).sheet).toBeNull();
  await tapId(page, 'halo-rig-all-bones', info);
  await expect(page.getByTestId('halo-sheet-bones')).toBeVisible();
  await expect(page.getByTestId(`halo-bone-${top}`)).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('halo-sheet-bones').getByRole('button', { name: /close/i }).first().click();

  // leaving commits (P15): a stage switch ends the paint session, the strokes stay
  await tapStage(page, 'animate');
  await expect.poll(async () => (await halo(page)).stage).toBe('animate');
  expect(await paintSteps(page)).toBe(before + 2);
  await tapStage(page, 'rig');
  await expect.poll(async () => (await halo(page)).stage).toBe('rig');
  expect(await paintSteps(page)).toBe(before + 2);
  expect((await rig(page)).painting).toBe(false);
});

test('ha-10: Rig a model for me — Auto-Rig offers Back to Studio, which returns to /app with the document', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chrome', 'chrome: one page, a navigation round trip');
  test.setTimeout(120_000);
  await openHalo(page);
  await page.getByTestId('halo-home-autorig').click();
  await expect(page).toHaveURL(/\/autorig\?.*from=halo/, { timeout: 60_000 });
  await expect(page.getByTestId('ar-back-to-studio')).toBeVisible({ timeout: 60_000 });
  // Open in Studio still goes to the Pro layout
  await expect(page.getByTestId('ar-open-studio')).toHaveAttribute('href', /\/editor/);
  await page.getByTestId('ar-back-to-studio').click();
  await expect(page).toHaveURL(/\/app/, { timeout: 60_000 });
  await expect.poll(async () => (await call(page, 'mountedShell')) as string | null).toBe('halo');
});

test('ha-10 (WebKit): the Rig stage boots; the Rig-it card opens by touch', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit-ipad', 'WebKit compatibility only');
  test.setTimeout(180_000);
  await openHalo(page);
  await tapId(page, 'halo-home-sample-more', info);
  await tapId(page, 'halo-home-sample-cube-lad', info);
  await expect.poll(async () => (await halo(page)).stage, { timeout: 90_000 }).toBe('rig');
  await expect(page.getByTestId('halo-rig-tray')).toBeVisible();
  await tapId(page, 'halo-rig-it', info);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 90_000 }).toBe('dots');
  await expect(page.getByTestId('halo-rig-card')).toBeVisible();
});

function shot(info: { project: { name: string } }, name: string): string {
  const dir = process.env['EKZA_T9_SHOTS'] ?? 'test-results';
  return `${dir}/t9-ha10-${info.project.name}-${name}.png`;
}
