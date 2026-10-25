// Animation layer blending (ANIM-LAYERS-SPEC §2–§3, ADR 0026): pure, allocation-free folds of one layer's channel
// values into a control's composite, and the inverse that keying and merging use.
//
// A control's TRS channels are 9 slots — tx ty tz rx ry rz sx sy sz — as in rig's ChannelBuffer. A layer's values use
// the same 9 slots with NaN where the layer has no curve for the channel (passthrough). Rotations are Euler angles in
// the control's DCC rotate order (ADR 0003).
//
// | mode     | translate, attributes | rotate                                                     | scale             |
// |----------|-----------------------|------------------------------------------------------------|-------------------|
// | additive | v + w·y               | per component e + w·y                                      | v · (1 + w·(y−1)) |
// | override | v + w·(y − v)         | w = 1: copy; else slerp(q(e), q(e'), w) → eulerNear(lerp)  | v + w·(y − v)     |
//
// `e'` is `e` with the layer's present rotation components. At weight 1 an override layer copies its values exactly,
// so a stack of one base layer reproduces the base's values bit for bit.
import { eulerNear, eulerToQuat, rotateOrderAxes } from '../math/euler';
import { quatInvert, quatMultiply, quatNormalize, quatSlerp } from '../math/quat';
import type { Quat, RotateOrder, Vec3 } from '../types';

export type LayerBlendMode = 'override' | 'additive';

/** TRS slots per control (tx ty tz rx ry rz sx sy sz). */
export const LAYER_TRS_SLOTS = 9;

/** One layer of a control's stack: its mode, weight (clamped to 0…1) and 9 values (NaN = no curve). */
export interface LayerStackEntry {
  readonly mode: LayerBlendMode;
  readonly weight: number;
  readonly values: ArrayLike<number>;
}

/** One layer of a scalar channel's stack (custom attributes): NaN = no curve. */
export interface ScalarLayerEntry {
  readonly mode: LayerBlendMode;
  readonly weight: number;
  readonly value: number;
}

/** The identity value of an additive layer in a TRS slot: 1 for scale, 0 otherwise. */
export function additiveIdentity(slot: number): number {
  return slot >= 6 ? 1 : 0;
}

/** A weight clamped to [0, 1] (NaN → 0). */
export function clampWeight(weight: number): number {
  return weight > 0 ? (weight < 1 ? weight : 1) : 0;
}

const qa: Quat = [0, 0, 0, 1];
const qb: Quat = [0, 0, 0, 1];
const qc: Quat = [0, 0, 0, 1];
const ea: Vec3 = [0, 0, 0];
const eb: Vec3 = [0, 0, 0];
const er: Vec3 = [0, 0, 0];
const eo: Vec3 = [0, 0, 0];

/** One scalar fold (attributes): additive `v + w·y`, override `v + w·(y − v)` (w = 1 copies); NaN `y` passes. */
export function blendLayerScalar(v: number, y: number, mode: LayerBlendMode, weight: number): number {
  if (Number.isNaN(y)) return v;
  const w = clampWeight(weight);
  if (mode === 'additive') return v + w * y;
  return w >= 1 ? y : v + w * (y - v);
}

/**
 * One slot's fold when it does not couple with others: every slot of an additive layer or of a full-weight override,
 * and the translate and scale slots of a partial override (its rotation goes through `blendOverrideRotation`).
 * `weight` must already be clamped to (0, 1].
 */
export function blendLayerSlot(v: number, y: number, slot: number, mode: LayerBlendMode, weight: number): number {
  if (mode === 'additive') return slot >= 6 ? v * (1 + weight * (y - 1)) : v + weight * y;
  return weight >= 1 ? y : v + weight * (y - v);
}

/**
 * A partial-weight override's rotation (0 < weight < 1): slerp from `acc`'s triple (slots 3–5 from `at`) toward the
 * triple with the layer's present components (NaN = absent), back to Euler near the component lerp.
 */
export function blendOverrideRotation(
  acc: Float64Array,
  at: number,
  rx: number,
  ry: number,
  rz: number,
  weight: number,
  order: RotateOrder,
): void {
  if (Number.isNaN(rx) && Number.isNaN(ry) && Number.isNaN(rz)) return;
  overrideRotation(acc, at, rx, ry, rz, weight, order);
}

/**
 * Folds one layer's values of one control into `acc` (9 slots from `at`); `layer` holds the layer's 9 values from
 * `lat`, NaN where it has no curve. No allocation.
 */
export function blendLayerTrs(
  acc: Float64Array,
  at: number,
  layer: ArrayLike<number>,
  lat: number,
  mode: LayerBlendMode,
  weight: number,
  order: RotateOrder,
): void {
  const w = clampWeight(weight);
  if (w <= 0) return;
  if (mode === 'additive') {
    for (let c = 0; c < 6; c++) {
      const y = layer[lat + c] as number;
      if (!Number.isNaN(y)) acc[at + c] = (acc[at + c] as number) + w * y;
    }
    for (let c = 6; c < 9; c++) {
      const y = layer[lat + c] as number;
      if (!Number.isNaN(y)) acc[at + c] = (acc[at + c] as number) * (1 + w * (y - 1));
    }
    return;
  }
  if (w >= 1) {
    for (let c = 0; c < 9; c++) {
      const y = layer[lat + c] as number;
      if (!Number.isNaN(y)) acc[at + c] = y;
    }
    return;
  }
  for (let c = 0; c < 9; c++) {
    if (c === 3) c = 6;
    const y = layer[lat + c] as number;
    if (!Number.isNaN(y)) acc[at + c] = (acc[at + c] as number) + w * (y - (acc[at + c] as number));
  }
  const rx = layer[lat + 3] as number;
  const ry = layer[lat + 4] as number;
  const rz = layer[lat + 5] as number;
  if (Number.isNaN(rx) && Number.isNaN(ry) && Number.isNaN(rz)) return;
  overrideRotation(acc, at, rx, ry, rz, w, order);
}

/** Override rotation at 0 < w < 1: slerp toward the triple with the layer's present components (NaN = absent). */
function overrideRotation(
  acc: Float64Array,
  at: number,
  rx: number,
  ry: number,
  rz: number,
  w: number,
  order: RotateOrder,
): void {
  ea[0] = acc[at + 3] as number;
  ea[1] = acc[at + 4] as number;
  ea[2] = acc[at + 5] as number;
  eb[0] = Number.isNaN(rx) ? ea[0] : rx;
  eb[1] = Number.isNaN(ry) ? ea[1] : ry;
  eb[2] = Number.isNaN(rz) ? ea[2] : rz;
  if (eb[0] === ea[0] && eb[1] === ea[1] && eb[2] === ea[2]) return;
  const axes = rotateOrderAxes(order);
  eulerToQuat(ea, order, qa);
  eulerToQuat(eb, order, qb);
  quatSlerp(qa, qb, w, qc);
  er[0] = ea[0] + w * (eb[0] - ea[0]);
  er[1] = ea[1] + w * (eb[1] - ea[1]);
  er[2] = ea[2] + w * (eb[2] - ea[2]);
  if (!fastEulerNear(qc, axes[0], axes[1], axes[2], er, eo)) eulerNear(qc, order, er, eo);
  acc[at + 3] = eo[0];
  acc[at + 4] = eo[1];
  acc[at + 5] = eo[2];
}

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
/** Below this |cos(middle)| `fastEulerNear` hands over to anim-core's `eulerNear` (its gimbal-lock branch). */
const NEAR_GIMBAL = 1e-6;

/**
 * The hot-path twin of `eulerNear` for unit quaternions away from gimbal lock: the same direct quaternion method
 * (Bernardes & Viollet) with `sqrt` in place of `hypot` (unit input cannot overflow), then the nearer of the two
 * equivalent triples unwrapped toward `ref`. False (nothing written) near gimbal lock.
 */
function fastEulerNear(q: Quat, i: 0 | 1 | 2, j: 0 | 1 | 2, k: 0 | 1 | 2, ref: Vec3, out: Vec3): boolean {
  const sign = ((i - j) * (j - k) * (k - i)) / 2;
  const w = q[3];
  const qi = q[i];
  const qj = q[j];
  const qk = q[k] * sign;
  const a = w - qj;
  const b = qi + qk;
  const c = qj + w;
  const d = qk - qi;
  const theta = 2 * Math.atan2(Math.sqrt(c * c + d * d), Math.sqrt(a * a + b * b));
  const middle = theta - HALF_PI;
  if (Math.abs(Math.cos(middle)) < NEAR_GIMBAL) return false;
  const halfSum = Math.atan2(b, a);
  const halfDiff = Math.atan2(d, c);
  const ei = halfSum - halfDiff;
  const ek = (halfSum + halfDiff) * sign;
  const ai = ei + TAU * Math.round((ref[i] - ei) / TAU);
  const aj = middle + TAU * Math.round((ref[j] - middle) / TAU);
  const ak = ek + TAU * Math.round((ref[k] - ek) / TAU);
  const bi0 = ei + Math.PI;
  const bj0 = Math.PI - middle;
  const bk0 = ek + Math.PI;
  const bi = bi0 + TAU * Math.round((ref[i] - bi0) / TAU);
  const bj = bj0 + TAU * Math.round((ref[j] - bj0) / TAU);
  const bk = bk0 + TAU * Math.round((ref[k] - bk0) / TAU);
  const distA = Math.abs(ai - ref[i]) + Math.abs(aj - ref[j]) + Math.abs(ak - ref[k]);
  const distB = Math.abs(bi - ref[i]) + Math.abs(bj - ref[j]) + Math.abs(bk - ref[k]);
  if (distA <= distB) {
    out[i] = ai;
    out[j] = aj;
    out[k] = ak;
  } else {
    out[i] = bi;
    out[j] = bj;
    out[k] = bk;
  }
  return true;
}

/** Composes `input` (9 values) through `layers` in order into `out` (9 slots; may alias nothing in `layers`). */
export function composeLayerTrs(
  input: ArrayLike<number>,
  layers: readonly LayerStackEntry[],
  order: RotateOrder,
  out: Float64Array,
): Float64Array {
  for (let c = 0; c < 9; c++) out[c] = input[c] as number;
  for (const layer of layers) blendLayerTrs(out, 0, layer.values, 0, layer.mode, layer.weight, order);
  return out;
}

/** Composes a scalar channel (attributes) through `layers`. */
export function composeLayerScalar(input: number, layers: readonly ScalarLayerEntry[]): number {
  let v = input;
  for (const layer of layers) v = blendLayerScalar(v, layer.value, layer.mode, layer.weight);
  return v;
}

// ---------- the inverse (keying, merging) ----------

/** |Δ| below which the rotation Newton solve stops (radians). */
const SOLVE_EPS = 1e-12;
const SOLVE_ITERATIONS = 30;
const JACOBIAN_STEP = 1e-6;
/** A scale factor closer to 0 than this cannot be divided out. */
const ZERO_FACTOR = 1e-12;

/**
 * The value layer `index` needs in a scalar stack so that it composes to `target`, every other layer unchanged; NaN
 * when the layer cannot reach it (weight 0, or an override layer above at full weight with a curve).
 */
export function solveLayerScalar(
  input: number,
  layers: readonly ScalarLayerEntry[],
  index: number,
  target: number,
): number {
  let t = target;
  for (let j = layers.length - 1; j > index; j--) {
    const layer = layers[j] as ScalarLayerEntry;
    const w = clampWeight(layer.weight);
    const y = layer.value;
    if (w <= 0 || Number.isNaN(y)) continue;
    if (layer.mode === 'additive') t -= w * y;
    else if (w >= 1) return Number.NaN;
    else t = (t - w * y) / (1 - w);
  }
  const own = layers[index];
  if (own === undefined) return Number.NaN;
  const w = clampWeight(own.weight);
  if (w <= 0) return Number.NaN;
  const below = composeLayerScalar(input, layers.slice(0, index));
  if (own.mode === 'additive') return (t - below) / w;
  return w >= 1 ? t : below + (t - below) / w;
}

/**
 * The 9 values layer `index` needs so that composing `input` through `layers` gives `target`, every other layer
 * unchanged (ANIM-LAYERS-SPEC §3), into `out`. Slots the layer cannot reach — its weight is 0, an override layer
 * above at full weight has a curve there, an additive scale factor above is 0 — are NaN. Translate and scale are
 * closed-form; rotation is closed-form unless a partial-weight override slerp lies between the layer and the top.
 *
 * Returns true when the rotation triple is coupled (a slerp is involved): the caller writes all three rotation
 * channels, else the composite drifts on the ones it leaves out.
 */
export function solveLayerTrs(
  input: ArrayLike<number>,
  layers: readonly LayerStackEntry[],
  index: number,
  target: ArrayLike<number>,
  order: RotateOrder,
  out: Float64Array,
): boolean {
  const n = layers.length;
  // Stage s[j] is the input of layer j (s[0] = input); one allocation per solve (keying and merging, not playback).
  const stages: Float64Array[] = [Float64Array.from({ length: 9 }, (_, c) => input[c] as number)];
  for (let j = 0; j < n; j++) {
    const next = Float64Array.from(stages[j] as Float64Array);
    const layer = layers[j] as LayerStackEntry;
    blendLayerTrs(next, 0, layer.values, 0, layer.mode, layer.weight, order);
    stages.push(next);
  }
  const t = Float64Array.from({ length: 9 }, (_, c) => target[c] as number);
  const reach = [true, true, true, true, true, true, true, true, true];
  let coupled = false;
  for (let j = n - 1; j > index; j--) {
    if (invertLayer(t, reach, layers[j] as LayerStackEntry, stages[j] as Float64Array, order)) coupled = true;
  }
  const own = layers[index];
  const w = own === undefined ? 0 : clampWeight(own.weight);
  if (own === undefined || w <= 0) {
    out.fill(Number.NaN, 0, 9);
    return false;
  }
  const below = stages[index] as Float64Array;
  const additive = own.mode === 'additive';
  for (let c = 0; c < 9; c++) {
    if (c === 3) c = 6;
    const tc = t[c] as number;
    const bc = below[c] as number;
    if (additive && c >= 6) out[c] = bc === 0 ? Number.NaN : 1 + (tc / bc - 1) / w;
    else if (additive) out[c] = (tc - bc) / w;
    else out[c] = w >= 1 ? tc : bc + (tc - bc) / w;
  }
  if (additive || w >= 1) {
    for (let c = 3; c < 6; c++) out[c] = additive ? ((t[c] as number) - (below[c] as number)) / w : (t[c] as number);
  } else {
    // Override at 0 < w < 1: slerp(q(b), q(x), w) = q(t)  ⇔  q(x) = q(b)·(q(b)⁻¹·q(t))^(1/w), all three written.
    ea[0] = below[3] as number;
    ea[1] = below[4] as number;
    ea[2] = below[5] as number;
    eb[0] = t[3] as number;
    eb[1] = t[4] as number;
    eb[2] = t[5] as number;
    eulerToQuat(ea, order, qa);
    eulerToQuat(eb, order, qb);
    quatInvert(qa, qc);
    quatMultiply(qc, qb, qc);
    quatPow(qc, 1 / w, qc);
    quatMultiply(qa, qc, qc);
    er[0] = ea[0] + (eb[0] - ea[0]) / w;
    er[1] = ea[1] + (eb[1] - ea[1]) / w;
    er[2] = ea[2] + (eb[2] - ea[2]) / w;
    eulerNear(qc, order, er, eo);
    out[3] = eo[0];
    out[4] = eo[1];
    out[5] = eo[2];
    coupled = true;
  }
  for (let c = 0; c < 9; c++) if (!reach[c]) out[c] = Number.NaN;
  if (coupled && !Number.isNaN(out[3])) verifyRotation(input, layers, index, target, order, out);
  return coupled;
}

/** Rotation residual (quaternion components) above which a coupled solve counts as unreachable. */
const ROTATION_RESIDUAL = 1e-9;

/**
 * A slerp solve can ask for more than a shortest-path slerp can give (an override at a low weight asked to turn far,
 * or a target opposite the layer): the forward composite of the solved triple is checked, and an unreached rotation
 * is NaN.
 */
function verifyRotation(
  input: ArrayLike<number>,
  layers: readonly LayerStackEntry[],
  index: number,
  target: ArrayLike<number>,
  order: RotateOrder,
  out: Float64Array,
): void {
  const own = layers[index] as LayerStackEntry;
  const values = Float64Array.from({ length: 9 }, (_, c) =>
    c >= 3 && c < 6 ? (out[c] as number) : (own.values[c] as number),
  );
  const solved = layers.map((layer, i) => (i === index ? { mode: layer.mode, weight: layer.weight, values } : layer));
  const result = composeLayerTrs(input, solved, order, new Float64Array(9));
  const q1 = eulerToQuat([result[3] as number, result[4] as number, result[5] as number], order, [0, 0, 0, 1]);
  const q2 = eulerToQuat([target[3] as number, target[4] as number, target[5] as number], order, [0, 0, 0, 1]);
  const sign = q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3] < 0 ? -1 : 1;
  let worst = 0;
  for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs((q1[c] as number) - sign * (q2[c] as number)));
  if (!(worst <= ROTATION_RESIDUAL)) out.fill(Number.NaN, 3, 6);
}

/**
 * Turns `t` (the wanted output of `layer`) into the wanted input of it, `stage` being its current input; marks the
 * slots no input can reach. Returns true when the rotation inverse went through a slerp.
 */
function invertLayer(
  t: Float64Array,
  reach: boolean[],
  layer: LayerStackEntry,
  stage: Float64Array,
  order: RotateOrder,
): boolean {
  const w = clampWeight(layer.weight);
  if (w <= 0) return false;
  const y = layer.values;
  const additive = layer.mode === 'additive';
  for (let c = 0; c < 9; c++) {
    if (c === 3) c = 6;
    const yc = y[c] as number;
    if (Number.isNaN(yc)) continue;
    if (additive && c >= 6) {
      const factor = 1 + w * (yc - 1);
      if (Math.abs(factor) < ZERO_FACTOR) reach[c] = false;
      else t[c] = (t[c] as number) / factor;
    } else if (additive) t[c] = (t[c] as number) - w * yc;
    else if (w >= 1) reach[c] = false;
    else t[c] = ((t[c] as number) - w * yc) / (1 - w);
  }
  const rx = y[3] as number;
  const ry = y[4] as number;
  const rz = y[5] as number;
  const present = [!Number.isNaN(rx), !Number.isNaN(ry), !Number.isNaN(rz)];
  if (!present[0] && !present[1] && !present[2]) return false;
  if (additive) {
    for (let c = 0; c < 3; c++) if (present[c]) t[3 + c] = (t[3 + c] as number) - w * (y[3 + c] as number);
    return false;
  }
  if (w >= 1) {
    for (let c = 0; c < 3; c++) if (present[c]) reach[3 + c] = false;
    return false;
  }
  // A partial-weight override: solve q(blend(b, y)) = q(t) for b, starting at the current input (Newton on the
  // triple; closed-form when the layer has all three rotation channels).
  const goal: Vec3 = [t[3] as number, t[4] as number, t[5] as number];
  const start: Vec3 = [stage[3] as number, stage[4] as number, stage[5] as number];
  const solved: Vec3 = [0, 0, 0];
  if (present[0] && present[1] && present[2]) {
    // slerp(a, b, w) = slerp(b, a, 1 − w)  ⇒  a = b·(b⁻¹·t)^(1/(1−w)).
    const qy: Quat = eulerToQuat([rx, ry, rz], order, [0, 0, 0, 1]);
    const qt: Quat = eulerToQuat(goal, order, [0, 0, 0, 1]);
    const d = quatMultiply(quatInvert(qy, [0, 0, 0, 1]), qt, [0, 0, 0, 1]);
    quatPow(d, 1 / (1 - w), d);
    const qbelow = quatMultiply(qy, d, [0, 0, 0, 1]);
    eulerNear(qbelow, order, start, solved);
  } else {
    const probe = new Float64Array(9);
    const forward = (b: Vec3, outRot: Vec3): void => {
      probe[3] = b[0];
      probe[4] = b[1];
      probe[5] = b[2];
      overrideRotation(probe, 0, rx, ry, rz, w, order);
      outRot[0] = probe[3];
      outRot[1] = probe[4];
      outRot[2] = probe[5];
    };
    newton3(forward, goal, start, solved);
  }
  t[3] = solved[0];
  t[4] = solved[1];
  t[5] = solved[2];
  return true;
}

/** `q^p` for a unit quaternion along its shortest arc (angle ≤ π), into `out`. */
function quatPow(q: Quat, p: number, out: Quat): Quat {
  let x = q[0];
  let y = q[1];
  let z = q[2];
  let w = q[3];
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  const s = Math.hypot(x, y, z);
  if (s < 1e-300) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  }
  const half = Math.atan2(s, w) * p;
  const k = Math.sin(half) / s;
  out[0] = x * k;
  out[1] = y * k;
  out[2] = z * k;
  out[3] = Math.cos(half);
  return quatNormalize(out, out);
}

/** Newton's method on a 3-vector function with a central-difference Jacobian; `out` is the best point found. */
function newton3(f: (x: Vec3, out: Vec3) => void, goal: Vec3, start: Vec3, out: Vec3): void {
  const x: Vec3 = [start[0], start[1], start[2]];
  const fx: Vec3 = [0, 0, 0];
  const fp: Vec3 = [0, 0, 0];
  const fm: Vec3 = [0, 0, 0];
  const jac = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let it = 0; it < SOLVE_ITERATIONS; it++) {
    f(x, fx);
    const r0 = goal[0] - fx[0];
    const r1 = goal[1] - fx[1];
    const r2 = goal[2] - fx[2];
    if (Math.max(Math.abs(r0), Math.abs(r1), Math.abs(r2)) < SOLVE_EPS) break;
    for (let k = 0; k < 3; k++) {
      const keep = x[k] as number;
      x[k] = keep + JACOBIAN_STEP;
      f(x, fp);
      x[k] = keep - JACOBIAN_STEP;
      f(x, fm);
      x[k] = keep;
      for (let r = 0; r < 3; r++) jac[r * 3 + k] = ((fp[r] as number) - (fm[r] as number)) / (2 * JACOBIAN_STEP);
    }
    const dx = solve3(jac, r0, r1, r2);
    if (dx === null) break;
    x[0] += dx[0];
    x[1] += dx[1];
    x[2] += dx[2];
  }
  out[0] = x[0];
  out[1] = x[1];
  out[2] = x[2];
}

/** Cramer's rule for a 3×3 row-major system; null when singular. */
function solve3(m: readonly number[], b0: number, b1: number, b2: number): Vec3 | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-18) return null;
  return [
    (b0 * (e * i - f * h) - b * (b1 * i - f * b2) + c * (b1 * h - e * b2)) / det,
    (a * (b1 * i - f * b2) - b0 * (d * i - f * g) + c * (d * b2 - b1 * g)) / det,
    (a * (e * b2 - b1 * h) - b * (d * b2 - b1 * g) + b0 * (d * h - e * g)) / det,
  ];
}
