import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  blendLayerScalar,
  blendLayerTrs,
  composeLayerScalar,
  composeLayerTrs,
  eulerToQuat,
  type LayerBlendMode,
  type LayerStackEntry,
  quatSlerp,
  type RotateOrder,
  type ScalarLayerEntry,
  solveLayerScalar,
  solveLayerTrs,
} from '../../src';
import { quatDistance, ROTATE_ORDERS } from '../math/helpers';

// ANIM-LAYERS-SPEC §2–§3: the blend table, passthrough, weights, rotate orders and solve ∘ compose = identity.

const NaN9 = (): Float64Array => new Float64Array(9).fill(Number.NaN);
const REST = [0, 0, 0, 0, 0, 0, 1, 1, 1];

function rot(values: ArrayLike<number>): [number, number, number] {
  return [values[3] as number, values[4] as number, values[5] as number];
}

function sameRotation(a: ArrayLike<number>, b: ArrayLike<number>, order: RotateOrder): number {
  return quatDistance(eulerToQuat(rot(a), order), eulerToQuat(rot(b), order));
}

describe('blendLayerTrs', () => {
  it('a full-weight override copies its present values bit for bit and passes the others through', () => {
    const acc = Float64Array.from([1, 2, 3, 0.1, 0.2, 0.3, 1, 1, 1]);
    const layer = NaN9();
    layer[0] = 0.123456789;
    layer[4] = -1.5;
    layer[8] = 2.5;
    blendLayerTrs(acc, 0, layer, 0, 'override', 1, 'xyz');
    expect([...acc]).toEqual([0.123456789, 2, 3, 0.1, -1.5, 0.3, 1, 1, 2.5]);
  });

  it('additive adds translate and Euler rotation per component and multiplies scale, by weight', () => {
    const acc = Float64Array.from([1, 2, 3, 0.1, 0.2, 0.3, 2, 1, 1]);
    const layer = Float64Array.from([0.5, Number.NaN, -1, 0.2, Number.NaN, -0.1, 1.5, Number.NaN, 1]);
    blendLayerTrs(acc, 0, layer, 0, 'additive', 0.5, 'zxy');
    expect(acc[0]).toBeCloseTo(1.25, 15);
    expect(acc[1]).toBe(2);
    expect(acc[2]).toBeCloseTo(2.5, 15);
    expect(acc[3]).toBeCloseTo(0.2, 15);
    expect(acc[4]).toBe(0.2);
    expect(acc[5]).toBeCloseTo(0.25, 15);
    expect(acc[6]).toBeCloseTo(2 * 1.25, 15);
    expect(acc[7]).toBe(1);
    expect(acc[8]).toBe(1);
  });

  it('weight 0 (and below) changes nothing; weights above 1 clamp to 1', () => {
    const start = [1, 2, 3, 0.1, 0.2, 0.3, 1, 2, 3];
    const layer = Float64Array.from([5, 5, 5, 1, 1, 1, 2, 2, 2]);
    for (const mode of ['additive', 'override'] as const) {
      for (const weight of [0, -1]) {
        const acc = Float64Array.from(start);
        blendLayerTrs(acc, 0, layer, 0, mode, weight, 'xyz');
        expect([...acc]).toEqual(start);
      }
      const clamped = Float64Array.from(start);
      const one = Float64Array.from(start);
      blendLayerTrs(clamped, 0, layer, 0, mode, 7, 'xyz');
      blendLayerTrs(one, 0, layer, 0, mode, 1, 'xyz');
      expect([...clamped]).toEqual([...one]);
    }
  });

  it('a partial override slerps rotation between the input and the layer triple (every rotate order)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROTATE_ORDERS),
        fc.tuple(fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -1.2, max: 1.2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true })),
        fc.tuple(fc.double({ min: -2, max: 2, noNaN: true }), fc.double({ min: -1.2, max: 1.2, noNaN: true }), fc.double({ min: -2, max: 2, noNaN: true })),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (order, a, b, w) => {
          const acc = Float64Array.from([0, 0, 0, ...a, 1, 1, 1]);
          const layer = Float64Array.from([Number.NaN, Number.NaN, Number.NaN, ...b, Number.NaN, Number.NaN, Number.NaN]);
          blendLayerTrs(acc, 0, layer, 0, 'override', w, order);
          const expected = quatSlerp(eulerToQuat(a, order), eulerToQuat(b, order), w);
          expect(quatDistance(eulerToQuat(rot(acc), order), expected)).toBeLessThan(1e-12);
        },
      ),
    );
  });

  it('a partial override with one rotation channel keeps the others as the input (passthrough triple)', () => {
    const acc = Float64Array.from([0, 0, 0, 0.3, 0.2, 0.1, 1, 1, 1]);
    const layer = NaN9();
    layer[5] = 0.9;
    blendLayerTrs(acc, 0, layer, 0, 'override', 0.5, 'xyz');
    // 'xyz': z is the outer axis, so the layer triple differs from the input by a rotation about z: a plain lerp.
    expect(acc[3]).toBeCloseTo(0.3, 12);
    expect(acc[4]).toBeCloseTo(0.2, 12);
    expect(acc[5]).toBeCloseTo(0.5, 12);
  });

  it('a stack of one base layer (override, weight 1) reproduces the base values exactly', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -50, max: 50, noNaN: true }), { minLength: 9, maxLength: 9 }), (base) => {
        const out = new Float64Array(9);
        composeLayerTrs(REST, [{ mode: 'override', weight: 1, values: base }], 'yxz', out);
        expect([...out]).toEqual(base);
      }),
    );
  });
});

describe('scalar layers (attributes)', () => {
  it('fold and solve', () => {
    expect(blendLayerScalar(1, Number.NaN, 'additive', 1)).toBe(1);
    expect(blendLayerScalar(1, 0.5, 'additive', 0.5)).toBe(1.25);
    expect(blendLayerScalar(1, 0, 'override', 0.25)).toBe(0.75);
    const layers: ScalarLayerEntry[] = [
      { mode: 'override', weight: 1, value: 0.2 },
      { mode: 'additive', weight: 0.5, value: 0.4 },
      { mode: 'override', weight: 0.3, value: 0.9 },
    ];
    const x = solveLayerScalar(0, layers, 1, 0.75);
    const solved = layers.map((layer, i) => (i === 1 ? { ...layer, value: x } : layer));
    expect(composeLayerScalar(0, solved)).toBeCloseTo(0.75, 12);
    expect(solveLayerScalar(0, [...layers, { mode: 'override', weight: 1, value: 1 }], 1, 0.5)).toBeNaN();
    expect(solveLayerScalar(0, [{ mode: 'additive', weight: 0, value: 1 }], 0, 0.5)).toBeNaN();
  });
});

// ---------- solve ∘ compose ----------

type Present = readonly boolean[];
const layerArb = fc.record({
  mode: fc.constantFrom<LayerBlendMode>('additive', 'override'),
  weight: fc.oneof(fc.constant(1), fc.double({ min: 0.15, max: 0.95, noNaN: true })),
  present: fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
  values: fc.tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -0.6, max: 0.6, noNaN: true }),
    fc.double({ min: -0.6, max: 0.6, noNaN: true }),
    fc.double({ min: -0.6, max: 0.6, noNaN: true }),
    fc.double({ min: 0.6, max: 1.5, noNaN: true }),
    fc.double({ min: 0.6, max: 1.5, noNaN: true }),
    fc.double({ min: 0.6, max: 1.5, noNaN: true }),
  ),
});

function entry(layer: { mode: LayerBlendMode; weight: number; present: Present; values: readonly number[] }) {
  return {
    mode: layer.mode,
    weight: layer.weight,
    values: Float64Array.from(layer.values, (v, c) => (layer.present[c] ? v : Number.NaN)),
  } satisfies LayerStackEntry;
}

describe('solveLayerTrs', () => {
  it('solve ∘ compose = identity on every reachable channel (random stacks, every rotate order)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROTATE_ORDERS),
        fc.array(layerArb, { minLength: 1, maxLength: 4 }),
        fc.nat(),
        fc.tuple(
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.double({ min: -1, max: 1, noNaN: true }),
          fc.double({ min: -0.25, max: 0.25, noNaN: true }),
          fc.double({ min: -0.25, max: 0.25, noNaN: true }),
          fc.double({ min: -0.25, max: 0.25, noNaN: true }),
          fc.double({ min: 0.8, max: 1.2, noNaN: true }),
          fc.double({ min: 0.8, max: 1.2, noNaN: true }),
          fc.double({ min: 0.8, max: 1.2, noNaN: true }),
        ),
        (order, raw, pick, delta) => {
          const layers = raw.map(entry);
          const index = pick % layers.length;
          const current = composeLayerTrs(REST, layers, order, new Float64Array(9));
          // A reachable target near the current pose (a person's drag), as the manipulators produce.
          const target = Float64Array.from(current, (v, c) => (c >= 6 ? v * (delta[c] as number) : v + (delta[c] as number)));
          const x = new Float64Array(9);
          solveLayerTrs(REST, layers, index, target, order, x);
          const own = layers[index] as LayerStackEntry;
          const values = Float64Array.from(own.values);
          for (let c = 0; c < 9; c++) {
            if (!Number.isNaN(x[c] as number)) values[c] = x[c] as number;
          }
          const solved = layers.map((layer, i) => (i === index ? { ...layer, values } : layer));
          const result = composeLayerTrs(REST, solved, order, new Float64Array(9));
          for (const c of [0, 1, 2, 6, 7, 8]) {
            if (Number.isNaN(x[c] as number)) continue;
            expect(Math.abs((result[c] as number) - (target[c] as number))).toBeLessThan(1e-9);
          }
          if (!Number.isNaN(x[3] as number) && !Number.isNaN(x[4] as number) && !Number.isNaN(x[5] as number)) {
            expect(sameRotation(result, target, order)).toBeLessThan(1e-8);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('an additive layer keys the delta: 0 for an unchanged pose, the offset for a posed one', () => {
    const base = Float64Array.from([0.1, 0.9, 0, 0.4, -0.2, 0.3, 1, 1, 1]);
    const fixes = NaN9();
    const layers: LayerStackEntry[] = [
      { mode: 'override', weight: 1, values: base },
      { mode: 'additive', weight: 1, values: fixes },
    ];
    const x = new Float64Array(9);
    expect(solveLayerTrs(REST, layers, 1, base, 'zxy', x)).toBe(false);
    expect([...x]).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1]);
    const posed = Float64Array.from(base);
    posed[3] = 0.4 + 0.25;
    solveLayerTrs(REST, layers, 1, posed, 'zxy', x);
    expect(x[3]).toBeCloseTo(0.25, 15);
    // At weight 0.5 the delta doubles so that the composite still matches.
    solveLayerTrs(REST, [layers[0] as LayerStackEntry, { ...layers[1], weight: 0.5 } as LayerStackEntry], 1, posed, 'zxy', x);
    expect(x[3]).toBeCloseTo(0.5, 15);
  });

  it('marks unreachable channels: weight 0, an override above at full weight', () => {
    const base = Float64Array.from([0, 0, 0, 0, 0, 0, 1, 1, 1]);
    const cover = NaN9();
    cover[0] = 1;
    cover[4] = 0.5;
    const x = new Float64Array(9);
    solveLayerTrs(
      REST,
      [
        { mode: 'override', weight: 1, values: base },
        { mode: 'additive', weight: 1, values: NaN9() },
        { mode: 'override', weight: 1, values: cover },
      ],
      1,
      base,
      'xyz',
      x,
    );
    expect(x[0]).toBeNaN();
    expect(x[4]).toBeNaN();
    expect(x[1]).toBe(0);
    solveLayerTrs(REST, [{ mode: 'additive', weight: 0, values: NaN9() }], 0, base, 'xyz', x);
    expect([...x].every(Number.isNaN)).toBe(true);
  });

  it('a partial-weight override layer is solved as a coupled triple', () => {
    const base = Float64Array.from([0, 0, 0, 0.5, 0.3, -0.4, 1, 1, 1]);
    const layers: LayerStackEntry[] = [
      { mode: 'override', weight: 1, values: base },
      { mode: 'override', weight: 0.4, values: NaN9() },
    ];
    const target = Float64Array.from(base);
    target[4] = 0.9;
    const x = new Float64Array(9);
    expect(solveLayerTrs(REST, layers, 1, target, 'yzx', x)).toBe(true);
    const result = composeLayerTrs(REST, [layers[0] as LayerStackEntry, { ...layers[1], values: x } as LayerStackEntry], 'yzx', new Float64Array(9));
    expect(sameRotation(result, target, 'yzx')).toBeLessThan(1e-12);
  });
});
