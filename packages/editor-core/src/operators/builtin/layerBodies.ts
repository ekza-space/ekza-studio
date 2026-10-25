// Apply bodies of the layer operators that walk curves (ANIM-LAYERS-SPEC §4): remove, duplicate and merge. A lazy
// chunk (`lazyBodies`), loaded by each operator's `prepare`.
import {
  type CompiledAnimCurve,
  composeLayerScalar,
  composeLayerTrs,
  EkzaError,
  type Frame,
  LAYER_TRS_SLOTS,
  solveLayerScalar,
  solveLayerTrs,
} from '@ekza-studio/anim-core';
import type {
  ChannelId,
  ClipRecord,
  ControlId,
  ControlRecord,
  CurveId,
  CurveRecord,
  LayerRecord,
  ReadView,
  Tx,
} from '@ekza-studio/doc';
import { attrStackAt, controlStackAt, layerAffects } from '@ekza-studio/rig';
import { internalsOf, newRecordId } from '../../app/internals';
import { newKeyTangents } from '../../edit/channelMeta';
import { animCurve } from '../../edit/context';
import { ensureCurve, writeKeyAt } from '../../edit/keys';
import { editLayerOf } from '../../edit/layers';
import type { ApplyContext, EditorApp, OperatorArgs } from '../../types';
import { uniqueLayerName } from '../../workflows/layerNames';
import { orderBetween } from '../../workflows/records';
import { activeClipRecord } from '../../workflows/targets';
import { setActiveLayer } from './layer';

const TRS_SLOT: Readonly<Record<string, number>> = { tx: 0, ty: 1, tz: 2, rx: 3, ry: 4, rz: 5, sx: 6, sy: 7, sz: 8 };
const ROTATIONS: readonly ChannelId[] = ['rx', 'ry', 'rz'];
/** Two times closer than this are one key time (frames). */
const SAME_TIME = 1e-6;

/** Removes a layer's keys, its curves and the layer itself (one transaction; undo restores them). */
function deleteLayer(tx: Tx, layer: LayerRecord): void {
  for (const curve of tx.query.curvesOfClip(layer.clip)) {
    if (curve.layer !== layer.id) continue;
    for (const key of tx.query.keysOfCurve(curve.id)) tx.remove('keys', key.id);
    tx.softDelete('curves', curve.id);
  }
  tx.softDelete('layers', layer.id);
}

export function layerRemove(ctx: ApplyContext, args: OperatorArgs<'layer.remove'>): void {
  const { app, tx } = ctx;
  if (tx === null) throw new EkzaError('internal', 'layer.remove runs in a transaction');
  const layer = tx.get('layers', args.layer);
  if (layer === undefined) throw new EkzaError('invalid-record', `Layer ${args.layer} does not exist`);
  const layers = tx.query.layersOfClip(layer.clip);
  const index = layers.findIndex((candidate) => candidate.id === layer.id);
  if (index <= 0) throw new EkzaError('unsupported', 'The base layer stays — delete the clip instead');
  const wasActive = editLayerOf(app, app.store, layer.clip)?.id === layer.id;
  deleteLayer(tx, layer);
  if (wasActive) setActiveLayer(ctx, layer.clip, (layers[index - 1] as LayerRecord).id);
}

export function layerDuplicate(ctx: ApplyContext, args: OperatorArgs<'layer.duplicate'>): { readonly layer: LayerRecord['id'] } {
  const { app, tx } = ctx;
  if (tx === null) throw new EkzaError('internal', 'layer.duplicate runs in a transaction');
  const source = tx.get('layers', args.layer);
  if (source === undefined) throw new EkzaError('invalid-record', `Layer ${args.layer} does not exist`);
  const layers = tx.query.layersOfClip(source.clip);
  const base = layers[0]?.id === source.id;
  const { locked: _locked, ...rest } = source;
  const copy: LayerRecord = {
    ...rest,
    id: newRecordId(app, 'layer'),
    name: uniqueLayerName(layers, `${source.name} copy`, true),
    // A copy of the base sits above it as a full override: what plays does not change.
    ...(base ? { mode: 'override' as const, weight: 1 } : {}),
    solo: false,
    order: orderBetween(source.order, layers.map((layer) => layer.order)),
  };
  tx.put('layers', copy);
  for (const curve of tx.query.curvesOfClip(source.clip)) {
    if (curve.layer !== source.id) continue;
    const id = newRecordId(app, 'curve');
    tx.put('curves', { ...curve, id, layer: copy.id });
    for (const key of tx.query.keysOfCurve(curve.id)) {
      tx.put('keys', { ...key, id: newRecordId(app, 'key'), curve: id });
    }
  }
  setActiveLayer(ctx, source.clip, copy.id);
  return { layer: copy.id };
}

// ---------- merge ----------

/** The layers a merge folds: every unmuted layer (non-base ones with weight > 0). Solo is a viewing aid. */
function mergeStack(layers: readonly LayerRecord[]): readonly LayerRecord[] {
  return layers.filter((layer, i) => !layer.mute && (i === 0 || layer.weight > 0));
}

interface ControlPlan {
  readonly control: ControlRecord;
  readonly channels: Set<ChannelId>;
}

/**
 * `layer.merge` (ANIM-LAYERS-SPEC §4): bakes `sources` into `target` so that the composite stays what it was — at
 * the union of the merged curves' key times (with the target's keys on those channels kept), or on every frame of
 * the clip range — then deletes the sources. Every value is computed from the state before the first write.
 */
export function layerMerge(
  ctx: ApplyContext,
  args: OperatorArgs<'layer.merge'>,
): { readonly layer: LayerRecord['id']; readonly keys: number } {
  const { app, tx } = ctx;
  if (tx === null) throw new EkzaError('internal', 'layer.merge runs in a transaction');
  const options = args ?? {};
  const scope = options.scope ?? 'down';
  const times = options.times ?? 'keys';
  const chosen =
    options.layer !== undefined
      ? tx.get('layers', options.layer)
      : (() => {
          const clip = activeClipRecord(app, tx);
          return clip === undefined ? undefined : editLayerOf(app, tx, clip.id);
        })();
  if (chosen === undefined) throw new EkzaError('invalid-record', 'The layer does not exist');
  const clip = tx.get('clips', chosen.clip);
  if (clip === undefined) throw new EkzaError('invalid-record', `Clip ${chosen.clip} does not exist`);
  const layers = tx.query.layersOfClip(clip.id);
  const stack = mergeStack(layers);
  let target: LayerRecord;
  let sources: LayerRecord[];
  if (scope === 'all') {
    target = layers[0] as LayerRecord;
    sources = stack.filter((layer) => layer.id !== target.id);
  } else {
    const index = layers.findIndex((layer) => layer.id === chosen.id);
    if (index <= 0) throw new EkzaError('unsupported', 'The base layer has nothing below it to merge into');
    target = layers[index - 1] as LayerRecord;
    sources = stack.some((layer) => layer.id === chosen.id) ? [chosen] : [];
  }
  const toDelete = scope === 'all' ? layers.slice(1).filter((layer) => sources.includes(layer)) : [chosen];
  const top = sources.at(-1);
  const topIndex = top === undefined ? -1 : stack.indexOf(top);
  const targetIndex = stack.indexOf(target);
  if (targetIndex === -1) throw new EkzaError('unsupported', `${target.name} is muted — unmute it to merge into it`);
  const upToTop = topIndex === -1 ? stack.slice(0, targetIndex + 1) : stack.slice(0, topIndex + 1);
  const upToTarget = stack.slice(0, targetIndex + 1);

  const plans = mergePlans(tx, clip, sources);
  const evaluate = curveEvaluator(app, tx);
  const prefs = app.prefs.getState();
  type Write = { readonly channel: ChannelId; readonly control: ControlRecord; readonly at: Frame | null; readonly value: number };
  const writes: Write[] = [];
  for (const plan of plans) {
    const at = planTimes(tx, clip, plan, sources, target, times);
    const trs = [...plan.channels].filter((channel) => TRS_SLOT[channel] !== undefined);
    const attrs = [...plan.channels].filter((channel) => TRS_SLOT[channel] === undefined);
    const frames: (Frame | null)[] = at.length === 0 ? [null] : at;
    for (const frame of frames) {
      const value = (curve: CurveRecord): number | null => evaluate(curve, frame ?? clip.range.start);
      if (trs.length > 0) {
        const full = controlStackAt(tx, clip.id, plan.control, value, { layers: upToTop });
        const goal = composeLayerTrs(full.input, full.entries, plan.control.rotateOrder, new Float64Array(LAYER_TRS_SLOTS));
        const below = controlStackAt(tx, clip.id, plan.control, value, { layers: upToTarget });
        const index = below.layers.findIndex((layer) => layer.id === target.id);
        if (index === -1) continue;
        const out = new Float64Array(LAYER_TRS_SLOTS);
        solveLayerTrs(below.input, below.entries, index, goal, plan.control.rotateOrder, out);
        for (const channel of trs) {
          const v = out[TRS_SLOT[channel] as number] as number;
          if (!Number.isNaN(v)) writes.push({ channel, control: plan.control, at: frame, value: v });
        }
      }
      for (const channel of attrs) {
        const full = attrStackAt(tx, clip.id, plan.control, channel, value, { layers: upToTop });
        const goal = composeLayerScalar(full.input, full.entries);
        const below = attrStackAt(tx, clip.id, plan.control, channel, value, { layers: upToTarget });
        const index = below.layers.findIndex((layer) => layer.id === target.id);
        if (index === -1) continue;
        const v = solveLayerScalar(below.input, below.entries, index, goal);
        if (!Number.isNaN(v)) writes.push({ channel, control: plan.control, at: frame, value: v });
      }
    }
  }
  let keys = 0;
  const curves = new Map<string, CurveId>();
  for (const write of writes) {
    const slot = `${write.control.id}\u0000${write.channel}`;
    let curve = curves.get(slot);
    if (curve === undefined) {
      curve = ensureCurve(app, tx, clip.id, write.control.id, write.channel, target.id);
      curves.set(slot, curve);
    }
    if (write.at === null) {
      if (tx.get('curves', curve)?.staticValue !== write.value) tx.patch('curves', curve, { staticValue: write.value });
      continue;
    }
    writeKeyAt(app, tx, curve, write.at, write.value, newKeyTangents(write.control, write.channel, prefs.defaultTangents));
    keys++;
  }
  for (const layer of toDelete) deleteLayer(tx, layer);
  setActiveLayer(ctx, clip.id, target.id);
  return { layer: target.id, keys };
}

/** Per control the source layers touch (masks honoured): the channels to bake (the rotation triple when coupled). */
function mergePlans(view: ReadView, clip: ClipRecord, sources: readonly LayerRecord[]): readonly ControlPlan[] {
  const ids = new Map(sources.map((layer) => [layer.id, layer]));
  const plans = new Map<ControlId, ControlPlan>();
  for (const curve of view.query.curvesOfClip(clip.id)) {
    const layer = ids.get(curve.layer);
    if (layer === undefined || !layerAffects(layer, curve.control)) continue;
    const control = view.get('controls', curve.control);
    if (control === undefined) continue;
    let plan = plans.get(control.id);
    if (plan === undefined) {
      plan = { control, channels: new Set() };
      plans.set(control.id, plan);
    }
    plan.channels.add(curve.channel);
    // A partial-weight override slerps the triple: all three rotation channels change.
    if (layer.mode === 'override' && layer.weight < 1 && ROTATIONS.includes(curve.channel)) {
      for (const rotation of ROTATIONS) plan.channels.add(rotation);
    }
  }
  return [...plans.values()].sort((a, b) => (a.control.id < b.control.id ? -1 : 1));
}

/**
 * The times a control bakes at: `'keys'` — every key time of the sources' curves on it and of the target's curves on
 * the baked channels; `'frames'` — every frame of the clip range plus those key times. Empty when nothing is keyed
 * (the merge then writes static values).
 */
function planTimes(
  view: ReadView,
  clip: ClipRecord,
  plan: ControlPlan,
  sources: readonly LayerRecord[],
  target: LayerRecord,
  mode: 'keys' | 'frames',
): Frame[] {
  const found: number[] = [];
  const ids = new Set(sources.map((layer) => layer.id));
  for (const curve of view.query.curvesOfControl(clip.id, plan.control.id)) {
    const own = ids.has(curve.layer);
    const kept = curve.layer === target.id && plan.channels.has(curve.channel);
    if (!own && !kept) continue;
    for (const key of view.query.keysOfCurve(curve.id)) found.push(key.t);
  }
  if (mode === 'frames' && found.length > 0) {
    for (let f = Math.ceil(clip.range.start); f <= clip.range.end; f++) found.push(f);
  }
  found.sort((a, b) => a - b);
  const out: Frame[] = [];
  for (const t of found) if (out.length === 0 || t - (out[out.length - 1] as number) > SAME_TIME) out.push(t);
  return out;
}

/** Keyed curve values as `view` sees them (compiled once per curve); null for a key-less curve. */
function curveEvaluator(app: EditorApp, view: ReadView): (curve: CurveRecord, frame: Frame) => number | null {
  const engine = internalsOf(app).deps.curves.engine;
  const compiled = new Map<CurveId, CompiledAnimCurve | null>();
  return (curve, frame) => {
    let hit = compiled.get(curve.id);
    if (hit === undefined) {
      const keys = view.query.keysOfCurve(curve.id);
      hit = keys.length === 0 ? null : engine.compile(animCurve(curve, keys));
      compiled.set(curve.id, hit);
    }
    return hit === null ? null : engine.evaluate(hit, frame);
  };
}
