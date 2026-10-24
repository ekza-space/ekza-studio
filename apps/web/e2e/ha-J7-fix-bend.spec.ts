// ha-J7 Fix weights where the arm bends badly (STUDIO-TOUCH-SPEC §9 J7, §12.4, §22 AS-ST-4; T9 exit test), on
// `chrome-touch` with fingers only, from a fresh project with the real defaults (setup, not counted: Home's Cube Lad
// rigged through the Rig-it card, then Animate): Path › Rig (1) → Pose segment Test (1) → ▶ Bend test (1) → *Pause
// here* where it breaks (1: one test-pose step, painting is posed on it) → a finger held on the bad spot (1: *Who owns
// this?*) → the bone that owns it (1: Skin, that bone, the brush) → strokes (not counted; the Strength chip, Mirror on)
// → ▶ *Play again* (1). At most 7 + strokes, counted per deliberate touch (§9).
import { expect, type Page, test } from '@playwright/test';
import { halo, openHalo, tapStage } from './helpers/halo';
import { bonePoint, rig, rigCubeLadThroughCard, tapId, touchLog } from './helpers/halo-rig';
import { call } from './helpers/test-api';
import { fingerDrag, fingerHold } from './helpers/touch';

async function paintSteps(page: Page): Promise<number> {
  return (await call(page, 'history')).undo.filter((label) => /Paint/i.test(label)).length;
}

test('ha-J7: fix weights where the arm bends badly in ≤ 7 touches + strokes', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP touch)');
  test.setTimeout(300_000);
  await openHalo(page);
  const character = await rigCubeLadThroughCard(page, info);
  await tapStage(page, 'animate');
  await expect.poll(async () => (await halo(page)).stage).toBe('animate');
  const log = touchLog();

  // 1. Path › Rig (1) → Pose segment Test (1) → ▶ Bend test (1) → pause where it breaks (1)
  await tapStage(page, 'rig');
  log.count('path: rig');
  await expect.poll(async () => (await halo(page)).stage).toBe('rig');
  await tapId(page, 'halo-rig-pose-test', info, log);
  await expect.poll(async () => (await rig(page)).poseView).toBe('test');
  await tapId(page, 'halo-rig-bend', info, log);
  await expect.poll(async () => (await rig(page)).bend).toBe('playing');
  await page.waitForTimeout(1100);
  await tapId(page, 'halo-rig-pause', info, log);
  await expect.poll(async () => (await rig(page)).bend).toBe('paused');
  // the pose stays as a test pose (never a key, never the document): the elbows are bent
  await expect.poll(async () => (await call(page, 'rigState')).testPose.controls).toBeGreaterThan(0);
  expect((await call(page, 'clips')).length).toBe(0);
  await page.screenshot({ path: shot(info, 'paused') });

  // 2. a finger held on the bad spot (1): Who owns this? — then the bone that owns it (1)
  const spot = await bonePoint(page, character, 'rightLowerArm', 'rightHand', 'pane-single', 0.15);
  await fingerHold(page, spot, 700);
  log.count('hold: the bad spot');
  await expect(page.getByTestId('halo-rig-owns')).toBeVisible();
  const bones = (await rig(page)).spot?.bones ?? [];
  expect(bones.length).toBeGreaterThan(0);
  const top = bones[0]?.joint ?? '';
  await tapId(page, `halo-rig-owner-${top}`, info, log);
  await expect.poll(async () => (await rig(page)).painting).toBe(true);
  expect((await rig(page)).active).toBe(top);
  expect((await call(page, 'paint')).mirror).toBe(true);

  // 3. paint (strokes, not counted): posed painting on the paused pose
  const before = await paintSteps(page);
  for (const t of [0.1, 0.3]) {
    const at = await bonePoint(page, character, 'rightLowerArm', 'rightHand', 'pane-single', t);
    await fingerDrag(page, { x: at.x - 16, y: at.y - 4 }, { x: at.x + 16, y: at.y + 4 }, 12);
  }
  await expect.poll(() => paintSteps(page)).toBe(before + 2);
  await page.screenshot({ path: shot(info, 'paint') });

  // 4. ▶ Play again (1): the bend test again, the strokes kept
  await tapId(page, 'halo-rig-bend', info, log);
  await expect.poll(async () => (await rig(page)).bend).toBe('playing');
  expect(await paintSteps(page)).toBe(before + 2);

  info.annotations.push({
    type: 'touches',
    description: `J7: ${log.steps.length} + 2 strokes — ${log.steps.join(' · ')}`,
  });
  expect(log.steps.length).toBeLessThanOrEqual(7);
});

function shot(info: { project: { name: string } }, name: string): string {
  const dir = process.env['EKZA_T9_SHOTS'] ?? 'test-results';
  return `${dir}/t9-j7-${info.project.name}-${name}.png`;
}
