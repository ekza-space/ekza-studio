// Where Make's handles sit on screen (STUDIO-TOUCH-SPEC §4.2 B, §11; T8): the extrude cap handle along the cap's
// projected normal, and the Inset / Bevel value handle beside the result. Pure over the app and a projector (the
// viewport's `project`), so the unit tests drive it without a GPU. Pane CSS px; the single pane fills the frame.
import { quatRotateVec3, type Vec3 } from '@ekza-studio/anim-core';
import type { MeshId } from '@ekza-studio/doc';
import { type EditorApp, extrudeManipulatorFrame, worldPlacement } from '@ekza-studio/editor-core';
import type { Point } from '@ekza-studio/ui/touch';

/** What the geometry needs of the viewport: world → pane px (null behind the camera). */
export type Project = (world: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null;

/** The cap handle's centre sits this far from the cap along its projected normal (beyond Pro's arrow, §4.2 B). */
export const CAP_HANDLE_OFFSET_PX = 112;
/** Below this many px per 5 cm the normal points at the camera: the handle goes straight up instead. */
const FACING_PX = 3;
const PROBE = 0.05;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** The cap of an open extrude session on screen: its centre, the handle, and the drag's screen axis and scale. */
export interface CapGeometry {
  /** The cap's centre (the session frame's moved pivot). */
  readonly at: Point;
  /** The handle's centre. */
  readonly handle: Point;
  /** Unit screen direction a drag moves the cap outwards along. */
  readonly dir: Point;
  /** Screen px per world metre along the normal at the cap (> 0). */
  readonly pxPerUnit: number;
  /** The cap normal (world, unit). */
  readonly normal: Vec3;
}

/** The open extrude session's cap on screen, or null (no session, the engine not loaded, the cap off screen). */
export function capGeometry(app: EditorApp, project: Project, offsetPx = CAP_HANDLE_OFFSET_PX): CapGeometry | null {
  const frame = extrudeManipulatorFrame(app);
  if (frame === null) return null;
  // the scale axes are always the cap's own (§5.8): Z is the cap normal whatever the manipulator's space
  const raw = frame.scaleAxes[2];
  const length = norm(raw);
  if (!(length > 1e-9)) return null;
  const normal = scale(raw, 1 / length);
  const at = project(frame.pivot as unknown as readonly [number, number, number]);
  if (at === null) return null;
  const tip = project(add(frame.pivot, scale(normal, PROBE)) as unknown as readonly [number, number, number]);
  let dir: Point = { x: 0, y: -1 };
  let pxPerUnit = 0;
  if (tip !== null) {
    const dx = tip.x - at.x;
    const dy = tip.y - at.y;
    const px = Math.hypot(dx, dy);
    if (px >= FACING_PX) {
      dir = { x: dx / px, y: dy / px };
      pxPerUnit = px / PROBE;
    }
  }
  if (pxPerUnit === 0) {
    // the normal faces the camera: drag up to pull, at the cap's own screen scale (a cap axis, never the normal)
    const side = frame.scaleAxes[0];
    const sideLength = norm(side);
    const across =
      sideLength > 1e-9
        ? project(add(frame.pivot, scale(side, PROBE / sideLength)) as unknown as readonly [number, number, number])
        : null;
    pxPerUnit = across === null ? 1000 : Math.max(Math.hypot(across.x - at.x, across.y - at.y) / PROBE, 1);
  }
  return {
    at: { x: at.x, y: at.y },
    handle: { x: at.x + dir.x * offsetPx, y: at.y + dir.y * offsetPx },
    dir,
    pxPerUnit,
    normal,
  };
}

/** The distance (metres) a drag from `from` to `to` moves the cap along its normal (`speed`: the Thumb key's Fine). */
export function capDistance(cap: Pick<CapGeometry, 'dir' | 'pxPerUnit'>, from: Point, to: Point, speed = 1): number {
  return (((to.x - from.x) * cap.dir.x + (to.y - from.y) * cap.dir.y) / cap.pxPerUnit) * speed;
}

/** A mesh-local point in the world (the mesh's placement through its groups). */
function toWorld(app: EditorApp, mesh: MeshId, p: Vec3): Vec3 | null {
  const record = app.store.get('meshes', mesh);
  if (record === undefined) return null;
  const xf = worldPlacement(app.store, record);
  const scaled: Vec3 = [p[0] * xf.s[0], p[1] * xf.s[1], p[2] * xf.s[2]];
  const r = quatRotateVec3(xf.q, scaled);
  return [r[0] + xf.t[0], r[1] + xf.t[1], r[2] + xf.t[2]];
}

/** The centroid (world) of the selected faces of a mesh, else of its selected edges' ends; null when none. */
export function selectionCentroid(app: EditorApp, mesh: MeshId): Vec3 | null {
  const data = app.meshes.get(mesh)?.data() ?? null;
  if (data === null) return null;
  const verts = new Set<number>();
  let faces: { forEach(fn: (i: number) => void): void };
  let edges: { forEach(fn: (i: number) => void): void };
  try {
    faces = app.components.get(mesh, 'face').faces;
    edges = app.components.get(mesh, 'edge').edges;
  } catch {
    return null;
  }
  const faceCount = data.faceCorner.length;
  faces.forEach((f) => {
    if (f < 0 || f >= faceCount) return;
    const first = data.faceCorner[f] as number;
    let c = first;
    let guard = 0;
    do {
      verts.add(data.cornerVert[c] as number);
      c = data.cornerNext[c] as number;
      guard += 1;
    } while (c !== first && guard < 4096);
  });
  if (verts.size === 0) {
    const edgeCount = data.edgeVerts.length / 2;
    edges.forEach((e) => {
      if (e < 0 || e >= edgeCount) return;
      verts.add(data.edgeVerts[e * 2] as number);
      verts.add(data.edgeVerts[e * 2 + 1] as number);
    });
  }
  if (verts.size === 0) return null;
  const sum: Vec3 = [0, 0, 0];
  for (const v of verts) {
    sum[0] += data.position[v * 3] as number;
    sum[1] += data.position[v * 3 + 1] as number;
    sum[2] += data.position[v * 3 + 2] as number;
  }
  return toWorld(app, mesh, [sum[0] / verts.size, sum[1] / verts.size, sum[2] / verts.size]);
}
