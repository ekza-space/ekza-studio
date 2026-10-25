// ha-AL (ANIM-LAYERS-SPEC §5 and §8, ADR 0026), Ekza Studio on `chrome-touch`: the owner's journey with fingers.
// Seed-san with the library's Walk → its animation chip's Halo › *Adjust on a layer* → at frames 10 and 30 (Rec on) the
// right arm raised and the torso tilted → Keys open: the layer chip says "Fixes" → its Halo: ⟨Weight⟩ to 50 %, Mute,
// Mute → ◆ Key's hold says "Keying into: Fixes" → *Merge down*. The Walk's base keys stay until the merge; muted, the
// VRMA is the Walk's own bytes; the chip never shows at rest (§4.8); the Layers sheet lists the stack.
import { expect, type TestInfo, test } from '@playwright/test';
import { centreOf, dockedPetal, loadSample } from './helpers/halo-animate';
import { halo, openHalo } from './helpers/halo';
import { addWalk, baseKeys, fixWalk, shot, vrmaGap, vrmaOf } from './helpers/layers';
import { call } from './helpers/test-api';
import { fingerHold, fingerTap } from './helpers/touch';

const touchOnly = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');

test('ha-AL: Adjust on a layer, the layer chip and its Halo, weight, mute, merge — the Walk intact until the merge', async ({
  page,
}, testInfo) => {
  touchOnly(testInfo);
  test.setTimeout(240_000);
  await openHalo(page);
  await loadSample(page, 'seed-san');
  const character = (await call(page, 'characters'))[0]?.id ?? '';
  const scene = await addWalk(page, character);
  const walk = await vrmaOf(page, scene);
  const before = await baseKeys(page, scene.clip);
  const name = (await call(page, 'clips')).find((clip) => clip.id === scene.clip)?.name ?? '';
  await expect(page.getByTestId(`halo-clip-chip-${name}`)).toBeVisible();
  const atRest = (await halo(page)).visibleTargets;

  // the animation chip's Halo › Adjust on a layer (one tap on the petal)
  await fingerTap(page, await centreOf(page, `halo-clip-chip-${name}`));
  await expect(page.getByTestId('halo-docked')).toHaveAttribute('data-noun', 'clip');
  await shot(page, 'halo-adjust');
  await fingerTap(page, await dockedPetal(page, 'Adjust on a layer'));
  await expect
    .poll(async () => (await call(page, 'layers')).map((layer) => [layer.name, layer.active]))
    .toEqual([
      ['Base', false],
      ['Fixes', true],
    ]);
  expect((await call(page, 'history')).undo.at(-1)).toBe('Adjust on a Layer');
  // at rest the Thread keeps its targets: no layer chip there (§4.8)
  await expect(page.getByTestId('halo-layer-chip')).toHaveCount(0);

  // Rec is on: the pose at 10 and 30 keys into Fixes; the Walk's keys stay
  expect((await call(page, 'state')).autoKey).toBe(true);
  await fixWalk(page, 'auto');
  const fixes = (await call(page, 'layers'))[1]?.id ?? '';
  const keyed = (await call(page, 'curves', scene.clip)).filter((curve) => curve.layer === fixes);
  expect([...new Set(keyed.flatMap((curve) => curve.keys.map((key) => key.t)))].sort((a, b) => a - b)).toEqual([
    10, 30,
  ]);
  expect(await baseKeys(page, scene.clip)).toBe(before);
  const layered = await vrmaOf(page, scene);
  expect(layered.sha256).not.toBe(walk.sha256);

  // ◆ Key's hold says where keys go
  await fingerHold(page, await centreOf(page, 'halo-thread-key'), 700);
  await expect(page.getByTestId('halo-key-menu-layer')).toHaveText('Keying into: Fixes');
  await fingerTap(page, await centreOf(page, 'halo-key-menu-layer'));
  await expect(page.getByTestId('halo-sheet-layers')).toBeVisible();
  await expect(page.getByTestId('halo-layer-row-Fixes')).toHaveAttribute('data-active', '');
  await shot(page, 'halo-sheet');
  await page.getByTestId('halo-sheet-layers').getByRole('button', { name: /close/i }).first().click();

  // Keys open: the layer chip names Fixes; its Halo holds ⟨Weight⟩, Mute, Solo, Lock, Merge down
  await fingerTap(page, await centreOf(page, 'halo-thread-layer-1'));
  const chip = page.getByTestId('halo-layer-chip');
  await expect(chip).toHaveAttribute('data-layer', 'Fixes');
  await fingerTap(page, await centreOf(page, 'halo-layer-chip'));
  await expect(page.getByTestId('halo-layer-halo')).toBeVisible();
  await shot(page, 'halo-chip');
  const weight = page.getByTestId('halo-layer-weight');
  await weight.focus();
  for (const percent of [90, 80, 70, 60, 50]) {
    await weight.press('PageDown');
    await expect.poll(async () => (await call(page, 'layers'))[1]?.weight).toBeCloseTo(percent / 100, 9);
  }
  await expect(weight).toHaveAttribute('aria-valuenow', '50');
  // with Keys open and the chip's Halo, the targets stay within the selection budget (§4.8: ≤ 36 on an iPad)
  expect((await halo(page)).visibleTargets).toBeLessThanOrEqual(36);
  const half = await vrmaOf(page, scene);

  // Mute: the Walk's own bytes; Mute again: the half-weight fix
  await fingerTap(page, await centreOf(page, 'halo-layer-mute'));
  await expect.poll(async () => (await call(page, 'layers'))[1]?.mute).toBe(true);
  expect((await vrmaOf(page, scene)).sha256).toBe(walk.sha256);
  await fingerTap(page, await centreOf(page, 'halo-layer-mute'));
  await expect.poll(async () => (await call(page, 'layers'))[1]?.mute).toBe(false);
  expect((await vrmaOf(page, scene)).sha256).toBe(half.sha256);
  expect(await baseKeys(page, scene.clip)).toBe(before);

  // Merge down (at the keys): one layer again; the Walk's base now carries the fix at its keys
  await fingerTap(page, await centreOf(page, 'halo-layer-merge'));
  await expect.poll(async () => (await call(page, 'layers')).length).toBe(1);
  expect((await call(page, 'history')).undo.at(-1)).toBe('Merge Layer Down');
  expect(await baseKeys(page, scene.clip)).not.toBe(before);
  await expect(page.getByTestId('halo-layer-chip')).toHaveCount(0);
  const merged = await vrmaOf(page, scene);
  testInfo.annotations.push({
    type: 'export',
    description: `layered vs merged (at keys) VRMA: ${(await vrmaGap(half.bytes, merged.bytes)).toExponential(2)} rad; at rest ${atRest} targets`,
  });
});
