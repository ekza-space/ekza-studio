import { expect, test, type TestInfo } from '@playwright/test';
import { centre, fingerPath, makeSlice, meshIds, paneCentre, touches } from './helpers/halo-make';
import { halo, haloMenu, openHalo, PANE, petal } from './helpers/halo';
import { call, runOk } from './helpers/test-api';
import { fingerDrag, fingerTap } from './helpers/touch';

// ha-J2 Model a low-poly character from a template (STUDIO-TOUCH-SPEC §9 J2, §22 AS-ST-4; T8 exit test), `chrome-touch`,
// from a fresh project with the real defaults: Home › Make a character › Smooth body (Mirror edits on); the Faces pill;
// tap a face; Pull; drag the cap handle; scrub ⟨Segments⟩ to 2; Bevel in the reduced Halo beside the chips; drag the
// bevel handle. At most 9 touches, counted by the test API's touch counter. Every step is one operator run: the extrude
// is one step however often its cap and chips change, and so is the bevel.

const touchOnly = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');

test('ha-J2: model a low-poly character from a template in ≤ 9 touches', async ({ page }, testInfo) => {
  touchOnly(testInfo);
  test.setTimeout(150_000);
  await openHalo(page);
  await expect(page.getByTestId('halo-home')).toBeVisible();
  const base = await touches(page);

  // 1. Home › Make a character › Smooth body (2): Make, Mirror edits on (§11 "on by default for templates")
  await fingerTap(page, await centre(page, 'halo-home-make'));
  await fingerTap(page, await centre(page, 'halo-home-start-smooth'));
  await expect(page.getByTestId('halo-home')).toHaveCount(0);
  await expect.poll(async () => (await halo(page)).stage).toBe('make');
  await expect.poll(async () => (await meshIds(page)).length).toBe(1);
  const [mesh] = await meshIds(page);
  if (mesh === undefined) throw new Error('no mesh');
  await expect.poll(async () => (await call(page, 'symmetry', mesh))?.mode).toBe('object-x');
  await expect(page.getByTestId('halo-make-mirror')).toHaveAttribute('aria-pressed', 'true');
  const startSteps = (await call(page, 'history')).undo.length;

  // 2. the Faces pill (1) → a face (1) → Pull (1)
  await fingerTap(page, await centre(page, 'halo-pick-face'));
  await expect.poll(async () => (await call(page, 'state')).mode).toBe('face');
  await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
  await fingerTap(page, await paneCentre(page));
  await expect.poll(async () => (await halo(page)).noun?.kind).toBe('faces');
  const pull = await petal(page, 'Pull').boundingBox();
  if (pull === null) throw new Error('no Pull');
  await fingerTap(page, { x: pull.x + pull.width / 2, y: pull.y + pull.height / 2 });
  await expect.poll(async () => (await makeSlice(page)).extrude).toBe(true);
  await expect(page.getByTestId('halo-cap-handle')).toBeVisible();
  const afterPull = (await call(page, 'history')).undo.length;

  // the cap handle (1): one drag outwards along the cap's normal is one Adjust Last (the step replaced)
  const cap = (await makeSlice(page)).cap;
  if (cap === null) throw new Error('no cap');
  const handle = await centre(page, 'halo-cap-handle');
  await fingerDrag(page, handle, { x: handle.x + cap.dx * 70, y: handle.y + cap.dy * 70 }, 12);
  await expect.poll(async () => Number((await call(page, 'lastOp'))?.args['localTranslateZ'] ?? 0)).toBeGreaterThan(0);
  expect((await call(page, 'history')).undo.length).toBe(afterPull);

  // ⟨Segments⟩ scrubbed to 2 (1)
  const chip = page.getByTestId('halo-chip-divisions');
  await expect(chip).toBeVisible();
  const at = await centre(page, 'halo-chip-divisions');
  // one drag past the finger's slop and back: 4 px a step from the press (the kit's scrub), so it settles on 2
  await fingerPath(page, [
    at,
    { x: at.x + 6, y: at.y },
    { x: at.x + 14, y: at.y },
    { x: at.x + 9, y: at.y },
    { x: at.x + 5, y: at.y },
  ]);
  await expect.poll(async () => (await call(page, 'lastOp'))?.args['divisions']).toBe(2);

  // 3. Bevel in the reduced Halo beside the chips (1) → drag the bevel handle (1)
  const bevel = haloMenu(page).getByRole('menuitem', { name: /^Bevel/ });
  await expect(bevel).toBeVisible();
  const bevelBox = await bevel.boundingBox();
  if (bevelBox === null) throw new Error('no Bevel');
  await fingerTap(page, { x: bevelBox.x + bevelBox.width / 2, y: bevelBox.y + bevelBox.height / 2 });
  await expect.poll(async () => (await call(page, 'lastOp'))?.id).toBe('mesh.bevel');
  await expect(page.getByTestId('halo-value-handle')).toBeVisible();
  const before = Number((await call(page, 'lastOp'))?.args['fraction'] ?? 0);
  const steps = (await call(page, 'history')).undo.length;
  const value = await centre(page, 'halo-value-handle');
  await fingerDrag(page, value, { x: value.x + 60, y: value.y }, 12);
  await expect.poll(async () => Number((await call(page, 'lastOp'))?.args['fraction'] ?? 0)).not.toBe(before);
  expect((await call(page, 'history')).undo.length).toBe(steps);

  const used = (await touches(page)) - base;
  testInfo.annotations.push({ type: 'touches', description: String(used) });
  expect(used).toBeLessThanOrEqual(9);
  // the journey made two document steps after the template: the extrude and the bevel (selection steps aside)
  expect(steps).toBeGreaterThan(startSteps);
});
