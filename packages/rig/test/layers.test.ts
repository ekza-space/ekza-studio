// ANIM-LAYERS-SPEC §2 (ADR 0026): the ClipSampler over a layer stack — bit-identity of a lone base layer, additive
// and override folds, mute / solo / weight 0, masks, the composite `value`, `keyTimes` and `curveInfo`, agreement with
// `controlStackAt`, and the evaluation budget (3 layers on a ~60-control rig within 2× one layer).
import {
  composeLayerTrs,
  curveEngine,
  eulerToQuat,
  type Frame,
  type InfinityMode,
  quatSlerp,
} from '@ekza-studio/anim-core';
import {
  type ChannelId,
  type ClipId,
  type ControlId,
  type CurveId,
  createMemoryStore,
  type DocumentStore,
  type KeyId,
  type LayerId,
  makeClip,
  makeCurve,
  makeKey,
  makeLayer,
} from '@ekza-studio/doc';
import { describe, expect, it } from 'vitest';
import {
  autoRig,
  type ChannelBuffer,
  type ClipSampler,
  compileRig,
  controlStackAt,
  createClipSampler,
  createCurveCache,
  playingLayers,
  type RigProgram,
} from '../src';
import { IDS, richHumanoid } from './helpers';

const CLIP = 'clip_LayersTest000001' as ClipId;
const BASE = 'lay_LayersBase000001' as LayerId;
const TRS: readonly ChannelId[] = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];

let serial = 0;
const nextId = (prefix: string): string => `${prefix}${String(serial++).padStart(16, '0')}`;

interface Fixture {
  readonly store: DocumentStore;
  readonly program: RigProgram;
  readonly sampler: ClipSampler;
  readonly ch: ChannelBuffer;
  readonly controls: readonly ControlId[];
}

/** The rich humanoid's auto-rig with a clip whose base layer keys `channels` of every control (`keys` keys each). */
function fixture(opts: { readonly channels?: readonly ChannelId[]; readonly keys?: number } = {}): Fixture {
  const skeleton = richHumanoid();
  const program = compileRig(autoRig(skeleton, IDS), skeleton);
  const store = createMemoryStore();
  const channels = opts.channels ?? ['rx', 'ry', 'rz', 'tx'];
  const keys = opts.keys ?? 6;
  store.transact({ label: 'setup' }, (tx) => {
    tx.put('clips', makeClip({ id: CLIP, character: IDS.character, name: 'Walk', fps: { num: 30, den: 1 } }));
    tx.put('layers', makeLayer({ id: BASE, clip: CLIP }));
    program.controlIds.forEach((control, i) => {
      for (const [a, channel] of channels.entries()) {
        const curve = nextId('crv_') as CurveId;
        tx.put('curves', makeCurve({ id: curve, clip: CLIP, layer: BASE, control, channel }));
        for (let k = 0; k < keys; k++) {
          const v = 0.4 * Math.sin((i + 1) * (a + 1) * (k + 1));
          tx.put('keys', makeKey({ id: nextId('k_') as KeyId, clip: CLIP, curve, t: k * 10, v }));
        }
      }
    });
  });
  const cache = createCurveCache(store, curveEngine);
  const sampler = createClipSampler(store, cache, CLIP, program);
  return { store, program, sampler, ch: program.allocChannels(), controls: program.controlIds };
}

/** A layer above the others with curves on `controls` × `channels`, keyed by `value(control index, channel, k)`. */
function addLayer(
  store: DocumentStore,
  fields: { readonly mode: 'additive' | 'override'; readonly weight?: number; readonly order: string },
  controls: readonly ControlId[],
  channels: readonly ChannelId[],
  value: (i: number, channel: ChannelId, k: number) => number,
  opts: { readonly keys?: number; readonly pre?: InfinityMode } = {},
): LayerId {
  const layer = nextId('lay_') as LayerId;
  store.transact({ label: 'layer' }, (tx) => {
    tx.put('layers', makeLayer({ id: layer, clip: CLIP, name: `L${layer.slice(-3)}`, weight: 1, ...fields }));
    controls.forEach((control, i) => {
      for (const channel of channels) {
        const curve = nextId('crv_') as CurveId;
        tx.put('curves', makeCurve({ id: curve, clip: CLIP, layer, control, channel, pre: opts.pre ?? 'constant' }));
        for (let k = 0; k < (opts.keys ?? 2); k++) {
          tx.put(
            'keys',
            makeKey({ id: nextId('k_') as KeyId, clip: CLIP, curve, t: 5 + k * 20, v: value(i, channel, k) }),
          );
        }
      }
    });
  });
  return layer;
}

function snapshot(f: Fixture, frame: Frame): Float64Array {
  f.sampler.sample(frame, f.ch);
  return Float64Array.from(f.ch.values);
}

describe('ClipSampler over layers', () => {
  it('a lone base layer samples each curve exactly (the single-layer path)', () => {
    const f = fixture();
    const control = f.controls[3] as ControlId;
    const index = f.program.controlIndex.get(control) as number;
    for (const frame of [0, 7.5, 33, 61]) {
      const values = snapshot(f, frame);
      for (const [slot, channel] of TRS.entries()) {
        const curve = f.store.query.curveFor(CLIP, BASE, control, channel);
        const expected =
          curve === undefined
            ? slot >= 6
              ? 1
              : 0
            : curveEngine.evaluate(
                curveEngine.compile({
                  keys: f.store.query.keysOfCurve(curve.id),
                  weighted: false,
                  pre: 'constant',
                  post: 'constant',
                }),
                frame,
              );
        expect(values[index * 9 + slot]).toBe(expected);
        expect(f.sampler.value(control, channel, frame)).toBe(curve === undefined ? undefined : expected);
      }
    }
  });

  it('muted, weight-0, soloed-away and empty layers leave the output bit-identical', () => {
    const f = fixture();
    const before = [0, 12, 40].map((frame) => snapshot(f, frame));
    const muted = addLayer(f.store, { mode: 'additive', order: 'b0' }, f.controls, ['rz'], () => 0.3);
    f.store.transact({ label: 'mute' }, (tx) => tx.patch('layers', muted, { mute: true }));
    addLayer(f.store, { mode: 'override', weight: 0, order: 'c0' }, f.controls, ['rx'], () => 1);
    addLayer(f.store, { mode: 'additive', order: 'd0' }, [], ['rx'], () => 1);
    expect([0, 12, 40].map((frame) => snapshot(f, frame))).toEqual(before);
    // Solo the base: every other layer stops playing.
    const loud = addLayer(f.store, { mode: 'additive', order: 'e0' }, f.controls, ['ry'], () => 0.2);
    expect(snapshot(f, 12)).not.toEqual(before[1]);
    f.store.transact({ label: 'solo' }, (tx) => tx.patch('layers', BASE, { solo: true }));
    expect(snapshot(f, 12)).toEqual(before[1]);
    expect(playingLayers(f.store.query.layersOfClip(CLIP)).map((l) => l.id)).toEqual([BASE]);
    f.store.transact({ label: 'solo loud' }, (tx) => tx.patch('layers', loud, { solo: true }));
    expect(playingLayers(f.store.query.layersOfClip(CLIP)).map((l) => l.id)).toEqual([BASE, loud]);
  });

  it('an additive layer adds deltas by weight; scale multiplies; the base keys are untouched', () => {
    const f = fixture({ channels: ['rx', 'ry', 'rz', 'tx', 'sx'] });
    const control = f.controls[5] as ControlId;
    const i = f.program.controlIndex.get(control) as number;
    const base = snapshot(f, 25);
    const keysBefore = f.store.list('keys').length;
    const fixes = addLayer(f.store, { mode: 'additive', order: 'b0' }, [control], ['rz', 'tx', 'sx'], (_i, channel) =>
      channel === 'sx' ? 1.5 : 0.25,
    );
    const layered = snapshot(f, 25);
    expect(layered[i * 9 + 5]).toBeCloseTo((base[i * 9 + 5] as number) + 0.25, 14);
    expect(layered[i * 9 + 0]).toBeCloseTo((base[i * 9 + 0] as number) + 0.25, 14);
    expect(layered[i * 9 + 6]).toBeCloseTo((base[i * 9 + 6] as number) * 1.5, 14);
    expect(layered[i * 9 + 3]).toBe(base[i * 9 + 3]);
    f.store.transact({ label: 'half' }, (tx) => tx.patch('layers', fixes, { weight: 0.5 }));
    const half = snapshot(f, 25);
    expect(half[i * 9 + 5]).toBeCloseTo((base[i * 9 + 5] as number) + 0.125, 14);
    expect(half[i * 9 + 6]).toBeCloseTo((base[i * 9 + 6] as number) * 1.25, 14);
    expect(f.store.list('keys').length).toBe(keysBefore + 6);
    expect(f.store.query.keysOfCurve(f.store.query.curveFor(CLIP, BASE, control, 'rz')?.id as CurveId)).toHaveLength(6);
  });

  it('an override layer slerps the rotation and lerps translation by weight; a mask limits it', () => {
    const f = fixture();
    const [a, b] = [f.controls[2] as ControlId, f.controls[8] as ControlId];
    const ia = f.program.controlIndex.get(a) as number;
    const ib = f.program.controlIndex.get(b) as number;
    const order = f.program.controls[ia]?.rotateOrder ?? 'xyz';
    const base = snapshot(f, 15);
    const over = addLayer(
      f.store,
      { mode: 'override', weight: 0.3, order: 'b0' },
      [a, b],
      ['rx', 'ry', 'rz', 'tx'],
      () => 0.6,
    );
    const out = snapshot(f, 15);
    const expected = quatSlerp(
      eulerToQuat([base[ia * 9 + 3] as number, base[ia * 9 + 4] as number, base[ia * 9 + 5] as number], order),
      eulerToQuat([0.6, 0.6, 0.6], order),
      0.3,
    );
    const got = eulerToQuat([out[ia * 9 + 3] as number, out[ia * 9 + 4] as number, out[ia * 9 + 5] as number], order);
    const dot = Math.abs(got.reduce((s, v, k) => s + v * (expected[k] as number), 0));
    expect(dot).toBeCloseTo(1, 12);
    expect(out[ia * 9]).toBeCloseTo((base[ia * 9] as number) + 0.3 * (0.6 - (base[ia * 9] as number)), 14);
    f.store.transact({ label: 'mask' }, (tx) => tx.patch('layers', over, { mask: [a] }));
    const masked = snapshot(f, 15);
    expect(masked.subarray(ib * 9, ib * 9 + 9)).toEqual(base.subarray(ib * 9, ib * 9 + 9));
    expect(masked.subarray(ia * 9, ia * 9 + 9)).toEqual(out.subarray(ia * 9, ia * 9 + 9));
  });

  it('value, keyTimes and curveInfo report the composite of the playing layers', () => {
    const f = fixture();
    const control = f.controls[4] as ControlId;
    const i = f.program.controlIndex.get(control) as number;
    addLayer(
      f.store,
      { mode: 'additive', order: 'b0' },
      [control],
      ['rz', 'sy'],
      (_i, channel, k) => (channel === 'sy' ? 1.2 : 0.1 * (k + 1)),
      { keys: 2 },
    );
    const values = snapshot(f, 18);
    const differ = TRS.filter((channel, slot) => {
      const v = f.sampler.value(control, channel, 18);
      return v !== undefined && v !== values[i * 9 + slot];
    });
    expect(differ).toEqual([]);
    expect(f.sampler.value(control, 'sy', 18)).toBeCloseTo(1.2, 14);
    expect(f.sampler.keyTimes([control])).toEqual([0, 5, 10, 20, 25, 30, 40, 50]);
    const infos = f.sampler.curveInfo(control);
    expect(infos.filter((info) => info.channel === 'rz')).toHaveLength(2);
  });

  it('controlStackAt composes to what the sampler plays, for every control', () => {
    const f = fixture();
    addLayer(
      f.store,
      { mode: 'additive', weight: 0.7, order: 'b0' },
      f.controls.slice(0, 20),
      ['rx', 'rz'],
      (i) => 0.05 * i,
    );
    addLayer(
      f.store,
      { mode: 'override', weight: 0.4, order: 'c0' },
      f.controls.slice(10, 30),
      ['ry', 'tx'],
      (i) => -0.02 * i,
    );
    const cache = createCurveCache(f.store, curveEngine);
    const frame = 21;
    const values = snapshot(f, frame);
    for (const control of f.controls) {
      const record = f.program.controls[f.program.controlIndex.get(control) as number];
      if (record === undefined) continue;
      const stack = controlStackAt(f.store, CLIP, record, (curve) => {
        const compiled = cache.get(curve.id);
        return compiled.keyCount > 0 ? curveEngine.evaluate(compiled, frame) : null;
      });
      const out = composeLayerTrs(stack.input, stack.entries, record.rotateOrder, new Float64Array(9));
      const i = f.program.controlIndex.get(control) as number;
      expect([...out]).toEqual([...values.subarray(i * 9, i * 9 + 9)]);
    }
  });
});

describe('bench: 3 layers on a humanoid rig (ANIM-LAYERS-SPEC §2 budget: ≤ 2× one layer)', () => {
  function time(f: Fixture, pose: ReturnType<RigProgram['allocPose']>): number {
    const runs = 2000;
    for (let i = 0; i < 200; i++) {
      f.sampler.sample(i % 60, f.ch);
      f.program.evaluate(f.ch, pose);
    }
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      f.sampler.sample((i * 0.37) % 60, f.ch);
      f.program.evaluate(f.ch, pose);
    }
    return (performance.now() - start) / runs;
  }

  it('reports sample + evaluate per frame for 1 and 3 layers (fix layers and full layers)', async ({ annotate }) => {
    const all: ChannelId[] = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];
    const one = fixture({ channels: all, keys: 30 });
    const pose = one.program.allocPose();
    // Interleave measurements to share the machine's state; the best of three per case.
    const fix = fixture({ channels: all, keys: 30 });
    addLayer(
      fix.store,
      { mode: 'additive', order: 'b0' },
      fix.controls.slice(0, 12),
      ['rx', 'ry', 'rz'],
      (i) => 0.01 * i,
      { keys: 4 },
    );
    addLayer(
      fix.store,
      { mode: 'override', weight: 0.5, order: 'c0' },
      fix.controls.slice(20, 32),
      ['rx', 'ry', 'rz'],
      (i) => 0.02 * i,
      { keys: 4 },
    );
    const additive = fixture({ channels: all, keys: 30 });
    for (const order of ['b0', 'c0']) {
      addLayer(additive.store, { mode: 'additive', order }, additive.controls, ['rx', 'ry', 'rz'], (i) => 0.01 * i, {
        keys: 8,
      });
    }
    const mixed = fixture({ channels: all, keys: 30 });
    addLayer(mixed.store, { mode: 'additive', order: 'b0' }, mixed.controls, ['rx', 'ry', 'rz'], (i) => 0.01 * i, {
      keys: 8,
    });
    addLayer(
      mixed.store,
      { mode: 'override', weight: 0.5, order: 'c0' },
      mixed.controls,
      ['rx', 'ry', 'rz'],
      (i) => 0.02 * i,
      { keys: 8 },
    );
    const best = { one: Infinity, fix: Infinity, additive: Infinity, mixed: Infinity };
    for (let round = 0; round < 3; round++) {
      best.one = Math.min(best.one, time(one, pose));
      best.fix = Math.min(best.fix, time(fix, pose));
      best.additive = Math.min(best.additive, time(additive, pose));
      best.mixed = Math.min(best.mixed, time(mixed, pose));
    }
    const us = (ms: number): string => `${(ms * 1000).toFixed(1)} µs (${(ms / best.one).toFixed(2)}×)`;
    await annotate(
      `sample+evaluate per frame, ${one.program.controls.length} controls, base keyed on all 9 channels × 30 keys: ` +
        `1 layer ${(best.one * 1000).toFixed(1)} µs; 3 layers — two fix layers on 12 controls each ` +
        `(additive, override 50 %) ${us(best.fix)}; two additive layers on every control's rotation ${us(best.additive)}; ` +
        `additive + override 50 % on every control's rotation ${us(best.mixed)}`,
    );
    // Reported, not a CI gate (ARCHITECTURE §14); a loose sanity bound against regressions of an order of magnitude.
    expect(best.fix / best.one).toBeLessThan(4);
  });
});
