// Animation layers in the edit kernel (ANIM-LAYERS-SPEC §1, §3; ADR 0026): the active layer (session, per clip), the
// layer keys go to, layer locks, and the keying solve — the value a key on the active layer needs so that the composite
// equals what the person posed (on an additive layer: the delta).
import {
  type Frame,
  LAYER_TRS_SLOTS,
  solveLayerScalar,
  solveLayerTrs,
  composeLayerScalar,
  composeLayerTrs,
} from '@ekza-studio/anim-core';
import type {
  ChannelId,
  ClipId,
  ControlRecord,
  CurveRecord,
  LayerId,
  LayerRecord,
  ReadView,
} from '@ekza-studio/doc';
import { attrStackAt, controlStackAt, playingLayers } from '@ekza-studio/rig';
import { internalsOf } from '../app/internals';
import type { EditorApp } from '../types';
import { animCurve } from './context';

const ROTATIONS: readonly ChannelId[] = ['rx', 'ry', 'rz'];
const TRS_SLOT: Readonly<Record<string, number>> = { tx: 0, ty: 1, tz: 2, rx: 3, ry: 4, rz: 5, sx: 6, sy: 7, sz: 8 };
const SLOT_CHANNEL: readonly ChannelId[] = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];

/** The clip's layers in stack order (base first; live records only). */
export function layersOf(view: ReadView, clip: ClipId): readonly LayerRecord[] {
  return view.query.layersOfClip(clip);
}

/** The id of the active layer the session names for `clip` (it may be stale; `editLayerOf` resolves it). */
export function activeLayerIdOf(app: EditorApp, clip: ClipId): LayerId | undefined {
  return app.session.getState().activeLayer?.[clip];
}

/** The layer keys go to in `clip`: the session's active layer when it is live, else the base (ANIM-LAYERS-SPEC §1). */
export function editLayerOf(app: EditorApp, view: ReadView, clip: ClipId): LayerRecord | undefined {
  const layers = view.query.layersOfClip(clip);
  const id = activeLayerIdOf(app, clip);
  return (id === undefined ? undefined : layers.find((layer) => layer.id === id)) ?? layers[0];
}

/** Whether `layer` is the base (lowest) layer of its clip. */
export function isBaseLayer(view: ReadView, layer: LayerRecord): boolean {
  return view.query.layersOfClip(layer.clip)[0]?.id === layer.id;
}

/** A curve edits nothing when the Graph Editor locked it or its layer is locked. */
export function isCurveLocked(view: ReadView, curve: CurveRecord): boolean {
  return curve.locked || view.get('layers', curve.layer)?.locked === true;
}

/** The display name of a layer for messages ("Fixes"). */
function named(layer: LayerRecord): string {
  return layer.name.length > 0 ? layer.name : 'This layer';
}

/**
 * Why keys cannot go to `layer`, or null: locked, muted, not playing (another layer is soloed, weight 0), masked away
 * from `control`. Plain words (ANIM-LAYERS-SPEC §3).
 */
export function layerKeyProblem(view: ReadView, layer: LayerRecord, control?: ControlRecord): string | null {
  if (layer.locked === true) return `${named(layer)} is locked — unlock it to key`;
  if (layer.mute) return `${named(layer)} is muted — unmute it to key`;
  const all = view.query.layersOfClip(layer.clip);
  if (!playingLayers(all).some((candidate) => candidate.id === layer.id)) {
    if (all.some((candidate) => candidate.solo) && !layer.solo) return `Another layer is soloed — ${named(layer)} is not playing`;
    return `${named(layer)} has weight 0 — raise it to key`;
  }
  const mask = layer.mask;
  if (control !== undefined && mask !== undefined && mask !== null && !isBaseLayer(view, layer) && !mask.includes(control.id)) {
    return `${named(layer)} does not affect ${control.name}`;
  }
  return null;
}

/** Whether the channel has keys on `layer` or on any playing layer below it (Auto Key's keyed rule, §3). */
export function channelKeyedAtOrBelow(
  view: ReadView,
  clip: ClipId,
  layer: LayerRecord,
  control: ControlRecord,
  channel: ChannelId,
): boolean {
  const all = view.query.layersOfClip(clip);
  const playing = new Set(playingLayers(all).map((candidate) => candidate.id));
  for (const candidate of all) {
    const own = candidate.id === layer.id;
    if (!own && !playing.has(candidate.id)) continue;
    const curve = view.query.curveFor(clip, candidate.id, control.id, channel);
    if (curve !== undefined && view.query.keysOfCurve(curve.id).length > 0) return true;
    if (own) return false;
  }
  return false;
}

/** The value of a curve at a clip frame as `view` sees it (compiled from the view's keys: in-transaction safe). */
function curveValueIn(app: EditorApp, view: ReadView, curve: CurveRecord, frame: Frame): number | null {
  const keys = view.query.keysOfCurve(curve.id);
  if (keys.length === 0) return null;
  const engine = internalsOf(app).deps.curves.engine;
  return engine.evaluate(engine.compile(animCurve(curve, keys)), frame);
}

export type LayerSolve =
  | { readonly ok: true; readonly values: ReadonlyMap<ChannelId, number> }
  | { readonly ok: false; readonly reason: string };

/**
 * The values to write on `layer` so that the composite of `control` at `frame` shows `targets` (channel → posed
 * composite value), every other layer unchanged (ANIM-LAYERS-SPEC §3). A clip with one layer, or a channel no other
 * playing layer touches, writes the posed values as they are (the M1 path). When a partial-weight override slerp
 * couples the rotation, the result also carries the rotation channels that were not edited.
 */
export function solveLayerValues(
  app: EditorApp,
  view: ReadView,
  clip: ClipId,
  layer: LayerRecord,
  control: ControlRecord,
  targets: ReadonlyMap<ChannelId, number>,
  frame: Frame,
): LayerSolve {
  const problem = layerKeyProblem(view, layer, control);
  if (problem !== null) return { ok: false, reason: problem };
  const all = view.query.layersOfClip(clip);
  if (all.length <= 1 && all[0]?.id === layer.id) return { ok: true, values: targets };
  const value = (curve: CurveRecord): number | null => curveValueIn(app, view, curve, frame);
  const values = new Map<ChannelId, number>();
  const trs = [...targets].filter(([channel]) => TRS_SLOT[channel] !== undefined);
  if (trs.length > 0) {
    const stack = controlStackAt(view, clip, control, value);
    const index = stack.layers.findIndex((candidate) => candidate.id === layer.id);
    if (index === -1) return { ok: false, reason: `${named(layer)} does not affect ${control.name}` };
    const target = composeLayerTrs(stack.input, stack.entries, control.rotateOrder, new Float64Array(LAYER_TRS_SLOTS));
    for (const [channel, v] of trs) target[TRS_SLOT[channel] as number] = v;
    const out = new Float64Array(LAYER_TRS_SLOTS);
    const coupled = solveLayerTrs(stack.input, stack.entries, index, target, control.rotateOrder, out);
    const written = new Set<ChannelId>(trs.map(([channel]) => channel));
    if (coupled && trs.some(([channel]) => ROTATIONS.includes(channel))) for (const r of ROTATIONS) written.add(r);
    for (const channel of written) {
      const x = out[TRS_SLOT[channel] as number] as number;
      if (Number.isNaN(x)) return { ok: false, reason: coverReason(stack.layers, index, channel, control) };
      values.set(channel, x);
    }
  }
  for (const [channel, v] of targets) {
    if (TRS_SLOT[channel] !== undefined) continue;
    const stack = attrStackAt(view, clip, control, channel, value);
    const index = stack.layers.findIndex((candidate) => candidate.id === layer.id);
    if (index === -1) return { ok: false, reason: `${named(layer)} does not affect ${control.name}` };
    const x = solveLayerScalar(stack.input, stack.entries, index, v);
    if (Number.isNaN(x)) return { ok: false, reason: coverReason(stack.layers, index, channel, control) };
    values.set(channel, x);
  }
  return { ok: true, values };
}

/** Why a solved channel is unreachable: the topmost full-weight override above with a curve on it, else the reach. */
function coverReason(layers: readonly LayerRecord[], index: number, channel: ChannelId, control: ControlRecord): string {
  for (let j = layers.length - 1; j > index; j--) {
    const above = layers[j] as LayerRecord;
    if (above.mode === 'override' && above.weight >= 1) return `Override layer ${named(above)} covers ${control.name} ${channel}`;
  }
  return `${named(layers[index] as LayerRecord)} cannot reach that pose on ${control.name} at its weight`;
}

/** The composite value of one channel of `control` in `clip` at `frame` as `view` sees it (no session overrides). */
export function compositeValueIn(
  app: EditorApp,
  view: ReadView,
  clip: ClipId,
  control: ControlRecord,
  channel: ChannelId,
  frame: Frame,
): number {
  const value = (curve: CurveRecord): number | null => curveValueIn(app, view, curve, frame);
  const slot = TRS_SLOT[channel];
  if (slot === undefined) {
    const stack = attrStackAt(view, clip, control, channel, value);
    return composeLayerScalar(stack.input, stack.entries);
  }
  const stack = controlStackAt(view, clip, control, value);
  return composeLayerTrs(stack.input, stack.entries, control.rotateOrder, new Float64Array(LAYER_TRS_SLOTS))[slot] as number;
}

export { SLOT_CHANNEL };
