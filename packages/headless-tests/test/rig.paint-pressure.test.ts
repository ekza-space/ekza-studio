// STUDIO-TOUCH-SPEC §12.4, AS-ST-16 (Halo T9), headless in Node: Pencil pressure only scales the strengths of a
// stroke's stamps (`StrokeStamp.strength`, folded in at stamp time by the Paint Skin Weights tool), so a pressured
// stroke is an ordinary `skin.weights.paint {mesh, joint, op, value, stamps, mirror, holds}` run: it replays exactly —
// undo then redo restores the same weights bit for bit, and the same arguments on a second fresh app give the same
// weights and the same exported VRM bytes. The Cube Lad is rigged by Auto-Rig's operators; the stamps are built the way
// the tool builds them (strength = opacity × pressure × falloff, Float32), with a pressure that rises and falls along
// the stroke.
import { readFileSync } from 'node:fs';
import { type CharacterId, type MeshId, seededIdSource } from '@ekza-studio/doc';
import {
  type AutoRigRigResult,
  boundMeshesOf,
  createHeadlessEditorApp,
  type EditorApp,
  influencesOf,
  type IntakeReport,
  weightInputsNow,
} from '@ekza-studio/editor-core';
import { describe, expect, it } from 'vitest';
import { validate } from './ops.support';

const ROOT = new URL('../../../', import.meta.url);
const file = (path: string): Uint8Array => new Uint8Array(readFileSync(new URL(path, ROOT)));

async function run<T = unknown>(app: EditorApp, id: string, args?: unknown): Promise<T> {
  const result = await app.runUntyped(id, args);
  if (result.status !== 'finished') throw new Error(`${id}: ${JSON.stringify(result)}`);
  return result.value as T;
}

async function characterReady(app: EditorApp, character: CharacterId): Promise<void> {
  for (let i = 0; i < 500 && app.characters.get(character) === undefined; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (app.characters.get(character) === undefined) throw new Error('no character runtime');
}

interface Rigged {
  readonly app: EditorApp;
  readonly character: CharacterId;
  readonly mesh: MeshId;
  readonly joint: string;
  readonly downloads: { readonly fileName: string; readonly bytes: Uint8Array }[];
}

/** The Cube Lad, rigged and bound by Auto-Rig's operators, in Rig & Skin (one seed: the same ids every time). */
async function riggedLad(): Promise<Rigged> {
  const downloads: { fileName: string; bytes: Uint8Array }[] = [];
  const app = createHeadlessEditorApp({
    validate,
    idSource: seededIdSource(41),
    onDownload: (download) => downloads.push(download),
  });
  const intake = await run<IntakeReport>(app, 'autorig.intake', {
    bytes: file('fixtures/models/cube-lad.glb'),
    name: 'cube-lad.glb',
  });
  await run(app, 'workspace.set', { workspace: 'rig' });
  await app.rig.load();
  await run(app, 'skel.quickRig.start', { meshes: intake.meshes as MeshId[] });
  const { character } = await run<AutoRigRigResult>(app, 'autorig.rig', { straighten: false, rigidParts: false });
  await characterReady(app, character);
  await run(app, 'char.setVrmMeta', { character, patch: { authors: ['Ekza Studio tests'], licensePreset: 'cc0' } });
  const mesh = boundMeshesOf(app, character)[0];
  if (mesh === undefined) throw new Error('no bound mesh');
  const joints = influencesOf(app, [mesh]);
  const upperArm = joints.find((id) => app.store.get('joints', id as never)?.humanBone === 'leftUpperArm');
  const joint = upperArm ?? joints[0];
  if (joint === undefined) throw new Error('no influence');
  return { app, character, mesh, joint, downloads };
}

/** A smooth falloff `1 − 3t² + 2t³` (the brush's default). */
const falloff = (t: number): number => (t >= 1 ? 0 : t <= 0 ? 1 : 1 - 3 * t * t + 2 * t * t * t);

/**
 * The stamps of one stroke over `points` consecutive points: each stamp reaches `reach` points around its centre with
 * strength opacity × pressure × falloff (Float32 values, as `stampArgs` hands them on); the pressure rises from 0.15 to
 * 1 and falls to 0.4 along the stroke (a Pencil's), or is 1 throughout (`pressured: false`, a finger).
 */
function strokeStamps(
  points: number,
  pressured: boolean,
): { readonly points: number[]; readonly strength: number[] }[] {
  const opacity = 0.8;
  const reach = 6;
  const count = 9;
  const stamps: { points: number[]; strength: number[] }[] = [];
  for (let s = 0; s < count; s++) {
    const u = s / (count - 1);
    const pressure = pressured ? (u < 0.6 ? 0.15 + (0.85 * u) / 0.6 : 1 - (0.6 * (u - 0.6)) / 0.4) : 1;
    const centre = Math.min(points - 1, reach + Math.round(u * (points - 2 * reach - 1)));
    const ids: number[] = [];
    const strength: number[] = [];
    for (let v = Math.max(0, centre - reach); v <= Math.min(points - 1, centre + reach); v++) {
      const value = Math.fround(opacity * pressure * falloff(Math.abs(v - centre) / (reach + 1)));
      if (!(value > 0)) continue;
      ids.push(v);
      strength.push(value);
    }
    stamps.push({ points: ids, strength });
  }
  return stamps;
}

/** The mesh's skin weights as comparable plain data (palette keys, joint slots, weights). */
function weightsOf(app: EditorApp, mesh: MeshId): { palette: string[]; joints: number[]; weights: number[] } {
  const inputs = weightInputsNow(app, mesh);
  if (inputs === null) throw new Error('the mesh is not bound or not resident');
  return {
    palette: inputs.skin.palette.map((entry) => entry.key),
    joints: Array.from(inputs.skin.joints),
    weights: Array.from(inputs.skin.weights),
  };
}

async function exportVrm(rigged: Rigged): Promise<Uint8Array> {
  await run(rigged.app, 'autorig.export', { character: rigged.character, target: 'ekza-vrm', fileName: '' });
  const download = rigged.downloads.at(-1);
  if (download === undefined) throw new Error('no download');
  return download.bytes;
}

describe('Pencil pressure replays deterministically (AS-ST-16)', { timeout: 300_000 }, () => {
  it('a pressured stroke: undo/redo restores it bit for bit; a second app gives the same weights and VRM bytes', async () => {
    const a = await riggedLad();
    const points = weightInputsNow(a.app, a.mesh)?.skin.points ?? 0;
    expect(points).toBeGreaterThan(40);
    const args = {
      mesh: a.mesh,
      joint: a.joint,
      op: 'add',
      value: 0.6,
      stamps: strokeStamps(Math.min(points, 80), true),
      mirror: true,
      holds: [],
    };
    const before = weightsOf(a.app, a.mesh);
    await run(a.app, 'skin.weights.paint', args);
    const after = weightsOf(a.app, a.mesh);
    expect(after.weights).not.toEqual(before.weights);
    expect(a.app.history.peekUndo()?.label).toBe('Paint Skin Weights');

    // undo, then redo: the recorded run again, bit for bit
    await run(a.app, 'edit.undo');
    expect(weightsOf(a.app, a.mesh)).toEqual(before);
    await run(a.app, 'edit.redo');
    expect(weightsOf(a.app, a.mesh)).toEqual(after);

    // the same arguments on a second fresh app (the same seed, so the same ids): the same weights and the same file
    const b = await riggedLad();
    expect(b.mesh).toBe(a.mesh);
    expect(weightsOf(b.app, b.mesh)).toEqual(before);
    await run(b.app, 'skin.weights.paint', structuredClone(args));
    expect(weightsOf(b.app, b.mesh)).toEqual(after);
    const [bytesA, bytesB] = [await exportVrm(a), await exportVrm(b)];
    expect(bytesA.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(bytesB).equals(Buffer.from(bytesA))).toBe(true);
  });

  it('pressure changes only the strengths: the same stroke at full pressure gives other weights', async () => {
    const a = await riggedLad();
    const points = Math.min(weightInputsNow(a.app, a.mesh)?.skin.points ?? 0, 80);
    const pressured = strokeStamps(points, true);
    const full = strokeStamps(points, false);
    // the same points per stamp, only the strengths differ
    expect(pressured.map((s) => s.points)).toEqual(full.map((s) => s.points));
    expect(pressured.map((s) => s.strength)).not.toEqual(full.map((s) => s.strength));
    const base = { mesh: a.mesh, joint: a.joint, op: 'add', value: 0.6, mirror: true, holds: [] };
    await run(a.app, 'skin.weights.paint', { ...base, stamps: pressured });
    const light = weightsOf(a.app, a.mesh);
    await run(a.app, 'edit.undo');
    await run(a.app, 'skin.weights.paint', { ...base, stamps: full });
    expect(weightsOf(a.app, a.mesh).weights).not.toEqual(light.weights);
  });
});
