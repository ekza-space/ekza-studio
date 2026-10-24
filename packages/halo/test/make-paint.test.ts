// The Make and Paint stages (STUDIO-TOUCH-SPEC §11, §13.1, §6.2; T8): the cap handle's geometry over a real extrude
// session, the clean-up operators' arguments (G-a's contract, M7-GA-CONTRACT-1…6), the paint model (the palette in use,
// the swatches the tray shows), `select.imagePlane` and the plane noun, and the stages' words (the vocabulary lint).
import type { MeshId } from '@ekza-studio/doc';
import { type EditorApp, extrudeManipulatorFrame, loadExtrudeEngine } from '@ekza-studio/editor-core';
import { describe, expect, it } from 'vitest';
import { makeWords, paintWords } from '../src/i18n/make';
import { aiShown, checkAi, setGenerationGateway } from '../src/stages/make/ai/availability';
import {
  CHARACTER_BUDGET,
  GA_OPS,
  intakeArgs,
  NORMALIZE_ARGS,
  PALETTE_BAKE_ARGS,
  REDUCE_BUDGETS,
  reduceArgs,
  TEXTURE_ARGS,
} from '../src/stages/make/cleanup';
import {
  type CapGeometry,
  capDistance,
  capGeometry,
  componentBox,
  selectionCentroid,
} from '../src/stages/make/geometry';
import { activeSwatch, currentPalette, hexOf, paintMeshes, swatchesOf, traySwatches } from '../src/stages/paint/model';
import { resolveNoun } from '../src/verbs/nouns';
import { petalsFor } from '../src/verbs/table';
import { everyOperator, runOk } from './support';

/** A flat projection for the tests: x right, y down (z towards the viewer), 100 px per metre, origin at (500, 500). */
const flat = (p: readonly [number, number, number]) => ({ x: 500 + p[0] * 100, y: 500 - p[1] * 100 });

async function cubeInFaceMode(): Promise<{ readonly app: EditorApp; readonly mesh: MeshId }> {
  const app = await everyOperator();
  await runOk(app, 'workspace.set', { workspace: 'model' });
  const { mesh } = await runOk<{ mesh: MeshId }>(app, 'mesh.create.cube');
  await runOk(app, 'select.mode', { mode: 'face' });
  return { app, mesh };
}

describe('Make: the cap handle (ST-T8-1)', { timeout: 60_000 }, () => {
  it('sits on the cap’s projected normal; a drag along it is metres along the normal', async () => {
    const { app, mesh } = await cubeInFaceMode();
    await loadExtrudeEngine();
    // a face whose normal lies in the screen plane of the flat projection (a side, the top or the bottom)
    let found: CapGeometry | null = null;
    for (let face = 0; face < 6 && found === null; face += 1) {
      await runOk(app, 'select.components', { mesh, kind: 'face', indices: [face], mode: 'replace' });
      await runOk(app, 'mesh.extrude', {});
      const geometry = capGeometry(app, flat);
      if (geometry !== null && Math.hypot(geometry.normal[0], geometry.normal[1]) > 0.99) found = geometry;
      else await runOk(app, 'edit.undo');
    }
    expect(app.session.getState().model.extrudeSession).not.toBeNull();
    expect(extrudeManipulatorFrame(app)).not.toBeNull();
    expect(found).not.toBeNull();
    const cap = found as CapGeometry;
    // the handle is 112 px from the cap along the projected normal (a unit screen direction)
    expect(Math.hypot(cap.dir.x, cap.dir.y)).toBeCloseTo(1, 6);
    expect(Math.hypot(cap.handle.x - cap.at.x, cap.handle.y - cap.at.y)).toBeCloseTo(112, 4);
    // 100 px along the normal's screen direction is 1 m when the normal lies in the screen plane
    const along = capDistance(cap, { x: 0, y: 0 }, { x: cap.dir.x * 100, y: cap.dir.y * 100 });
    expect(along).toBeCloseTo(1, 4);
    // Fine (the Thumb key) is a tenth of it; across the axis is nothing
    expect(capDistance(cap, { x: 0, y: 0 }, { x: cap.dir.x * 100, y: cap.dir.y * 100 }, 0.1)).toBeCloseTo(
      along / 10,
      6,
    );
    expect(capDistance(cap, { x: 0, y: 0 }, { x: -cap.dir.y * 50, y: cap.dir.x * 50 })).toBeCloseTo(0, 6);
  });

  it('a normal that faces the camera puts the handle straight up the screen', async () => {
    const { app, mesh } = await cubeInFaceMode();
    await loadExtrudeEngine();
    // a projection that drops depth along the normal: every face normal projects to a point when it is ±Z
    const front = (p: readonly [number, number, number]) => ({ x: 500 + p[0] * 100, y: 500 - p[1] * 100 });
    // find a face whose normal is ±Z
    let facing: CapGeometry | null = null;
    for (let face = 0; face < 6 && facing === null; face += 1) {
      await runOk(app, 'select.components', { mesh, kind: 'face', indices: [face], mode: 'replace' });
      await runOk(app, 'mesh.extrude', {});
      const cap = capGeometry(app, front);
      if (cap !== null && Math.abs(cap.normal[2]) > 0.99) facing = cap;
      else await runOk(app, 'edit.undo');
    }
    expect(facing).not.toBeNull();
    expect(facing?.dir).toEqual({ x: 0, y: -1 });
    expect(facing?.pxPerUnit ?? 0).toBeGreaterThan(0);
  });

  it('the selection’s centroid and box come from the selected faces', async () => {
    const { app, mesh } = await cubeInFaceMode();
    await runOk(app, 'select.components', { mesh, kind: 'face', indices: [0], mode: 'replace' });
    const centroid = selectionCentroid(app, mesh);
    expect(centroid).not.toBeNull();
    const box = componentBox(app, flat, 0);
    expect(box).not.toBeNull();
    if (box === null || centroid === null) return;
    const c = flat(centroid);
    expect(c.x).toBeGreaterThanOrEqual(box.left - 1e-6);
    expect(c.x).toBeLessThanOrEqual(box.right + 1e-6);
  });
});

describe('Make: clean-up calls G-a’s operators by id with their contract (M7-GA-CONTRACT-1…6, ST-T8-12)', {
  timeout: 60_000,
}, () => {
  it('the ids, and the arguments of each row', async () => {
    expect(GA_OPS).toEqual({
      intake: 'mesh.intake',
      reduce: 'mesh.reduce',
      normalize: 'mesh.normalize',
      paletteBake: 'mesh.paletteBake',
      textureDownsize: 'mesh.textureDownsize',
    });
    expect(REDUCE_BUDGETS.map((b) => [b.id, b.triangles])).toEqual([
      ['prop', 500],
      ['character', 3000],
      ['hero', 10_000],
    ]);
    expect(reduceArgs(CHARACTER_BUDGET)).toEqual({ preset: 'character' });
    expect(intakeArgs({ id: 'hero' })).toEqual({ preset: 'hero' });
    expect(NORMALIZE_ARGS).toEqual({ height: null });
    expect(PALETTE_BAKE_ARGS).toEqual({ colours: 16 });
    expect(TEXTURE_ARGS).toEqual({ size: 1024 });
    // G-a landed: every row names a registered operator whose parameters are the contract's
    const app = await everyOperator();
    const params = (op: string): string[] => (app.operators.get(op)?.params ?? []).map((p) => p.name);
    expect(params(GA_OPS.intake)).toEqual(expect.arrayContaining(['preset', 'height', 'colours']));
    expect(params(GA_OPS.reduce)).toEqual(expect.arrayContaining(['preset', 'triangles']));
    expect(params(GA_OPS.normalize)).toContain('height');
    expect(params(GA_OPS.paletteBake)).toContain('colours');
    expect(params(GA_OPS.textureDownsize)).toContain('size');
  });

  it('a part’s Halo cleans up: Move, Separate, Delete, Reduce, Rig it', () => {
    expect(petalsFor('mesh', 'make').map((p) => p.id)).toEqual([
      'editShape',
      'move',
      'separate',
      'delete',
      'reduce',
      'rigIt',
    ]);
    expect(petalsFor('faces', 'make').map((p) => p.id)).toEqual([
      'pull',
      'inset',
      'bevel',
      'colour',
      'delete',
      'separate',
    ]);
  });
});

describe('Paint: the palette in use and the tray’s swatches', { timeout: 60_000 }, () => {
  it('a template paints with the starter palette; the tray keeps the active swatch in view', async () => {
    const app = await everyOperator();
    await runOk(app, 'workspace.set', { workspace: 'model' });
    await runOk(app, 'mesh.create.template', { template: 'humanoidBody', style: 'smooth' });
    expect(paintMeshes(app).length).toBe(1);
    const palette = currentPalette(app);
    expect(palette).not.toBeNull();
    if (palette === null) return;
    const swatches = swatchesOf(app, palette.id);
    expect(swatches.length).toBe(16);
    expect(traySwatches(swatches, null, 5)).toMatchObject({ more: 11 });
    const last = swatches[15];
    if (last === undefined) throw new Error('no swatch');
    await runOk(app, 'palette.setActive', { swatch: last.id });
    expect(activeSwatch(app)?.id).toBe(last.id);
    const tray = traySwatches(swatches, last.id, 5);
    expect(tray.shown.map((s) => s.id)).toContain(last.id);
    expect(tray.shown.length).toBe(5);
    expect(hexOf([255, 0, 16])).toBe('#ff0010');
  });
});

describe('the reference plane noun (select.imagePlane, §6.2)', { timeout: 60_000 }, () => {
  it('a plane is selected by its own operator; a scene pick lets it go', async () => {
    const app = await everyOperator();
    await runOk(app, 'workspace.set', { workspace: 'model' });
    const { mesh } = await runOk<{ mesh: MeshId }>(app, 'mesh.create.cube');
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8,
      6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89,
    ]);
    const { id } = await runOk<{ id: string }>(app, 'imagePlane.import', { camera: 'front', name: 'Ref', bytes: png });
    await runOk(app, 'select.imagePlane', { id });
    expect(app.session.getState().model.imagePlane).toBe(id);
    expect(app.session.getState().selection.objects).toEqual([]);
    expect(resolveNoun(app, 'make')).toMatchObject({ kind: 'imagePlane', id, label: 'Ref' });
    await runOk(app, 'select.objects', { ids: [mesh], mode: 'replace' });
    expect(app.session.getState().model.imagePlane).toBeNull();
    expect(resolveNoun(app, 'make').kind).toBe('mesh');
    // an unknown plane is refused with the reason
    const refused = await app.runUntyped('select.imagePlane', { id: 'img_nope' });
    expect(refused.status).toBe('cancelled');
  });
});

describe('Create with AI shows where a generation gateway answers (ADR 0017 §2, ST-T8-18)', { timeout: 60_000 }, () => {
  /** An app whose host sets `services.generation` (or leaves it out), for the availability probe alone. */
  const appWith = (generation?: unknown): EditorApp =>
    ({ services: generation === undefined ? {} : { generation } }) as unknown as EditorApp;
  const failing = (status: number | null, code: string) => ({
    providers: () => Promise.reject(Object.assign(new Error(code), { status, code })),
  });
  const PROVIDERS = {
    protocol: 'ekza-gen/v1',
    providers: [{ label: 'Tripo' }, { label: 'Meshy' }],
    caps: { dailyUsd: 5, monthlyUsd: 20, remainingDailyUsd: 5, remainingMonthlyUsd: 20 },
  };

  it('no gateway URL and no client, the host’s null, or a gateway that is not enabled (404): hidden', async () => {
    setGenerationGateway('');
    expect(await checkAi(appWith())).toEqual({ state: 'hidden' });
    expect(await checkAi(appWith(null))).toEqual({ state: 'hidden' });
    expect(await checkAi(appWith(failing(404, 'not-found')))).toEqual({ state: 'hidden' });
  });

  it('a gateway that does not answer or wants its token is "not connected"; one that answers lists its providers', async () => {
    const offline = await checkAi(appWith(failing(null, 'network')));
    const token = await checkAi(appWith(failing(401, 'unauthorized')));
    const ready = await checkAi(appWith({ providers: () => Promise.resolve(PROVIDERS) }));
    expect([offline.state, token.state]).toEqual(['offline', 'token']);
    expect(ready).toEqual({ state: 'ready', providers: ['Tripo', 'Meshy'] });
    expect([offline, token, ready].every(aiShown)).toBe(true);
    expect(aiShown({ state: 'hidden' })).toBe(false);
    expect(aiShown({ state: 'checking' })).toBe(false);
  });

  it('without a host client, the build’s gateway URL makes one with gen-core (404 hides; an answer shows)', async () => {
    const calls: string[] = [];
    const answers = [new Response('Not Found', { status: 404 }), Response.json(PROVIDERS)];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL) => {
      calls.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(answers.shift() ?? new Response(null, { status: 500 }));
    };
    try {
      setGenerationGateway('https://gen.example.test/');
      expect(await checkAi(appWith())).toEqual({ state: 'hidden' });
      expect(await checkAi(appWith())).toEqual({ state: 'ready', providers: ['Tripo', 'Meshy'] });
      expect(calls).toEqual(['https://gen.example.test/v1/providers', 'https://gen.example.test/v1/providers']);
    } finally {
      globalThis.fetch = realFetch;
      setGenerationGateway('');
    }
  });
});

/** Every string of a catalogue with its key path (functions called with a sample value). */
function strings(node: unknown, path: string[] = []): { readonly path: string; readonly text: string }[] {
  if (typeof node === 'string') return [{ path: path.join('.'), text: node }];
  if (typeof node === 'function') return [{ path: path.join('.'), text: String((node as (v: unknown) => unknown)(2)) }];
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([k, v]) => strings(v, [...path, k]));
  }
  return [];
}

describe('the Make and Paint words (§1.3, ST-32)', { timeout: 60_000 }, () => {
  const all = [...strings(makeWords, ['make']), ...strings(paintWords, ['paint'])];
  it('no DCC jargon at L0 or L1; Finish is Matte · Shiny', () => {
    const jargon =
      /\b(extrude|tween|breakdown|ripple|euler|tangents?|IK|FK|influences?|bind pose|lambert|blinn|tris|decimate|retopo\w*)\b/i;
    expect(all.filter((s) => jargon.test(s.text)).map((s) => `${s.path}: ${s.text}`)).toEqual([]);
    expect(paintWords.tray.matte).toBe('Matte');
    expect(paintWords.tray.shiny).toBe('Shiny');
  });
  it('“Move” is translation, never a clip; the selection meanings stay the Thumb key’s', () => {
    expect(all.filter((s) => /\bmoves?\b/i.test(s.text) && /animation|clip/i.test(s.text))).toEqual([]);
    expect(all.filter((s) => /\bselect more\b|\bpick or unpick\b|\bunselect\b/i.test(s.text))).toEqual([]);
  });
  it('“New shape” is only a primitive; “Animation” never appears here', () => {
    expect(all.filter((s) => /\bnew shape\b/i.test(s.text)).map((s) => s.path)).toEqual(['make.tray.newShape']);
    expect(all.filter((s) => /\banimations?\b/i.test(s.text))).toEqual([]);
  });
});
