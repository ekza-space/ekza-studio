// STUDIO-TOUCH-SPEC §12.4, §5.1, AS-ST-12 (Halo T9): the weight brush on touch and the Pencil — stamps every 0.25 r
// ALONG the path through every coalesced sample, interpolated, so a fast stroke leaves no gap (`strokeSteps`); a pen's
// pressure scales the stamp strengths at stamp time (opacity × pressure × falloff), read only for a pen on the
// arbiter's path while the app's toggle is on (`strokeReadsPressure`); fingers and the mouse keep their strengths.
import type { EditorApp } from '@ekza-studio/editor-core';
import { describe, expect, it } from 'vitest';
import {
  type PaintSurface,
  paneRay,
  pickSurfaces,
  type StrokePoint,
  stampAt,
  strokeSteps,
} from '../src/tools/rig/paint/pick';
import {
  pressureFactor,
  setStrokePressure,
  strokePressure,
  strokeReadsPressure,
  subscribeStrokePressure,
} from '../src/tools/rig/paint/pressure';
import type { CameraSnapshot } from '../src/types';

const P = (x: number, y: number, pressure: number | null = null): StrokePoint => ({ x, y, pressure });

/** The largest distance between consecutive points (from `from` through `points`). */
function largestGap(from: StrokePoint, points: readonly StrokePoint[]): number {
  let prev = from;
  let gap = 0;
  for (const point of points) {
    gap = Math.max(gap, Math.hypot(point.x - prev.x, point.y - prev.y));
    prev = point;
  }
  return gap;
}

describe('stamps along the path (strokeSteps)', () => {
  it('a stamp every spacing px along a segment; the travel after the last one carries over', () => {
    const run = strokeSteps(P(0, 0), [P(100, 0)], 10, 0);
    expect(run.points.map((p) => p.x)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(run.points.every((p) => p.y === 0)).toBe(true);
    expect(run.carry).toBe(0);
    const carried = strokeSteps(P(0, 0), [P(20, 0)], 10, 4);
    expect(carried.points.map((p) => p.x)).toEqual([6, 16]);
    expect(carried.carry).toBeCloseTo(4, 12);
  });

  it('a short move places nothing and carries its travel; the next move places at the spacing', () => {
    const first = strokeSteps(P(0, 0), [P(5, 0)], 10, 0);
    expect(first.points).toEqual([]);
    expect(first.carry).toBe(5);
    const second = strokeSteps(P(5, 0), [P(12, 0)], 10, first.carry);
    expect(second.points.map((p) => p.x)).toEqual([10]);
    expect(second.carry).toBeCloseTo(2, 12);
  });

  it('coalesced samples are walked in order: the stamps follow the polyline, not the chord', () => {
    const run = strokeSteps(P(0, 0), [P(10, 0), P(10, 10), P(0, 10)], 5, 0);
    expect(run.points.map((p) => [p.x, p.y])).toEqual([
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [5, 10],
      [0, 10],
    ]);
    expect(run.carry).toBe(0);
  });

  it('a long fast segment (one 60 Hz event) leaves no gap wider than the spacing', () => {
    const spacing = 7;
    const from = P(0, 0);
    const run = strokeSteps(from, [P(300, 400)], spacing, 0);
    expect(run.points.length).toBe(Math.floor(500 / spacing));
    expect(largestGap(from, run.points)).toBeLessThanOrEqual(spacing + 1e-9);
    // what is left to the end is shorter than the spacing, and carries to the next move
    const last = run.points.at(-1) as StrokePoint;
    expect(Math.hypot(300 - last.x, 400 - last.y)).toBeLessThan(spacing);
    expect(run.carry).toBeCloseTo(500 - spacing * Math.floor(500 / spacing), 9);
    // the same stroke cut into fast events with sparse samples stamps at the same distances along the path
    let carry = 0;
    let prev = from;
    const pieces: StrokePoint[] = [];
    for (const end of [P(60, 80), P(150, 200), P(300, 400)]) {
      const step = strokeSteps(prev, [end], spacing, carry);
      pieces.push(...step.points);
      carry = step.carry;
      prev = end;
    }
    expect(pieces.length).toBe(run.points.length);
    pieces.forEach((point, i) => {
      expect(point.x).toBeCloseTo((run.points[i] as StrokePoint).x, 9);
      expect(point.y).toBeCloseTo((run.points[i] as StrokePoint).y, 9);
    });
  });

  it('pressure is interpolated along the path; null stays null, a missing end takes the other', () => {
    const run = strokeSteps(P(0, 0, 0.2), [P(40, 0, 0.6)], 10, 0);
    expect(run.points.map((p) => p.pressure)).toHaveLength(4);
    run.points.forEach((p, i) => expect(p.pressure).toBeCloseTo([0.3, 0.4, 0.5, 0.6][i] as number, 12));
    expect(strokeSteps(P(0, 0), [P(20, 0)], 10, 0).points.every((p) => p.pressure === null)).toBe(true);
    expect(strokeSteps(P(0, 0, null), [P(20, 0, 0.8)], 10, 0).points.map((p) => p.pressure)).toEqual([0.8, 0.8]);
  });

  it('zero-length samples are skipped; a spacing that is not positive stamps at every sample', () => {
    expect(strokeSteps(P(3, 3), [P(3, 3), P(3, 3)], 10, 2)).toEqual({ points: [], carry: 2 });
    const every = strokeSteps(P(0, 0), [P(1, 0), P(1, 0), P(2, 0)], 0, 0);
    expect(every.points.map((p) => p.x)).toEqual([1, 2]);
  });
});

describe('Pencil pressure (§5.1: pens only, the toggle on)', () => {
  const app = {} as EditorApp;
  it('the factor clamps to 0…1; a non-finite pressure is full strength', () => {
    expect([-1, 0, 0.3, 1, 2, Number.NaN].map(pressureFactor)).toEqual([0, 0, 0.3, 1, 1, 1]);
  });

  it('read only for a pen that carries pressure, while the toggle is on; listeners hear the toggle', () => {
    expect(strokePressure(app)).toBe(true);
    expect(strokeReadsPressure(app, { pointerType: 'pen', pressure: 0.4 })).toBe(true);
    // touch reports 0.5 (it would halve every stroke), the mouse never: their strengths stay the chip's
    expect(strokeReadsPressure(app, { pointerType: 'touch', pressure: 0.5 })).toBe(false);
    expect(strokeReadsPressure(app, { pointerType: 'mouse', pressure: 0.5 })).toBe(false);
    // a pen outside the arbiter's path (Studio Pro) carries no pressure: unchanged
    expect(strokeReadsPressure(app, { pointerType: 'pen' })).toBe(false);
    const heard: boolean[] = [];
    const off = subscribeStrokePressure(app, () => heard.push(strokePressure(app)));
    setStrokePressure(app, false);
    setStrokePressure(app, false);
    expect(strokeReadsPressure(app, { pointerType: 'pen', pressure: 0.4 })).toBe(false);
    setStrokePressure(app, true);
    off();
    setStrokePressure(app, false);
    expect(heard).toEqual([false, true]);
    setStrokePressure(app, true);
    // another app has its own toggle
    expect(strokePressure({} as EditorApp)).toBe(true);
  });
});

/** A 5 × 5 point grid (0.1 m) in z = 0 facing +Z. */
function grid(): PaintSurface {
  const positions: number[] = [];
  const tris: number[] = [];
  const n = 5;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) positions.push(-0.2 + 0.1 * i, -0.2 + 0.1 * j, 0);
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      tris.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  }
  const count = positions.length / 3;
  const neighbours: Set<number>[] = Array.from({ length: count }, () => new Set());
  const incident: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < tris.length / 3; t++) {
    const v = [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]] as number[];
    for (let k = 0; k < 3; k++) {
      (incident[v[k] as number] as number[]).push(t);
      (neighbours[v[k] as number] as Set<number>).add(v[(k + 1) % 3] as number);
      (neighbours[v[(k + 1) % 3] as number] as Set<number>).add(v[k] as number);
    }
  }
  const csr = (lists: readonly Iterable<number>[]) => {
    const start = [0];
    const next: number[] = [];
    for (const list of lists) {
      next.push(...[...list].sort((x, y) => x - y));
      start.push(next.length);
    }
    return { start: Int32Array.from(start), items: Int32Array.from(next) };
  };
  const graph = csr(neighbours);
  const pointTris = csr(incident);
  return {
    mesh: 'msh_grid',
    positions: Float32Array.from(positions),
    tris: Uint32Array.from(tris),
    graph: { start: graph.start, next: graph.items },
    pointTris: { start: pointTris.start, tris: pointTris.items },
    placement: { t: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] },
  };
}

const front: CameraSnapshot = {
  projection: 'perspective',
  position: [0, 0, 2],
  quaternion: [0, 0, 0, 1],
  target: [0, 0, 0],
  fovY: Math.PI / 4,
  orthoHeight: 2,
};
const view = { camera: () => front, paneRect: () => ({ w: 400, h: 300 }) };

describe('pressure folds into the stamp strength (StrokeStamp.strength)', () => {
  const surface = grid();
  const ray = paneRay(view, 'p', 207, 146);
  if (ray === null) throw new Error('no ray');
  const hit = pickSurfaces([surface], ray);
  if (hit === null) throw new Error('no hit');
  const brush = { opacity: 0.8, falloff: 'smooth' as const, reach: 'surface' as const, frontOnly: true };

  it('the same points; every strength scaled by the pressure (bit-equal with a constant falloff)', () => {
    const pressure = 0.35;
    const flat = { ...brush, falloff: 'constant' as const };
    const plain = stampAt(hit, 0.25, flat, front);
    const pressed = stampAt(hit, 0.25, { ...flat, opacity: flat.opacity * pressureFactor(pressure) }, front);
    expect(Array.from(pressed.points)).toEqual(Array.from(plain.points));
    expect(plain.points.length).toBeGreaterThan(4);
    expect(Array.from(pressed.strength)).toEqual(Array.from(plain.points, () => Math.fround(0.8 * 0.35)));

    const smooth = stampAt(hit, 0.25, brush, front);
    const smoothPressed = stampAt(hit, 0.25, { ...brush, opacity: brush.opacity * pressure }, front);
    expect(Array.from(smoothPressed.points)).toEqual(Array.from(smooth.points));
    smooth.strength.forEach((s, i) => expect(smoothPressed.strength[i]).toBeCloseTo(s * pressure, 6));
  });

  it('full pressure is today’s stamp bit for bit; zero pressure stamps nothing', () => {
    const plain = stampAt(hit, 0.25, brush, front);
    const full = stampAt(hit, 0.25, { ...brush, opacity: brush.opacity * pressureFactor(1) }, front);
    expect(Array.from(full.points)).toEqual(Array.from(plain.points));
    expect(Array.from(full.strength)).toEqual(Array.from(plain.strength));
    const none = stampAt(hit, 0.25, { ...brush, opacity: brush.opacity * pressureFactor(0) }, front);
    expect(none.points.length).toBe(0);
  });
});
