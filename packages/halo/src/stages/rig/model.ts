// The Rig stage's reads (STUDIO-TOUCH-SPEC §7.1, §12; T9): what the tray offers for the document now, the bones a
// skin spot follows (*Who owns this?*, §12.4 step 2), the bone list of the paint session (the union of the bound
// meshes' palettes, as Pro's Paint Weights panel lists it), the controls the bend test turns, and plain bone names.
// Pure over the app: it reads, never writes.
import type { CharacterId, ControlId, MeshId } from '@ekza-studio/doc';
import {
  boundMeshesOf,
  type EditorApp,
  heldKeysOf,
  influencesOf,
  jointName,
  meshKernel,
  quickRigOf,
  skinCharacter,
  skinTargets,
} from '@ekza-studio/editor-core';

/** What the Rig tray offers now (§7.1, §12): an empty state that bridges, never a lock. */
export interface RigTrayState {
  /** Scene meshes that can be rigged (or a model character's meshes to rig again). */
  readonly meshes: number;
  /** The model character the stage works on, or null. */
  readonly character: CharacterId | null;
  /** An imported character (a VRM): its rig came with the file. */
  readonly asset: CharacterId | null;
  /** The character has a bound mesh (Skin and the pose segment apply). */
  readonly bound: boolean;
  /** Quick Rig is open (the card's dots). */
  readonly quickRig: boolean;
}

export function rigTrayState(app: EditorApp): RigTrayState {
  const meshes = app.store
    .list('meshes')
    .filter((mesh) => mesh.deleted === null && 'scene' in mesh.owner && mesh.data !== null).length;
  const character = skinCharacter(app);
  const live = app.store.list('characters').filter((c) => c.deleted === null);
  const active = app.session.getState().activeCharacter;
  const asset =
    (
      live.find((c) => c.id === active && c.source.kind !== 'model') ??
      (character === null ? live.find((c) => c.source.kind !== 'model') : undefined)
    )?.id ?? null;
  return {
    meshes,
    character,
    asset: character === null ? asset : null,
    bound: character !== null && boundMeshesOf(app, character).length > 0,
    quickRig: quickRigOf(app) !== null,
  };
}

/** A VRM human bone as body-part words: `leftUpperArm` → "Left upper arm" (Pro's compact panel, §5.4). */
export function bodyPartLabel(humanBone: string): string {
  const words = humanBone.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A bone's plain name: its body part when it maps to a humanoid bone, else its joint name. */
export function boneLabel(app: EditorApp, key: string): string {
  const record = app.store.get('joints', key as never) as { readonly humanBone?: string | null } | undefined;
  const human = record?.humanBone ?? null;
  return human === null ? jointName(app, key) : bodyPartLabel(human);
}

/** One bone of a skin spot with its weight there (§12.4 *Who owns this?*). */
export interface SpotBone {
  readonly joint: string;
  readonly label: string;
  readonly weight: number;
}

/** The bones a point of a bound mesh follows, heaviest first (at most `limit`); empty for an unweighted point. */
export function bonesAt(app: EditorApp, mesh: MeshId, point: number, limit = 3): SpotBone[] {
  const data = app.meshes.get(mesh)?.data() ?? null;
  const skin = data === null ? null : (meshKernel()?.readSkin(data) ?? null);
  if (skin === null || point < 0 || point >= skin.points) return [];
  const out: SpotBone[] = [];
  for (let k = 0; k < 4; k++) {
    const weight = skin.weights[4 * point + k] as number;
    if (!(weight > 0)) continue;
    const key = skin.palette[skin.joints[4 * point + k] as number]?.key;
    if (key === undefined) continue;
    out.push({ joint: key, label: boneLabel(app, key), weight });
  }
  out.sort((a, b) => b.weight - a.weight || (a.joint < b.joint ? -1 : 1));
  return out.slice(0, limit);
}

/** One row of the bone list (the paint session's *All bones*). */
export interface BoneRow {
  readonly key: string;
  readonly label: string;
  /** The joint's own name (Pro's), shown in grey. */
  readonly name: string;
  readonly depth: number;
  /** Points with weight > 0 over the target meshes. */
  readonly count: number;
  readonly held: boolean;
  readonly role: 'bone' | 'helper' | 'prop';
}

/** Points per palette key with weight > 0 on a mesh. */
function counts(app: EditorApp, mesh: MeshId, out: Map<string, number>): void {
  const data = app.meshes.get(mesh)?.data() ?? null;
  const skin = data === null ? null : (meshKernel()?.readSkin(data) ?? null);
  if (skin === null) return;
  for (let v = 0; v < skin.points; v++) {
    for (let k = 0; k < 4; k++) {
      if (!((skin.weights[4 * v + k] as number) > 0)) continue;
      const key = skin.palette[skin.joints[4 * v + k] as number]?.key;
      if (key !== undefined) out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
}

/** The bones of the target meshes (Pro's Paint Weights list): body order with depth, by name, or flat. */
export function boneRows(app: EditorApp, sort: 'alpha' | 'hierarchy' | 'flat'): BoneRow[] {
  const meshes = skinTargets(app);
  const held = new Set(heldKeysOf(app, skinCharacter(app)));
  const byKey = new Map<string, number>();
  for (const mesh of meshes) counts(app, mesh, byKey);
  const depthOf = (key: string): number => {
    let depth = 0;
    let at = app.store.get('joints', key as never);
    while (at?.parent !== null && at?.parent !== undefined && depth < 64) {
      depth++;
      at = app.store.get('joints', at.parent);
    }
    return depth;
  };
  const rows = influencesOf(app, meshes).map((key): BoneRow => {
    const record = app.store.get('joints', key as never);
    return {
      key,
      label: boneLabel(app, key),
      name: jointName(app, key),
      depth: sort === 'hierarchy' ? depthOf(key) : 0,
      count: byKey.get(key) ?? 0,
      held: held.has(key),
      role: record?.role ?? 'bone',
    };
  });
  if (sort === 'alpha') rows.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return rows;
}

/** The bone painting goes to now, and its mesh (the active influence), or null. */
export function activeBone(app: EditorApp): { readonly joint: string; readonly mesh: MeshId } | null {
  const active = app.session.getState().rig.activeInfluence;
  return active === null ? null : { joint: active.joint, mesh: active.mesh };
}

/** A control the bend test turns, with the channel and the direction that bends the joint (§12.4 step 1). */
export interface BendTarget {
  readonly control: ControlId;
  readonly channel: 'rx' | 'ry' | 'rz';
  /** Radians at the deepest bend (the sign bends the joint forward, never through itself). */
  readonly bend: number;
}

const ELBOW = /lower_?arm|forearm/i;
const KNEE = /lower_?leg|shin|calf/i;

/**
 * The bend test's controls: the FK forearms and shins of the character (their keys name the bone). In the bind
 * T-pose the controls rest world-aligned: an elbow bends forward about Y (the character's right arm points −X, so
 * + turns the hand to the front; the left arm −), a knee bends backward about +X.
 */
export function bendTargets(app: EditorApp, character: CharacterId): BendTarget[] {
  const rig = app.store.query.rigOfCharacter(character);
  if (rig === undefined) return [];
  const out: BendTarget[] = [];
  for (const control of app.store.query.controlsOfRig(rig.id)) {
    if (control.deleted !== null || /\bik\b|\.ik|ik\./i.test(control.key)) continue;
    const name = `${control.key} ${control.name}`;
    if (ELBOW.test(name)) {
      out.push({ control: control.id, channel: 'ry', bend: (control.side === 'L' ? -1 : 1) * ((110 * Math.PI) / 180) });
    } else if (KNEE.test(name)) {
      out.push({ control: control.id, channel: 'rx', bend: (100 * Math.PI) / 180 });
    }
  }
  return out;
}
