// ANIM-LAYERS (ADR 0026, ANIM-LAYERS-SPEC §8): the owner's journey on both shells — Seed-san with the library's Walk,
// a fix layer above it, the arm raised and the torso tilted at frames 10 and 30 — and the export checks: the VRMA read
// back in Node (io's reader), the base layer's keys, and screenshots for the review when `EKZA_LAYERS_SHOTS` names a
// folder.
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseGlb, readVrma } from '@ekza-studio/io';
import { expect, type Locator, type Page } from '@playwright/test';
import { call, lastExport, run, runOk } from './test-api';

const DEG = Math.PI / 180;

export interface WalkScene {
  readonly character: string;
  readonly clip: string;
}

/** Seed-san (already loaded) with the library's Walk added (Pro's Clip Library call) and active. */
export async function addWalk(page: Page, character: string): Promise<WalkScene> {
  const { clip } = await runOk<{ clip: string }>(page, 'library.useClip', { character, clip: 'walk' });
  await runOk(page, 'clip.setActive', { clip });
  return { character, clip };
}

/** The base layer's curves and keys of a clip as JSON (unchanged until a merge). */
export async function baseKeys(page: Page, clip: string): Promise<string> {
  const layers = await call(page, 'layers', clip);
  const base = layers[0]?.id;
  const curves = (await call(page, 'curves', clip)).filter((curve) => curve.layer === base);
  return JSON.stringify(curves.map((curve) => [curve.id, curve.keys]));
}

/** The ControlId of a template key. */
export async function controlOf(page: Page, key: string): Promise<string> {
  const found = (await call(page, 'controls')).find((control) => control.key === key);
  if (found === undefined) throw new Error(`no control ${key}`);
  return found.id;
}

/**
 * The fix: at frames 10 and 30 the right arm raised by 35° (its upper arm's Side) and the torso tilted forward by 8°
 * (the spine's Bend) — keyed at the playhead, as Rec and Auto Key key a pose (here through `channel.setValues`, the
 * path the manipulators and the Channels panel share).
 */
export async function fixWalk(page: Page, key: 'force' | 'auto' = 'force'): Promise<void> {
  const arm = await controlOf(page, 'fk.upperArm.R');
  const torso = await controlOf(page, 'fk.spine');
  for (const frame of [10, 30]) {
    await runOk(page, 'time.setFrame', { frame });
    const armZ = (await call(page, 'channelValues', arm))['rz'] ?? 0;
    const torsoX = (await call(page, 'channelValues', torso))['rx'] ?? 0;
    await runOk(page, 'channel.setValues', {
      edits: [
        { control: arm, channel: 'rz', value: armZ - 35 * DEG },
        { control: torso, channel: 'rx', value: torsoX + 8 * DEG },
      ],
      key,
    });
  }
}

/** Exports the clip as VRMA through the shipped exporter; its bytes and sha256. */
export async function vrmaOf(
  page: Page,
  scene: WalkScene,
): Promise<{ readonly bytes: Buffer; readonly sha256: string }> {
  const result = await run(page, 'file.export', {
    kind: 'vrma',
    character: scene.character,
    clips: [scene.clip],
    fileNamePattern: '{clip}',
    closeLoop: false,
    includeConstantTracks: true,
    acknowledgeLicense: true,
    profile: null,
  });
  expect(result.status, JSON.stringify(result)).toBe('finished');
  const last = await lastExport(page);
  if (last === null) throw new Error('no export');
  return { bytes: last.bytes, sha256: createHash('sha256').update(last.bytes).digest('hex') };
}

/** The rotation gap (radians) between two unit quaternions; sign-insensitive, precise near 0. */
function quatGap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  for (let c = 0; c < 4; c++) dot += (a[c] as number) * (b[c] as number);
  const sign = dot < 0 ? -1 : 1;
  let diff = 0;
  let sum = 0;
  for (let c = 0; c < 4; c++) {
    diff += ((a[c] as number) - sign * (b[c] as number)) ** 2;
    sum += ((a[c] as number) + sign * (b[c] as number)) ** 2;
  }
  return 4 * Math.atan2(Math.sqrt(diff), Math.sqrt(sum));
}

/** The humanoid rotation tracks of a VRMA, read back with io's reader. */
async function tracksOf(bytes: Uint8Array) {
  return readVrma(await parseGlb(bytes)).rotations;
}

/** The largest rotation gap of two VRMAs over every humanoid track they share, sampled at the first one's keys. */
export async function vrmaGap(a: Uint8Array, b: Uint8Array): Promise<number> {
  const ta = await tracksOf(a);
  const tb = await tracksOf(b);
  let worst = 0;
  for (const [bone, track] of Object.entries(ta)) {
    const other = tb[bone as keyof typeof tb];
    if (track === undefined || other === undefined) continue;
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i] as number;
      const k = other.times.findIndex((u) => Math.abs(u - t) < 1e-6);
      // a constant track keeps two keys: it holds its first value
      const j = k === -1 ? 0 : k;
      worst = Math.max(
        worst,
        quatGap(track.values.subarray(i * 4, i * 4 + 4), other.values.subarray(j * 4, j * 4 + 4)),
      );
    }
  }
  return worst;
}

/** The right upper arm's rotation in a VRMA at a time (seconds), from its nearest key. */
export async function armAt(bytes: Uint8Array, seconds: number): Promise<readonly number[]> {
  const track = (await tracksOf(bytes)).rightUpperArm;
  if (track === undefined) throw new Error('no rightUpperArm track');
  let best = 0;
  for (let i = 0; i < track.times.length; i++) {
    if (Math.abs((track.times[i] as number) - seconds) < Math.abs((track.times[best] as number) - seconds)) best = i;
  }
  return Array.from(track.values.subarray(best * 4, best * 4 + 4));
}

export function armGap(a: readonly number[], b: readonly number[]): number {
  return quatGap(a, b);
}

/** A screenshot for the review into `EKZA_LAYERS_SHOTS` (nothing when unset). */
export async function shot(target: Page | Locator, name: string): Promise<void> {
  const dir = process.env['EKZA_LAYERS_SHOTS'];
  if (dir === undefined || dir === '') return;
  mkdirSync(dir, { recursive: true });
  await target.screenshot({ path: join(dir, `layers-${name}.png`) });
}
