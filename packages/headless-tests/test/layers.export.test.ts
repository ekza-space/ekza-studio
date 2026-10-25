// ANIM-LAYERS-SPEC §6 and §8 (ADR 0026) on the production kernel: Seed-san with the library's Walk.
//
// - Golden: with only a base layer the VRMA, animation GLB, surgeon bake and the character writer's VRM are the bytes
//   of dev `5689ba17`, before layers existed (the hashes below were computed there by this file's setup); an empty,
//   a muted and a weight-0 layer change nothing.
// - The owner's journey: Walk → Adjust on a layer → at frames 10 and 30 raise the right arm and tilt the torso →
//   weight 0.5 → mute, unmute → merge. The base keys stay as they were until the merge; every export equals the
//   evaluated motion at every frame (VRMA read back against the pose buffers' normalized rotations); muting gives the
//   golden bytes back; after the merge the base alone plays what the layers did.
import { existsSync, readFileSync } from 'node:fs';
import { type Quat, sha256Hex } from '@ekza-studio/anim-core';
import type { CharacterId, ClipId, ControlId, HumanBoneName, LayerId } from '@ekza-studio/doc';
import { type EditorApp, loadMeshKernel } from '@ekza-studio/editor-core';
import { type ExportArtifact, parseGlb, readVrma } from '@ekza-studio/io';
import { HUMAN_BONE_NAMES } from '@ekza-studio/rig';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCharacter, readyCharacter } from './m6b.writer.support';
import { BLOCKED, importFixture, realApp, runOk, SIBLINGS_READY, setSceneFrame } from './ops.support';

/** dev `5689ba17` (no layers), the same setup: Seed-san + library Walk; the writer's ready body character. */
const GOLDEN = {
  vrma: '6d39ebf83f5ee958fb51ac46f0052173dbdd18f2a6f6fc55cb755a3704b46b64',
  'animation-glb': '136abaca23163350a98ae47dce4a10a3272fc0a043313343971772862cb14afb',
  'bake-into-model': 'd4e83ce196c273c9dcc4a8938b18d517e4217b3a20b3c279caad48fee94a1957',
  'character-vrm': 'c67269008fc62a1a857e61709620467272cc19bca8979038d6dacbf3cb0e3203',
} as const;
type Kind = 'vrma' | 'animation-glb' | 'bake-into-model';
const KINDS: readonly Kind[] = ['vrma', 'animation-glb', 'bake-into-model'];
const DEG = Math.PI / 180;

const ROOT = new URL('../../../', import.meta.url);
function staticFetch(url: string | URL): Promise<Response> {
  const path = String(url).startsWith('/library/') ? `apps/web/public/library/${String(url).slice(9)}` : null;
  const file = path === null ? null : new URL(path, ROOT);
  if (file === null || !existsSync(file)) return Promise.resolve(new Response(null, { status: 404 }));
  return Promise.resolve(new Response(new Uint8Array(readFileSync(file)).buffer, { status: 200 }));
}

beforeAll(async () => {
  await loadMeshKernel();
});
beforeEach(() => {
  vi.stubGlobal('fetch', staticFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

interface Walk {
  readonly app: EditorApp;
  readonly character: CharacterId;
  readonly clip: ClipId;
  control(key: string): ControlId;
}

async function walk(): Promise<Walk> {
  const { app } = realApp({ validator: false });
  const { character } = await importFixture(app, 'seed-san.vrm');
  await app.library.load();
  const { clip } = (await runOk(app, 'library.useClip', { character, clip: 'walk' })) as { clip: ClipId };
  await runOk(app, 'clip.setActive', { clip });
  const control = (key: string): ControlId => {
    const found = app.store.list('controls').find((c) => c.key === key);
    if (found === undefined) throw new Error(`no ${key}`);
    return found.id;
  };
  return { app, character, clip, control };
}

async function exportBytes(w: Walk, kind: Kind): Promise<Uint8Array> {
  const [artifact] = (await runOk(w.app, 'file.export', {
    kind,
    character: w.character,
    clips: [w.clip],
    fileNamePattern: '{character}_{clip}',
    closeLoop: false,
    includeConstantTracks: true,
    acknowledgeLicense: true,
    profile: null,
  })) as ExportArtifact[];
  if (artifact === undefined) throw new Error(`no ${kind}`);
  return artifact.bytes;
}

async function hashes(w: Walk): Promise<Record<Kind, string>> {
  const out = {} as Record<Kind, string>;
  for (const kind of KINDS) out[kind] = sha256Hex(await exportBytes(w, kind));
  return out;
}

/** The base layer's keys as JSON (ids, times, values, tangents). */
function baseKeys(w: Walk): string {
  const base = w.app.store.query.baseLayer(w.clip);
  const curves = w.app.store.query.curvesOfClip(w.clip).filter((curve) => curve.layer === base?.id);
  return JSON.stringify(curves.map((curve) => [curve.id, w.app.store.query.keysOfCurve(curve.id)]));
}

/** The rotation angle between two unit quaternions (sign-insensitive; atan2 keeps precision near 0). */
function quatGap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const sign =
    (a[0] as number) * (b[0] as number) +
      (a[1] as number) * (b[1] as number) +
      (a[2] as number) * (b[2] as number) +
      (a[3] as number) * (b[3] as number) <
    0
      ? -1
      : 1;
  let diff = 0;
  let sum = 0;
  for (let c = 0; c < 4; c++) {
    diff += ((a[c] as number) - sign * (b[c] as number)) ** 2;
    sum += ((a[c] as number) + sign * (b[c] as number)) ** 2;
  }
  return 4 * Math.atan2(Math.sqrt(diff), Math.sqrt(sum));
}

/**
 * The VRMA of the clip read back against the evaluated pose (the pose buffers' normalized rotations `N_b`) at every
 * sample: the largest rotation gap in radians over every humanoid track.
 */
async function vrmaGap(w: Walk): Promise<{ readonly worst: number; readonly samples: number }> {
  const data = readVrma(await parseGlb(await exportBytes(w, 'vrma')));
  const runtime = w.app.characters.get(w.character);
  if (runtime === undefined) throw new Error('no runtime');
  const pose = runtime.program.allocPose();
  const clip = w.app.store.get('clips', w.clip);
  const fps = (clip?.fps.num ?? 30) / (clip?.fps.den ?? 1);
  let worst = 0;
  let samples = 0;
  const tracks = Object.entries(data.rotations) as [HumanBoneName, { times: Float32Array; values: Float32Array }][];
  const times = tracks[0]?.[1].times ?? new Float32Array();
  for (let i = 0; i < times.length; i++) {
    const frame = Math.round((times[i] as number) * fps);
    w.app.evaluation.evaluateAt(w.character, w.clip, frame, pose);
    for (const [bone, track] of tracks) {
      const index = HUMAN_BONE_NAMES.indexOf(bone);
      const k = track.times.findIndex((t) => Math.abs(t - (times[i] as number)) < 1e-6);
      if (index === -1 || k === -1) continue;
      const got = track.values.subarray(k * 4, k * 4 + 4);
      const want = pose.humanLocal.subarray(index * 4, index * 4 + 4);
      worst = Math.max(worst, quatGap(got, want));
      samples++;
    }
  }
  return { worst, samples };
}

/** The right upper arm's normalized rotation at a frame (what the person sees move). */
function armAt(w: Walk, frame: number): Quat {
  const runtime = w.app.characters.get(w.character);
  if (runtime === undefined) throw new Error('no runtime');
  const pose = runtime.program.allocPose();
  w.app.evaluation.evaluateAt(w.character, w.clip, frame, pose);
  const index = HUMAN_BONE_NAMES.indexOf('rightUpperArm');
  return Array.from(pose.humanLocal.subarray(index * 4, index * 4 + 4)) as Quat;
}

/** Halo's Rec keys what the person poses: one channel edit per part at the playhead, keyed. */
async function poseBy(
  w: Walk,
  frame: number,
  control: ControlId,
  channel: 'rx' | 'rz',
  degrees: number,
): Promise<void> {
  setSceneFrame(w.app, frame);
  const value = w.app.evaluation.channelValue(control, channel) + degrees * DEG;
  await runOk(w.app, 'channel.setValues', { edits: [{ control, channel, value }], key: 'force' });
}

describe.skipIf(!SIBLINGS_READY)(`animation layers in the exports ${BLOCKED}`, { timeout: 300_000 }, () => {
  it('golden: a lone base layer exports the bytes of dev before layers; no-op layers change nothing', async () => {
    const w = await walk();
    expect(await hashes(w)).toEqual({
      vrma: GOLDEN.vrma,
      'animation-glb': GOLDEN['animation-glb'],
      'bake-into-model': GOLDEN['bake-into-model'],
    });
    // An empty fix layer, a muted keyed one and a weight-0 keyed one add nothing.
    await runOk(w.app, 'clip.adjustOnLayer');
    expect((await hashes(w)).vrma).toBe(GOLDEN.vrma);
    const fixes = (w.app.session.getState().activeLayer?.[w.clip] ?? '') as LayerId;
    await poseBy(w, 10, w.control('fk.upperArm.R'), 'rz', -30);
    expect((await hashes(w)).vrma).not.toBe(GOLDEN.vrma);
    await runOk(w.app, 'layer.set', { layer: fixes, mute: true });
    expect(await hashes(w)).toEqual({
      vrma: GOLDEN.vrma,
      'animation-glb': GOLDEN['animation-glb'],
      'bake-into-model': GOLDEN['bake-into-model'],
    });
    await runOk(w.app, 'layer.set', { layer: fixes, mute: false, weight: 0 });
    expect((await hashes(w)).vrma).toBe(GOLDEN.vrma);
    w.app.dispose();
  });

  it('golden: the character writer — one base layer as before; a fix layer exports, muted it is the golden', async () => {
    const { app } = realApp({ validator: false });
    const made = await readyCharacter(app);
    const args = { character: made.character, format: 'vrm', clips: 'slots', validate: false };
    expect(sha256Hex((await exportCharacter(app, args)).bytes)).toBe(GOLDEN['character-vrm']);
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    const arm = app.store.list('controls').find((c) => c.key === 'fk.upperArm.R' || c.key === 'fk.upperArm.L');
    if (arm === undefined) throw new Error('no arm control');
    setSceneFrame(app, 10);
    await runOk(app, 'channel.setValues', { edits: [{ control: arm.id, channel: 'rz', value: 0.4 }], key: 'force' });
    const layered = sha256Hex((await exportCharacter(app, args)).bytes);
    expect(layered).not.toBe(GOLDEN['character-vrm']);
    await runOk(app, 'layer.set', { layer: fixes, mute: true });
    expect(sha256Hex((await exportCharacter(app, args)).bytes)).toBe(GOLDEN['character-vrm']);
    app.dispose();
  });

  it('the journey: fix a Walk on a layer, weight, mute, merge — the base intact until the merge, exports = what plays', async ({
    annotate,
  }) => {
    const w = await walk();
    const before = baseKeys(w);
    const golden = await vrmaGap(w);
    expect(golden.worst).toBeLessThan(1e-5);
    // Adjust on a layer
    const fixes = ((await runOk(w.app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    expect(w.app.store.get('layers', fixes)).toMatchObject({ name: 'Fixes', mode: 'additive', weight: 1 });
    // frames 10 and 30: raise the right arm, tilt the torso
    const arm = w.control('fk.upperArm.R');
    const torso = w.control('fk.spine');
    const arm10 = armAt(w, 10);
    for (const frame of [10, 30]) {
      await poseBy(w, frame, arm, 'rz', -35);
      await poseBy(w, frame, torso, 'rx', 8);
    }
    expect(baseKeys(w)).toBe(before);
    const fixed10 = armAt(w, 10);
    expect(quatGap(fixed10, arm10)).toBeGreaterThan(30 * DEG);
    const layered = await vrmaGap(w);
    expect(layered.samples).toBeGreaterThanOrEqual(golden.samples);
    expect(layered.worst).toBeLessThan(1e-5);
    await annotate(
      `VRMA read back vs the evaluated N_b: Walk alone ${golden.worst.toExponential(2)} rad over ${golden.samples} ` +
        `samples; with the fix layer ${layered.worst.toExponential(2)} rad over ${layered.samples} samples`,
    );
    // weight 0.5: halfway, and still the export of what plays
    await runOk(w.app, 'layer.set', { layer: fixes, weight: 0.5 });
    const half10 = armAt(w, 10);
    expect(quatGap(half10, arm10)).toBeGreaterThan(10 * DEG);
    expect(quatGap(half10, fixed10)).toBeGreaterThan(10 * DEG);
    expect((await vrmaGap(w)).worst).toBeLessThan(1e-5);
    const halfBytes = sha256Hex(await exportBytes(w, 'vrma'));
    // mute: the Walk's own bytes; unmute: the half-weight bytes again
    await runOk(w.app, 'layer.set', { layer: fixes, mute: true });
    expect(sha256Hex(await exportBytes(w, 'vrma'))).toBe(GOLDEN.vrma);
    await runOk(w.app, 'layer.set', { layer: fixes, mute: false });
    expect(sha256Hex(await exportBytes(w, 'vrma'))).toBe(halfBytes);
    expect(baseKeys(w)).toBe(before);
    // merge (at the keys): one layer again, the base changed, the arm at the fixed frames as it played
    const clip = w.app.store.get('clips', w.clip);
    const frames = Array.from({ length: (clip?.range.end ?? 0) - (clip?.range.start ?? 0) + 1 }, (_, i) => i);
    const played = frames.map((frame) => armAt(w, frame));
    await runOk(w.app, 'layer.merge', { layer: fixes });
    expect(w.app.store.query.layersOfClip(w.clip)).toHaveLength(1);
    expect(baseKeys(w)).not.toBe(before);
    for (const frame of [10, 30]) expect(quatGap(armAt(w, frame), played[frame] as Quat)).toBeLessThan(1e-9);
    expect((await vrmaGap(w)).worst).toBeLessThan(1e-5);
    // undo the merge; merge on every frame: the base alone plays exactly what the layers did, at every frame
    await runOk(w.app, 'edit.undo');
    expect(baseKeys(w)).toBe(before);
    await runOk(w.app, 'layer.merge', { layer: fixes, times: 'frames' });
    for (const frame of frames) expect(quatGap(armAt(w, frame), played[frame] as Quat)).toBeLessThan(1e-9);
    w.app.dispose();
  });
});
