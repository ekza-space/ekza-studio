// ANIM-LAYERS-SPEC §3–§4 (ADR 0026): layer operators headless — one undo step each, polls with plain reasons, keying
// deltas on an additive layer, full and partial override layers, mute / solo / lock refusals, Auto Key's keyed rule,
// merge down and all (keys and frames) keeping what plays, reorder, duplicate and remove.
import type { ChannelId, ControlId, CurveId, DocSnapshot, KeyRecord, LayerId, LayerRecord } from '@ekza-studio/doc';
import { describe, expect, it } from 'vitest';
import type { EditorApp } from '../../src';
import { DEG, expectUndoRedoExact, opsApp, runOk, runResult, setSceneFrame, WAVE } from './support';

type App = ReturnType<typeof opsApp>;

function layers(app: App): readonly LayerRecord[] {
  return app.store.query.layersOfClip(WAVE.clip);
}

function activeLayer(app: App): LayerId | undefined {
  return app.session.getState().activeLayer?.[WAVE.clip];
}

function keysOn(app: App, layer: LayerId, control: ControlId, channel: ChannelId): readonly KeyRecord[] {
  const curve = app.store.query.curveFor(WAVE.clip, layer, control, channel);
  return curve === undefined ? [] : app.store.query.keysOfCurve(curve.id);
}

function baseKeys(app: App): readonly KeyRecord[] {
  return app.store.query.keysOfCurve(WAVE.curve);
}

/** The composite the Channels panel shows at a clip frame (no overrides). */
function shown(app: EditorApp, frame: number, control: ControlId = WAVE.lowerArmL, channel: ChannelId = 'rz'): number {
  setSceneFrame(app, frame);
  return app.evaluation.channelValue(control, channel);
}

async function pose(
  app: App,
  frame: number,
  value: number,
  control: ControlId = WAVE.lowerArmL,
  channel: ChannelId = 'rz',
) {
  setSceneFrame(app, frame);
  return runOk(app, 'channel.setValues', { edits: [{ control, channel, value }], key: 'force' });
}

async function reason(app: App, id: string, args?: unknown): Promise<string> {
  const result = await runResult(app, id, args);
  expect(result.status).toBe('cancelled');
  return (result as { readonly reason: string }).reason;
}

describe('layer.add, clip.adjustOnLayer, layer.setActive', () => {
  it('adds an additive layer on top and keys into it; one undo step', async () => {
    const app = opsApp();
    const { value } = await expectUndoRedoExact(app, 'layer.add');
    const id = (value as { layer: LayerId }).layer;
    expect(layers(app).map((layer) => layer.name)).toEqual(['Base', 'Layer 1']);
    expect(app.store.get('layers', id)).toMatchObject({ mode: 'additive', weight: 1, mute: false, solo: false });
    expect(activeLayer(app)).toBe(id);
    expect(app.history.peekUndo()?.label).toBe('Add Layer');
    expect(await reason(app, 'layer.add', { weight: 2 })).toMatch(/weight is 0…1/);
    expect(await reason(app, 'layer.add', { mode: 'multiply' })).toMatch(/additive/);
    expect(await reason(app, 'layer.add', { name: 'base' })).toMatch(/exists/);
  });

  it('Adjust on a layer: a "Fixes" layer, active, the base untouched; again gives "Fixes 2"', async () => {
    const app = opsApp();
    const before = JSON.stringify(baseKeys(app));
    await expectUndoRedoExact(app, 'clip.adjustOnLayer');
    expect(layers(app).map((layer) => [layer.name, layer.mode])).toEqual([
      ['Base', 'override'],
      ['Fixes', 'additive'],
    ]);
    expect(app.store.get('layers', activeLayer(app) as LayerId)?.name).toBe('Fixes');
    await runOk(app, 'clip.adjustOnLayer');
    expect(layers(app).at(-1)?.name).toBe('Fixes 2');
    expect(JSON.stringify(baseKeys(app))).toBe(before);
    await runOk(app, 'layer.setActive', { layer: WAVE.layer });
    expect(activeLayer(app)).toBe(WAVE.layer);
  });
});

describe('keying on layers (§3)', () => {
  it('an additive layer keys the delta; the composite shows the pose; the base keys stay', async () => {
    const app = opsApp();
    const before = JSON.stringify(baseKeys(app));
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    const base10 = shown(app, 10);
    await pose(app, 10, base10 + 20 * DEG);
    expect(keysOn(app, fixes, WAVE.lowerArmL, 'rz').map((key) => [key.t, key.v])).toEqual([
      [10, expect.closeTo(20 * DEG, 12)],
    ]);
    expect(shown(app, 10)).toBeCloseTo(base10 + 20 * DEG, 12);
    expect(JSON.stringify(baseKeys(app))).toBe(before);
    // key.set on an untouched control keys a zero delta (scale 1).
    setSceneFrame(app, 10);
    await runOk(app, 'select.controls', { ids: [WAVE.upperArmL], mode: 'replace' });
    await runOk(app, 'key.set', { channels: 'all' });
    const zero = ['tx', 'rx', 'ry', 'rz', 'sx'].map(
      (channel) => keysOn(app, fixes, WAVE.upperArmL, channel as ChannelId)[0]?.v,
    );
    expect(zero.filter((v) => v !== undefined).every((v) => v === 0 || v === 1)).toBe(true);
    expect(keysOn(app, fixes, WAVE.upperArmL, 'rz')[0]?.v).toBe(0);
    expect(JSON.stringify(baseKeys(app))).toBe(before);
  });

  it('weight 0.5 halves the fix; keying at that weight keys the doubled delta; weight 0 refuses', async () => {
    const app = opsApp();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    const base10 = shown(app, 10);
    await pose(app, 10, base10 + 20 * DEG);
    await expectUndoRedoExact(app, 'layer.set', { layer: fixes, weight: 0.5 });
    expect(app.history.peekUndo()?.label).toBe('Layer Weight');
    expect(shown(app, 10)).toBeCloseTo(base10 + 10 * DEG, 12);
    await pose(app, 10, base10 + 30 * DEG);
    expect(keysOn(app, fixes, WAVE.lowerArmL, 'rz')[0]?.v).toBeCloseTo(60 * DEG, 12);
    expect(shown(app, 10)).toBeCloseTo(base10 + 30 * DEG, 12);
    await runOk(app, 'layer.set', { layer: fixes, weight: 0 });
    await runOk(app, 'select.controls', { ids: [WAVE.lowerArmL], mode: 'replace' });
    expect(await reason(app, 'key.set')).toMatch(/weight 0/);
  });

  it('mute shows the base only and refuses keys in plain words; solo of the base too', async () => {
    const { app, services } = (await import('./support')).opsAppWith();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    const base10 = shown(app, 10);
    await pose(app, 10, base10 + 20 * DEG);
    await expectUndoRedoExact(app, 'layer.set', { layer: fixes, mute: true });
    expect(app.history.peekUndo()?.label).toBe('Mute Layer');
    expect(shown(app, 10)).toBeCloseTo(base10, 14);
    await runOk(app, 'select.controls', { ids: [WAVE.lowerArmL], mode: 'replace' });
    expect(await reason(app, 'key.set')).toBe('Fixes is muted — unmute it to key');
    const fixKeys = JSON.stringify(keysOn(app, fixes, WAVE.lowerArmL, 'rz'));
    await runOk(app, 'channel.setValues', {
      edits: [{ control: WAVE.lowerArmL, channel: 'rz', value: 1 }],
      key: 'force',
    });
    expect(JSON.stringify(keysOn(app, fixes, WAVE.lowerArmL, 'rz'))).toBe(fixKeys);
    expect(services.toasts.some((toast) => toast.text === 'Fixes is muted — unmute it to key')).toBe(true);
    await runOk(app, 'layer.set', { layer: fixes, mute: false });
    expect(shown(app, 10)).toBeCloseTo(base10 + 20 * DEG, 12);
    await runOk(app, 'layer.set', { layer: WAVE.layer, solo: true });
    expect(shown(app, 10)).toBeCloseTo(base10, 14);
    expect(await reason(app, 'key.set')).toMatch(/soloed/);
  });

  it('a locked layer takes no keys and its keys do not move', async () => {
    const app = opsApp();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    await pose(app, 10, 0.3);
    await runOk(app, 'layer.set', { layer: fixes, locked: true });
    await runOk(app, 'select.controls', { ids: [WAVE.lowerArmL], mode: 'replace' });
    expect(await reason(app, 'key.set')).toBe('Fixes is locked — unlock it to key');
    const key = keysOn(app, fixes, WAVE.lowerArmL, 'rz')[0] as KeyRecord;
    await runOk(app, 'select.keys', { items: [{ key: key.id }], mode: 'replace' });
    await app.runUntyped('graph.keys.move', { dFrames: 5, dValue: 0 });
    expect(keysOn(app, fixes, WAVE.lowerArmL, 'rz')[0]?.t).toBe(10);
  });

  it('Auto Key (keyed-only) keys a fix layer where a layer below animates the channel', async () => {
    const app = opsApp();
    app.prefs.setState({ autoKey: true, autoKeyMode: 'keyed-only' });
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    setSceneFrame(app, 20);
    await runOk(app, 'channel.setValues', {
      edits: [{ control: WAVE.lowerArmL, channel: 'rz', value: 0.1 }],
      key: 'auto',
    });
    expect(keysOn(app, fixes, WAVE.lowerArmL, 'rz').map((key) => key.t)).toEqual([20]);
    // A channel no layer animates still takes a static value (the M1 rule), on the fix layer.
    await runOk(app, 'channel.setValues', {
      edits: [{ control: WAVE.upperArmL, channel: 'rx', value: 0.2 }],
      key: 'auto',
    });
    const curve = app.store.query.curveFor(WAVE.clip, fixes, WAVE.upperArmL, 'rx');
    expect(curve?.staticValue).toBeCloseTo(0.2, 14);
    expect(app.store.query.curveFor(WAVE.clip, WAVE.layer, WAVE.upperArmL, 'rx')).toBeUndefined();
  });

  it('a full override layer keys the pose itself; a partial one couples the rotation triple', async () => {
    const app = opsApp();
    const over = ((await runOk(app, 'layer.add', { mode: 'override', name: 'Hands' })) as { layer: LayerId }).layer;
    await pose(app, 10, 0.4);
    expect(keysOn(app, over, WAVE.lowerArmL, 'rz')[0]?.v).toBe(0.4);
    expect(shown(app, 10)).toBe(0.4);
    await runOk(app, 'layer.set', { layer: over, weight: 0.5 });
    await pose(app, 12, 0.25, WAVE.lowerArmL, 'rx');
    expect(shown(app, 12, WAVE.lowerArmL, 'rx')).toBeCloseTo(0.25, 9);
    for (const channel of ['rx', 'ry', 'rz'] as const)
      expect(keysOn(app, over, WAVE.lowerArmL, channel).length).toBeGreaterThan(0);
    // A full-weight override above covers a fix layer under it.
    const under = ((await runOk(app, 'layer.add', { name: 'Under' })) as { layer: LayerId }).layer;
    await runOk(app, 'layer.reorder', { layer: under, to: 1 });
    await runOk(app, 'layer.set', { layer: over, weight: 1 });
    await runOk(app, 'layer.setActive', { layer: under });
    setSceneFrame(app, 10);
    const result = (await runOk(app, 'channel.setValues', {
      edits: [{ control: WAVE.lowerArmL, channel: 'rz', value: 0.9 }],
      key: 'force',
    })) as { skipped: readonly { message?: string }[] };
    expect(result.skipped[0]?.message).toMatch(/Override layer Hands covers/);
  });
});

describe('layer.set, reorder, duplicate, remove', () => {
  it('refuses base weight, mode changes with curves, bad names; renames', async () => {
    const app = opsApp();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    expect(await reason(app, 'layer.set', { layer: WAVE.layer, weight: 0.5 })).toMatch(/base layer always plays/);
    await runOk(app, 'layer.set', { layer: fixes, mode: 'override' });
    await runOk(app, 'layer.set', { layer: fixes, mode: 'additive' });
    await pose(app, 10, 0.3);
    expect(await reason(app, 'layer.set', { layer: fixes, mode: 'override' })).toMatch(/merge or clear/);
    expect(await reason(app, 'layer.set', { layer: fixes, name: 'Base' })).toMatch(/exists/);
    await expectUndoRedoExact(app, 'layer.set', { layer: fixes, name: 'Arm fix' });
    expect(app.store.get('layers', fixes)?.name).toBe('Arm fix');
  });

  it('reorders above the base only; duplicates with curves and keys; removes with keys, active falls back', async () => {
    const app = opsApp();
    const a = ((await runOk(app, 'layer.add', { name: 'A' })) as { layer: LayerId }).layer;
    await pose(app, 10, 0.3);
    const b = ((await runOk(app, 'layer.add', { name: 'B' })) as { layer: LayerId }).layer;
    expect(await reason(app, 'layer.reorder', { layer: WAVE.layer, to: 'up' })).toMatch(/base layer stays/);
    expect(await reason(app, 'layer.reorder', { layer: b, to: 'up' })).toMatch(/on top/);
    await expectUndoRedoExact(app, 'layer.reorder', { layer: b, to: 'down' });
    expect(layers(app).map((layer) => layer.name)).toEqual(['Base', 'B', 'A']);
    const copy = ((await runOk(app, 'layer.duplicate', { layer: a })) as { layer: LayerId }).layer;
    expect(layers(app).map((layer) => layer.name)).toEqual(['Base', 'B', 'A', 'A copy']);
    expect(keysOn(app, copy, WAVE.lowerArmL, 'rz').map((key) => key.v)).toEqual(
      keysOn(app, a, WAVE.lowerArmL, 'rz').map((key) => key.v),
    );
    expect(activeLayer(app)).toBe(copy);
    const keys = app.store.list('keys').length;
    await expectUndoRedoExact(app, 'layer.remove', { layer: copy });
    expect(app.store.list('keys').length).toBe(keys - 1);
    expect(activeLayer(app)).toBe(a);
    expect(await reason(app, 'layer.remove', { layer: WAVE.layer })).toMatch(/base layer stays/);
  });
});

describe('layer.merge (§4)', () => {
  /** A Wave with a fix of +20° at frames 10 and 25 on the forearm and a fix on the upper arm. */
  async function fixed(app: App): Promise<LayerId> {
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    await pose(app, 10, shown(app, 10) + 20 * DEG);
    await pose(app, 25, shown(app, 25) + 20 * DEG);
    await pose(app, 10, 15 * DEG, WAVE.upperArmL, 'rx');
    return fixes;
  }

  it('merge down at the keys: what plays at every key time stays; the layer goes; one undo step', async () => {
    const app = opsApp();
    const fixes = await fixed(app);
    await runOk(app, 'layer.set', { layer: fixes, weight: 0.5 });
    const times = [0, 10, 15, 25, 30];
    const before = times.map((t) => [shown(app, t), shown(app, t, WAVE.upperArmL, 'rx')]);
    const { value } = await expectUndoRedoExact(app, 'layer.merge', { layer: fixes });
    expect(value).toMatchObject({ layer: WAVE.layer });
    expect(app.history.peekUndo()?.label).toBe('Merge Layer Down');
    expect(layers(app).map((layer) => layer.name)).toEqual(['Base']);
    expect(activeLayer(app)).toBe(WAVE.layer);
    expect(baseKeys(app).map((key) => key.t)).toEqual([0, 10, 15, 25, 30]);
    const after = times.map((t) => [shown(app, t), shown(app, t, WAVE.upperArmL, 'rx')]);
    for (const [i, [rz, rx]] of before.entries()) {
      expect(after[i]?.[0]).toBeCloseTo(rz as number, 12);
      expect(after[i]?.[1]).toBeCloseTo(rx as number, 12);
    }
  });

  it('merge all on frames matches every frame; muted layers stay', async () => {
    const app = opsApp();
    await fixed(app);
    const over = (
      (await runOk(app, 'layer.add', { mode: 'override', name: 'Over', weight: 0.4 })) as { layer: LayerId }
    ).layer;
    await pose(app, 5, 0.7);
    const muted = ((await runOk(app, 'layer.add', { name: 'Muted' })) as { layer: LayerId }).layer;
    await pose(app, 5, 2);
    await runOk(app, 'layer.set', { layer: muted, mute: true });
    const frames = Array.from({ length: 31 }, (_, f) => f);
    const before = frames.map((f) => shown(app, f));
    await expectUndoRedoExact(app, 'layer.merge', { layer: over, scope: 'all', times: 'frames' });
    expect(app.history.peekUndo()?.label).toBe('Merge All Layers');
    expect(layers(app).map((layer) => layer.name)).toEqual(['Base', 'Muted']);
    frames.forEach((f, i) => expect(shown(app, f)).toBeCloseTo(before[i] as number, 10));
    expect(await reason(app, 'layer.merge', { layer: muted })).toMatch(/muted/);
  });

  it('refuses plainly: the base, a locked target', async () => {
    const app = opsApp();
    const fixes = await fixed(app);
    expect(await reason(app, 'layer.merge', { layer: WAVE.layer })).toMatch(/nothing below/);
    await runOk(app, 'layer.set', { layer: WAVE.layer, locked: true });
    expect(await reason(app, 'layer.merge', { layer: fixes })).toBe('Base is locked — unlock it to merge into it');
  });
});

describe('the project file (§7)', () => {
  it('layers persist: a snapshot through JSON reopens with the same stack, lock, mask and what plays', async () => {
    const app = opsApp();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    await pose(app, 10, shown(app, 10) + 20 * DEG);
    await runOk(app, 'layer.set', { layer: fixes, weight: 0.5, locked: true, mask: [WAVE.lowerArmL] });
    const played = [0, 10, 20].map((f) => shown(app, f));
    const reopened = opsApp({ snapshot: JSON.parse(JSON.stringify(app.store.snapshot())) as DocSnapshot });
    expect(
      reopened.store.query.layersOfClip(WAVE.clip).map((l) => [l.name, l.mode, l.weight, l.locked, l.mask]),
    ).toEqual([
      ['Base', 'override', 1, undefined, undefined],
      ['Fixes', 'additive', 0.5, true, [WAVE.lowerArmL]],
    ]);
    expect([0, 10, 20].map((f) => shown(reopened, f))).toEqual(played);
    // a clip of one layer writes no new field (the records stay byte-identical to before layers)
    expect(JSON.stringify(opsApp().store.snapshot().tables.layers)).not.toMatch(/locked|mask/);
  });
});

/** The curve-id type is used by the helpers above; this keeps the import honest under `noUnusedLocals`. */
export type { CurveId };
