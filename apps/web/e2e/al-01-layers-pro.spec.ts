// AL-01 (ANIM-LAYERS-SPEC §8, ADR 0026), Studio Pro: the owner's journey with the Layers panel. Seed-san with the
// library's Walk → *Adjust on a Layer* (the panel's toolbar) → at frames 10 and 30 the right arm raised and the torso
// tilted (keys go into "Fixes") → weight 0.5 (the panel's field) → M, M → *Merge Down (every frame)*. The Walk's base
// keys stay as they were until the merge; muted, the VRMA is the Walk's own bytes; the layered VRMA equals what plays
// (the merge on every frame bakes exactly the composite into the base, and its VRMA reads back the same motion).
import { expect, type TestInfo, test } from '@playwright/test';
import { addWalk, armAt, armGap, baseKeys, fixWalk, shot, vrmaGap, vrmaOf } from './helpers/layers';
import { seedSample } from './helpers/seed';
import { call, expectKernelStarted, openEditor, runOk } from './helpers/test-api';

const proOnly = (info: TestInfo): void =>
  test.skip(info.project.name !== 'chrome' && info.project.name !== 'chromium-swiftshader', 'Studio Pro (mouse)');

test('AL-01: fix a library Walk on a layer in the Layers panel — weight, mute, merge; exports equal what plays', async ({
  page,
}, testInfo) => {
  proOnly(testInfo);
  test.setTimeout(240_000);
  await openEditor(page);
  await expectKernelStarted(page);
  const { character } = await seedSample(page, 'seed-san');
  const scene = await addWalk(page, character);
  const walk = await vrmaOf(page, scene);
  const before = await baseKeys(page, scene.clip);

  // the Layers panel (Windows › Layers) and Adjust on a Layer from its toolbar
  await runOk(page, 'workspace.showPanel', { panel: 'layers' });
  const panel = page.getByTestId('layers-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('layers-row-Base')).toHaveAttribute('data-active', '');
  await panel.getByTestId('layers-adjust').click();
  await expect(panel.getByTestId('layers-row-Fixes')).toHaveAttribute('data-active', '');
  expect((await call(page, 'layers')).map((layer) => [layer.name, layer.mode, layer.active])).toEqual([
    ['Base', 'base', false],
    ['Fixes', 'additive', true],
  ]);
  expect((await call(page, 'history')).undo.at(-1)).toBe('Adjust on a Layer');
  await expect(panel.getByTestId('layers-keying')).toContainText('Fixes');

  // frames 10 and 30: raise the right arm, tilt the torso — the keys go into Fixes; the Walk's keys stay
  await fixWalk(page);
  const fixes = (await call(page, 'layers'))[1]?.id ?? '';
  const onFixes = (await call(page, 'curves', scene.clip)).filter((curve) => curve.layer === fixes);
  expect(onFixes.length).toBeGreaterThan(0);
  expect([...new Set(onFixes.flatMap((curve) => curve.keys.map((key) => key.t)))].sort((a, b) => a - b)).toEqual([
    10, 30,
  ]);
  expect(await baseKeys(page, scene.clip)).toBe(before);
  await runOk(page, 'time.setFrame', { frame: 10 });
  const layered = await vrmaOf(page, scene);
  expect(armGap(await armAt(layered.bytes, 10 / 30), await armAt(walk.bytes, 10 / 30))).toBeGreaterThan(
    20 * (Math.PI / 180),
  );
  await shot(panel, 'pro-panel');
  await shot(page, 'pro-after');

  // weight 0.5 in the panel's field: one undo step
  const weight = panel.getByTestId('layers-weight-Fixes');
  await weight.fill('0.5');
  await weight.press('Enter');
  await expect.poll(async () => (await call(page, 'layers'))[1]?.weight).toBe(0.5);
  expect((await call(page, 'history')).undo.at(-1)).toBe('Layer Weight');
  const half = await vrmaOf(page, scene);
  expect(half.sha256).not.toBe(layered.sha256);

  // M: the Walk's own bytes; M again: the half-weight fix
  await panel.getByTestId('layers-mute-Fixes').click();
  await expect.poll(async () => (await call(page, 'layers'))[1]?.mute).toBe(true);
  expect((await vrmaOf(page, scene)).sha256).toBe(walk.sha256);
  await shot(page, 'pro-before');
  await panel.getByTestId('layers-mute-Fixes').click();
  await expect.poll(async () => (await call(page, 'layers'))[1]?.mute).toBe(false);
  expect((await vrmaOf(page, scene)).sha256).toBe(half.sha256);
  expect(await baseKeys(page, scene.clip)).toBe(before);

  // Merge ▾ › Merge Down (every frame): one layer, the base changed, the same motion in the VRMA
  await panel.getByTestId('layers-merge').click();
  await panel.getByTestId('layers-merge-down-frames').click();
  await expect.poll(async () => (await call(page, 'layers')).length).toBe(1);
  expect((await call(page, 'history')).undo.at(-1)).toBe('Merge Layer Down');
  expect(await baseKeys(page, scene.clip)).not.toBe(before);
  const merged = await vrmaOf(page, scene);
  const gap = await vrmaGap(half.bytes, merged.bytes);
  testInfo.annotations.push({ type: 'export', description: `layered vs merged VRMA: ${gap.toExponential(2)} rad` });
  expect(gap).toBeLessThan(1e-5);
  // undo brings the layer and the Walk's keys back
  await runOk(page, 'edit.undo');
  await expect.poll(async () => (await call(page, 'layers')).length).toBe(2);
  expect(await baseKeys(page, scene.clip)).toBe(before);
});
