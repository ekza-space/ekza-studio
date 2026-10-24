// ha-J1 Bring a model, rig it, take it to OMOBA (STUDIO-TOUCH-SPEC §9 J1, §12.2, §22 AS-ST-4, AS-ST-5; T9 exit test),
// from a fresh project with the real defaults, on `chrome-touch`: Home › Bring a model › the file in Files (2) →
// the Next chip *Rig it for me ▸* opens the Rig-it card on the intake's subject (1) → its first line *For: OMOBA &
// Ekza Space* (1, the finger detail follows: Thumb) → *Rig it* (1: `autorig.rig`, the story line, the motion test) →
// *Starter set: Idle · Walk · Run* (1) → *Share ⤴* (1) → the licence (1) and the author (1) → *Export … to Files* (1)
// → iOS's own *Save* (1, the Files sheet: counted, not drawn here). At most 11, counted per deliberate touch (§9);
// the test API's counter is checked to have seen every in-app one. The document after it: one character with a
// skeleton (thumbs: Standard 33), a bound skin, Idle / Walk / Run, and an Ekza VRM whose bytes are Studio Pro's.
import { expect, type Page, test } from '@playwright/test';
import { fixtureBytes } from './helpers/ar-model';
import { halo, openHalo } from './helpers/halo';
import { rig, tapId, touchLog } from './helpers/halo-rig';
import { shareSettled, t11 } from './helpers/halo-share';
import { call } from './helpers/test-api';
import { fingerTap } from './helpers/touch';

const touchOnly = (name: string): boolean => name === 'chrome-touch';

async function tapNext(page: Page, label: RegExp): Promise<void> {
  const button = page.getByTestId('halo-next-chip').getByRole('button', { name: label });
  await expect(button).toBeVisible({ timeout: 30_000 });
  const box = await button.boundingBox();
  if (box === null) throw new Error('the Next chip is not on screen');
  await fingerTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

test('ha-J1: bring a model, rig it, take it to OMOBA in ≤ 11 touches', async ({ page }, info) => {
  test.skip(!touchOnly(info.project.name), 'chrome-touch only (CDP touch)');
  test.setTimeout(300_000);
  await openHalo(page);
  const log = touchLog();
  const counter0 = (await halo(page)).touches;

  // 1. Home › Bring a model (1) → the file in Files (1): the shared intake routes a static model to Rig
  const chooser = page.waitForEvent('filechooser');
  await tapId(page, 'halo-home-bring', info, log);
  await (await chooser).setFiles([
    { name: 'polybot.glb', mimeType: 'model/gltf-binary', buffer: fixtureBytes('polybot-unskinned.glb') },
  ]);
  log.count('files: pick the model');
  await expect(page.getByTestId('halo-home')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await halo(page)).stage, { timeout: 60_000 }).toBe('rig');
  expect((await call(page, 'history')).undo).toEqual(['Import Static Model']);

  // 2. checks run silently: the A-posed Polybot needs no fix (0)
  // 3. the Next chip opens the Rig-it card on the intake's subject (1): Quick Rig with the guess
  await tapNext(page, /Rig it for me/);
  log.count('next: rig it for me');
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');
  expect((await rig(page)).dots.quickRig).toBe(true);
  await expect(page.getByTestId('halo-rig-card')).toBeVisible();
  await page.screenshot({ path: shot(info, 'card') });

  // 4. For: OMOBA & Ekza Space (1) — the finger detail follows (Thumb), then Rig it (1)
  await tapId(page, 'halo-rig-destination-omoba', info, log);
  await expect.poll(async () => (await halo(page)).slices['t6b']).toMatchObject({ destination: 'omoba' });
  expect((await rig(page)).card.fingers).toBe('thumb');
  await tapId(page, 'halo-rig-go', info, log);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 180_000 }).toBe('done');
  const history = (await call(page, 'history')).undo;
  expect(history).toEqual(['Import Static Model', 'Create Skeleton', 'Bind Skin', 'Straighten to T-Pose']);
  // the motion test plays (no document write)
  await expect.poll(async () => (await rig(page)).card.motion, { timeout: 60_000 }).toBe('playing');
  await page.screenshot({ path: shot(info, 'rigged') });

  // 5. Add animations? › Starter set: Idle · Walk · Run (1)
  await tapId(page, 'halo-rig-starter', info, log);
  await expect.poll(async () => (await call(page, 'clips')).length, { timeout: 120_000 }).toBe(3);
  await expect.poll(async () => (await rig(page)).card.open).toBe(false);
  const character = (await call(page, 'characters'))[0];
  expect(character?.source).toBe('model');
  const skeleton = await call(page, 'skeleton', character?.id ?? '');
  expect(skeleton.preset).toBe('standard33');

  // 6. Share ⤴ (1): OMOBA is the destination the card set; preparing starts at once
  await tapId(page, 'halo-share', info, log);
  await expect(page.getByTestId('halo-sheet-share')).toBeVisible();
  // 7. the licence (1) and the author (1), asked once (Q-SKIN-3: none pre-selected)
  await tapId(page, 'halo-share-licence-cc0', info, log);
  const author = page.getByTestId('halo-share-author');
  await author.tap();
  await author.fill('Tester');
  await author.press('Enter');
  log.count('share: author');
  await expect
    .poll(async () => JSON.stringify((await t11(page)).share), { timeout: 120_000 })
    .toContain('"status":"ready"');
  const share = await shareSettled(page);
  expect(share.fileName).toMatch(/\.vrm$/);
  // 8. Export … to Files (1), then iOS's Save (1: the system sheet, a device step, D11)
  const download = page.waitForEvent('download');
  await tapId(page, 'halo-share-export', info, log);
  expect((await download).suggestedFilename()).toBe(share.fileName);
  log.count('iOS: Save (the system sheet)');

  const used = log.steps.length;
  info.annotations.push({ type: 'touches', description: `J1: ${used} touches — ${log.steps.join(' · ')}` });
  expect(used).toBeLessThanOrEqual(11);
  // the counter saw every in-app touch (the two system ones are Files' and iOS's)
  expect((await halo(page)).touches - counter0).toBeGreaterThanOrEqual(used - 2);
});

function shot(info: { project: { name: string } }, name: string): string {
  const dir = process.env['EKZA_T9_SHOTS'] ?? 'test-results';
  return `${dir}/t9-j1-${info.project.name}-${name}.png`;
}
