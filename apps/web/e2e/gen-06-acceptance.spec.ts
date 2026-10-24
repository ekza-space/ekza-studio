// M7 acceptance (MODELING-PLAN §7.3; DECISIONS M7-GD-*), in Chrome, against the real gateway and the mock providers
// (never a real provider): from ONE reference image a user gets a rigged, ≤ 3,000-triangle, ≤ 16-colour humanoid,
// animates idle and walk, and exports a VRM 1.0 that passes the `ekza/space-avatar-v1` lints with
// `ekza_model_v1.provenance.generator`. Studio Pro's Generate panel: the picture (re-encoded here), Character → Tripo,
// the attested paid plan, the quote, Generate, the tray, *Bring it in* (the clean-up: Tripo's procedural stand-in,
// 96,824 triangles facing +X, to ≤ 3,000 triangles, ≤ 16 colours, 1.70 m facing +Z, in one undo step), *Rig it* →
// Auto-Rig with the generated meshes handed over → Markers → Auto-rig → Animations: Idle and Walk → Export: the
// Ekza VRM (Tester, CC0) → glTF-Validator and vrm-validator clean, no error lint, the generator disclosed.
import { makePng } from '@ekza-studio/gen-gateway/testing';
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { expect, test } from '@playwright/test';
import { checkOf, download } from './helpers/ar-export';
import { addClip, exportMeta, nextToMarkers, onStep, primary } from './helpers/ar-as';
import { wizard } from './helpers/ar-markers';
import { checkRow } from './helpers/ar-model';
import { autoRig } from './helpers/ar-rig';
import { autorig } from './helpers/autorig';
import { dataNumber, jobRow, openGeneratePanel, routeGateway, shot, untilJob } from './helpers/gen';
import { validatorErrors } from './helpers/m6b-mvp-script';
import { call, expectKernelStarted, openEditor } from './helpers/test-api';

/** The JSON chunk of a GLB. */
function glbJson(bytes: Uint8Array): Record<string, unknown> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as Record<string, unknown>;
}

test('§7.3: one picture → a rigged ≤ 3k-triangle, ≤ 16-colour humanoid → idle, walk → an Ekza VRM with the generator', async ({
  page,
}, testInfo) => {
  test.setTimeout(480_000);
  const model = makeAiLikeGlb();
  const gateway = await routeGateway(page, { mock: { modelBytes: () => model } });
  try {
    await openEditor(page);
    await expectKernelStarted(page);
    await openGeneratePanel(page);

    // One reference picture → a Character from Tripo.
    await page
      .getByTestId('gen-image-input')
      .setInputFiles({ name: 'hero-reference.png', mimeType: 'image/png', buffer: Buffer.from(makePng(512, 512)) });
    await expect(page.getByTestId('gen-image-preview')).toContainText('ready', { timeout: 30_000 });
    await page.getByTestId('gen-real-person-no').check();
    await expect(page.getByTestId('gen-provider')).toHaveValue('tripo');
    await page.getByTestId('gen-tier-paid').check();
    await expect(page.getByTestId('gen-quote')).toHaveText(/ · P1-20260311 · /);
    await page.getByTestId('gen-submit').click();
    await untilJob(page, 'succeeded', 120_000);

    // The clean-up: ≤ 3,000 triangles, ≤ 16 colours, one undo step.
    await jobRow(page).getByTestId('gen-job-import').click();
    await page.getByTestId('gen-post-run').click();
    await expect(page.getByTestId('gen-post-result')).toBeVisible({ timeout: 180_000 });
    expect(await dataNumber(page, 'gen-post-triangles')).toBeLessThanOrEqual(3000);
    expect(await dataNumber(page, 'gen-post-colours-count')).toBeLessThanOrEqual(16);
    const palettes = await call(page, 'palettes');
    expect(Math.max(...palettes.map((palette) => palette.swatches.length))).toBeLessThanOrEqual(16);

    // Rig it: Auto-Rig with the generated meshes.
    await page.getByTestId('gen-post-rig-auto').click();
    await expect(page).toHaveURL(/\/autorig/, { timeout: 60_000 });
    // Auto-Rig offers the model from Studio ("1 mesh from your Studio scene"): Use these.
    await primary(page, /Use these/);
    await expect
      .poll(async () => (await autorig(page))?.subject.meshes.length ?? 0, { timeout: 60_000 })
      .toBeGreaterThan(0);
    for (const check of ['centred', 'grounded', 'facing', 'upright', 'size']) {
      await expect(checkRow(page, check)).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    }
    await nextToMarkers(page);
    await autoRig(page);
    const character = (await wizard(page)).subject.character;
    expect(character).not.toBeNull();

    // Idle and walk.
    await primary(page, /Animations/);
    await onStep(page, 'animations');
    await expect(page.getByTestId('ar-anim-grid')).toBeVisible({ timeout: 30_000 });
    await addClip(page, { id: 'idle', name: 'Idle', search: 'idle' });
    await addClip(page, { id: 'walk', name: 'Walk', search: 'walk' });
    expect((await call(page, 'clips', character ?? undefined)).map((clip) => clip.name)).toEqual(['Idle', 'Walk']);
    await shot(page, testInfo, 'gd-result-rigged');

    // The Ekza VRM.
    await primary(page, /Export/);
    await onStep(page, 'export');
    await exportMeta(page);
    await expect(page.getByTestId('ar-export-target-ekza-vrm')).toHaveAttribute('data-state', 'checked');
    for (const id of ['humanoid', 'required-bones', 'parents', 'skinned', 'meta', 'licence']) {
      await expect(checkOf(page, id)).toHaveAttribute('data-state', 'ok');
    }
    const file = await download(page);
    expect(file.name).toMatch(/\.vrm$/);
    expect(await validatorErrors(file.bytes)).toEqual({ gltf: [], vrm: [] });
    const json = glbJson(file.bytes) as {
      extensionsUsed?: string[];
      asset: { extras: { ekza_model_v1: { provenance: { generator: Record<string, unknown> } } } };
      meshes: { primitives: { indices?: number }[] }[];
      accessors: { count: number }[];
    };
    expect(json.extensionsUsed).toContain('VRMC_vrm');
    const generator = json.asset.extras.ekza_model_v1.provenance.generator;
    expect(generator).toMatchObject({
      kind: 'ai',
      service: 'tripo',
      model: 'P1-20260311',
      op: 'image-to-model',
      tier: 'paid',
      digitalSourceType: 'trainedAlgorithmicMedia',
    });
    expect(generator).not.toHaveProperty('taskId');
    expect((generator['postSteps'] as { op: string }[]).map((step) => step.op)).toContain('mesh.paletteBake');
    // ≤ 3,000 triangles in the file.
    let triangles = 0;
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) triangles += (json.accessors[primitive.indices ?? -1]?.count ?? 0) / 3;
    }
    expect(triangles).toBeLessThanOrEqual(3000);
    // No error lint on the space-avatar profile (the result reports it saved).
    await expect(page.getByTestId('ar-export-result')).toHaveAttribute('data-saved', 'true');
  } finally {
    await gateway.close();
  }
});
