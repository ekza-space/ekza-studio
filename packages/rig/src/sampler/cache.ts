import {
  type AnimCurve,
  blendLayerScalar,
  blendLayerSlot,
  blendLayerTrs,
  blendOverrideRotation,
  type CompiledAnimCurve,
  type CurveEngine,
  curveEngine,
  EkzaError,
  type Frame,
  type LayerBlendMode,
  type RotateOrder,
} from '@ekza-studio/anim-core';
import {
  type AnyChange,
  batchTables,
  type ChangeBatch,
  type ChannelId,
  type ClipId,
  type ControlId,
  type CurveId,
  type CurveRecord,
  type DocumentStore,
  type LayerRecord,
  TRS_CHANNELS,
} from '@ekza-studio/doc';
import { CHANNELS_PER_CONTROL, type ChannelBuffer, type ClipSampler, type CurveInfo, type RigProgram } from '../types';
import { attrChannelSlot, channelDefaultValue, channelSlot } from './channels';
import { layerAffects, layerMode, layerRestValue, layerWeight, playingLayers } from './layers';

export interface CurveCache {
  get(curve: CurveId): CompiledAnimCurve;
  readonly version: number;
  dispose(): void;
}

/** Engine used by each cache (kept out of the CurveCache contract). */
const cacheEngines = new WeakMap<CurveCache, CurveEngine>();

/** Channel identity of a curve record: duplicates of one channel share it (ARCHITECTURE §4.2 projection rule). */
function channelKey(curve: Pick<CurveRecord, 'clip' | 'layer' | 'control' | 'channel'>): string {
  return `${curve.clip}\u0000${curve.layer}\u0000${curve.control}\u0000${curve.channel}`;
}

/**
 * Compiled curves by CurveId (ARCHITECTURE §5). A curve compiles from `store.query.keysOfCurve` (duplicate key times
 * and duplicate curves already projected) and is dropped whenever a batch, preview batches included, touches the
 * curve or a key of any curve of the same channel. `version` increments on every invalidation.
 */
export function createCurveCache(store: DocumentStore, engine: CurveEngine = curveEngine): CurveCache {
  const compiled = new Map<CurveId, CompiledAnimCurve>();
  const byChannel = new Map<string, Set<CurveId>>();
  const channelOf = new Map<CurveId, string>();
  let version = 0;
  let disposed = false;

  const forget = (curve: CurveId): void => {
    const key = channelOf.get(curve);
    if (key === undefined) return;
    for (const member of byChannel.get(key) ?? []) {
      compiled.delete(member);
      channelOf.delete(member);
    }
    byChannel.delete(key);
  };
  const forgetChannel = (curve: CurveRecord | undefined): void => {
    if (curve === undefined) return;
    const key = channelKey(curve);
    for (const member of byChannel.get(key) ?? []) {
      compiled.delete(member);
      channelOf.delete(member);
    }
    byChannel.delete(key);
  };
  const curveRecordOf = (id: CurveId): CurveRecord | undefined => store.getIncludingDeleted('curves', id);

  /** Curves whose keys changed in the batch being processed (each forgotten once, M-1 mechanism 4). */
  const keyed = new Set<CurveId>();
  const onChange = (change: AnyChange): boolean => {
    if (change.table === 'curves') {
      forget(change.id);
      forgetChannel(change.before);
      forgetChannel(change.after);
      return true;
    }
    if (change.table === 'keys') {
      if (change.before !== undefined) keyed.add(change.before.curve);
      if (change.after !== undefined) keyed.add(change.after.curve);
      return true;
    }
    return false;
  };

  const unsubscribe = store.subscribe((batch: ChangeBatch) => {
    if (batch.origin === 'load') {
      compiled.clear();
      byChannel.clear();
      channelOf.clear();
      version++;
      return;
    }
    let touched = false;
    // M-1: a drag batch is 1,000 key updates in runs of one curve; a key update that stays on the curve of the change
    // before it adds nothing (one check instead of two set insertions per key, in a fresh editor's interpreted frames).
    let lastCurve: CurveId | null = null;
    const changes = batch.changes;
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i] as AnyChange;
      if (change.table === 'keys' && change.before !== undefined && change.after !== undefined) {
        const curve = change.before.curve;
        touched = true;
        if (curve === lastCurve && change.after.curve === curve) continue;
        lastCurve = change.after.curve === curve ? curve : null;
      }
      touched = onChange(change) || touched;
    }
    // Only the curves the batch touched recompile (on their next read); a 1,000-key drag of 30 curves forgets 30.
    for (const curve of keyed) {
      forget(curve);
      forgetChannel(curveRecordOf(curve));
    }
    keyed.clear();
    if (touched) version++;
  });

  const cache: CurveCache = {
    get(curveId: CurveId): CompiledAnimCurve {
      const hit = compiled.get(curveId);
      if (hit !== undefined) return hit;
      const curve = store.get('curves', curveId);
      if (curve === undefined)
        throw new EkzaError('invalid-record', `Curve ${curveId} does not exist`, { curve: curveId });
      const anim: AnimCurve = {
        keys: store.query.keysOfCurve(curveId),
        weighted: curve.weighted,
        pre: curve.pre,
        post: curve.post,
      };
      const result = engine.compile(anim);
      if (!disposed) {
        compiled.set(curveId, result);
        const key = channelKey(curve);
        channelOf.set(curveId, key);
        const members = byChannel.get(key);
        if (members === undefined) byChannel.set(key, new Set([curveId]));
        else members.add(curveId);
      }
      return result;
    },
    get version(): number {
      return version;
    },
    dispose(): void {
      disposed = true;
      unsubscribe();
      compiled.clear();
      byChannel.clear();
      channelOf.clear();
    },
  };
  cacheEngines.set(cache, engine);
  return cache;
}

/** The engine a cache compiles with (anim-core's AnimX engine for caches not made by `createCurveCache`). */
export function engineOf(cache: CurveCache): CurveEngine {
  return cacheEngines.get(cache) ?? curveEngine;
}

const TRS_ORDER = new Map<string, number>(TRS_CHANNELS.map((channel, i) => [channel, i]));

function compareChannels(a: ChannelId, b: ChannelId): number {
  const x = TRS_ORDER.get(a) ?? TRS_CHANNELS.length;
  const y = TRS_ORDER.get(b) ?? TRS_CHANNELS.length;
  if (x !== y) return x - y;
  return a < b ? -1 : a > b ? 1 : 0;
}

interface PlanEntry {
  readonly curve: CurveId;
  readonly control: ControlId;
  readonly channel: ChannelId;
  /** Offset into ChannelBuffer.values, −1 when the program has no such control or the channel has no slot. */
  readonly offset: number;
  /** TRS slot 0…8 of the channel, −1 for attributes and unknown channels. */
  readonly slot: number;
  /** M2a: ChannelBuffer.attrs slot of an attribute channel ('@name'), −1 otherwise (M2A-SPEC §5.1 rule 3). */
  readonly attr: number;
  /** Value without keys: staticValue ?? channel default (AttrDef.default for attributes); additive layers: identity. */
  readonly rest: number;
}

/**
 * One control's TRS entries on a non-base layer: `direct` slots fold one by one (`blendLayerSlot`); `rotation` holds
 * the rotation entries of a partial-weight override, which slerp as a triple (`blendOverrideRotation`).
 */
interface ControlGroup {
  readonly control: ControlId;
  readonly offset: number;
  readonly order: RotateOrder;
  readonly entries: readonly PlanEntry[];
  readonly direct: readonly PlanEntry[];
  readonly rotation: readonly PlanEntry[];
}

/** A playing layer's part of the plan (ANIM-LAYERS-SPEC §2). */
interface LayerPlan {
  readonly layer: LayerRecord;
  readonly base: boolean;
  readonly mode: LayerBlendMode;
  readonly weight: number;
  /** Every entry, by control then channel (the base folds by copying them, the single-layer path of M1). */
  readonly entries: readonly PlanEntry[];
  /** Non-base layers: TRS entries grouped per control, and the attribute entries. */
  readonly groups: readonly ControlGroup[];
  readonly attrs: readonly PlanEntry[];
}

interface Plan {
  readonly layers: readonly LayerPlan[];
  /** Every entry of every playing layer, per control (layer order kept). */
  readonly byControl: ReadonlyMap<ControlId, readonly { readonly layer: number; readonly entry: PlanEntry }[]>;
}

const EMPTY_PLAN: Plan = { layers: [], byControl: new Map() };

/**
 * Per-clip sampler over the clip's playing layers (MVP-SPEC §4.11.8; ANIM-LAYERS-SPEC §2): keyed curves evaluate
 * through the cache's engine, key-less curves give `staticValue ?? default` (identity on additive layers), channels
 * without a curve keep their defaults. The base copies its values (bit-identical to the single-layer sampler); each
 * further layer folds through anim-core's blend. The plan is resolved once and re-resolved after batches that touch
 * curves or layers; sampling allocates nothing.
 */
export function createClipSampler(
  store: DocumentStore,
  cache: CurveCache,
  clip: ClipId,
  program: RigProgram,
): ClipSampler {
  const engine = engineOf(cache);
  let plan: Plan | null = null;
  /** One control's layer values (NaN = no curve) while a group folds. */
  const scratch = new Float64Array(CHANNELS_PER_CONTROL);
  /** One control's composite for `value()`. */
  const single = new Float64Array(CHANNELS_PER_CONTROL);

  const unsubscribe = store.subscribe((batch) => {
    if (batch.origin === 'load') {
      plan = null;
      return;
    }
    // Keys do not change the plan: key counts and values come from the compiled curves. M-1: the batch's table set
    // (one scan per batch for every listener) instead of a scan of a 1,000-key drag batch here.
    const tables = batchTables(batch);
    if (tables.has('curves') || tables.has('layers')) plan = null;
  });

  const entryOf = (curve: CurveRecord, additive: boolean): PlanEntry => {
    const index = program.controlIndex.get(curve.control);
    const slot = channelSlot(curve.channel);
    const attr = index === undefined ? -1 : attrChannelSlot(program, curve.control, curve.channel);
    const def = program.attrSlots[attr]?.def;
    return {
      curve: curve.id,
      control: curve.control,
      channel: curve.channel,
      offset: index === undefined || slot === -1 ? -1 : index * CHANNELS_PER_CONTROL + slot,
      slot,
      attr,
      rest: additive ? layerRestValue(curve, true, def) : (curve.staticValue ?? channelDefaultValue(curve.channel, def)),
    };
  };

  const resolve = (): Plan => {
    if (plan !== null) return plan;
    const all = store.query.layersOfClip(clip);
    const base = all[0];
    const playing = playingLayers(all);
    if (playing.length === 0) {
      plan = EMPTY_PLAN;
      return plan;
    }
    // Projection rule (ARCHITECTURE §4.2): one curve per channel, the smallest CurveId; the store unions the keys
    // of its duplicates into it. Stores may or may not list duplicates in curvesOfClip, so they are dropped here.
    const canonical = new Map<string, CurveRecord>();
    const index = new Map<string, number>(playing.map((layer, i) => [layer.id, i]));
    for (const curve of store.query.curvesOfClip(clip)) {
      if (!index.has(curve.layer)) continue;
      const key = channelKey(curve);
      const current = canonical.get(key);
      if (current === undefined || curve.id < current.id) canonical.set(key, curve);
    }
    const perLayer: CurveRecord[][] = playing.map(() => []);
    for (const curve of canonical.values()) perLayer[index.get(curve.layer) as number]?.push(curve);
    const byControl = new Map<ControlId, { layer: number; entry: PlanEntry }[]>();
    const layers = playing.map((layer, i): LayerPlan => {
      const isBase = layer.id === base?.id;
      const mode = layerMode(layer, isBase);
      const additive = mode === 'additive';
      const entries = (perLayer[i] as CurveRecord[])
        .filter((curve) => isBase || layerAffects(layer, curve.control))
        .map((curve) => entryOf(curve, additive))
        .sort((a, b) =>
          a.control < b.control ? -1 : a.control > b.control ? 1 : compareChannels(a.channel, b.channel),
        );
      for (const entry of entries) {
        const list = byControl.get(entry.control);
        if (list === undefined) byControl.set(entry.control, [{ layer: i, entry }]);
        else list.push({ layer: i, entry });
      }
      const groups: ControlGroup[] = [];
      const attrs: PlanEntry[] = [];
      if (!isBase) {
        const slerps = mode === 'override' && layerWeight(layer, isBase) < 1;
        type Group = { control: ControlId; offset: number; order: RotateOrder; entries: PlanEntry[]; direct: PlanEntry[]; rotation: PlanEntry[] };
        let current: Group | null = null;
        for (const entry of entries) {
          if (entry.offset === -1) {
            if (entry.attr !== -1) attrs.push(entry);
            continue;
          }
          if (current === null || current.control !== entry.control) {
            const controlIndex = program.controlIndex.get(entry.control) as number;
            current = {
              control: entry.control,
              offset: controlIndex * CHANNELS_PER_CONTROL,
              order: program.controls[controlIndex]?.rotateOrder ?? 'xyz',
              entries: [],
              direct: [],
              rotation: [],
            };
            groups.push(current);
          }
          current.entries.push(entry);
          if (slerps && entry.slot >= 3 && entry.slot < 6) current.rotation.push(entry);
          else current.direct.push(entry);
        }
      }
      return { layer, base: isBase, mode, weight: layerWeight(layer, isBase), entries, groups, attrs };
    });
    plan = { layers, byControl };
    return plan;
  };

  const valueOf = (entry: PlanEntry, frame: Frame): number => {
    const compiled = cache.get(entry.curve);
    return compiled.keyCount > 0 ? engine.evaluate(compiled, frame) : entry.rest;
  };

  /** Folds every playing layer into `out` (the defaults already in it). */
  const fold = (current: Plan, frame: Frame, out: ChannelBuffer): void => {
    for (let l = 0; l < current.layers.length; l++) {
      const layer = current.layers[l] as LayerPlan;
      if (layer.base) {
        const entries = layer.entries;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i] as PlanEntry;
          if (entry.offset !== -1) out.values[entry.offset] = valueOf(entry, frame);
          else if (entry.attr !== -1 && entry.attr < out.attrs.length) out.attrs[entry.attr] = valueOf(entry, frame);
        }
        continue;
      }
      const groups = layer.groups;
      const values = out.values;
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g] as ControlGroup;
        const direct = group.direct;
        for (let i = 0; i < direct.length; i++) {
          const entry = direct[i] as PlanEntry;
          values[entry.offset] = blendLayerSlot(
            values[entry.offset] as number,
            valueOf(entry, frame),
            entry.slot,
            layer.mode,
            layer.weight,
          );
        }
        const rotation = group.rotation;
        if (rotation.length === 0) continue;
        scratch[3] = Number.NaN;
        scratch[4] = Number.NaN;
        scratch[5] = Number.NaN;
        for (let i = 0; i < rotation.length; i++) {
          const entry = rotation[i] as PlanEntry;
          scratch[entry.slot] = valueOf(entry, frame);
        }
        blendOverrideRotation(values, group.offset, scratch[3] as number, scratch[4] as number, scratch[5] as number, layer.weight, group.order);
      }
      const attrs = layer.attrs;
      for (let i = 0; i < attrs.length; i++) {
        const entry = attrs[i] as PlanEntry;
        if (entry.attr >= out.attrs.length) continue;
        out.attrs[entry.attr] = blendLayerScalar(
          out.attrs[entry.attr] as number,
          valueOf(entry, frame),
          layer.mode,
          layer.weight,
        );
      }
    }
  };

  /** Composite of one channel of `control` (the control's whole stack folded, then the channel read). */
  const compositeOf = (control: ControlId, channel: ChannelId, frame: Frame): number | undefined => {
    const current = resolve();
    const list = current.byControl.get(control);
    if (list === undefined || !list.some(({ entry }) => entry.channel === channel)) return undefined;
    const slot = channelSlot(channel);
    if (slot === -1) {
      let v: number | undefined;
      for (const { layer, entry } of list) {
        if (entry.channel !== channel) continue;
        const plan = current.layers[layer] as LayerPlan;
        const y = valueOf(entry, frame);
        v = v === undefined && plan.base ? y : blendLayerScalar(v ?? attrDefault(control, channel), y, plan.mode, plan.weight);
      }
      return v;
    }
    for (let c = 0; c < CHANNELS_PER_CONTROL; c++) single[c] = c >= 6 ? 1 : 0;
    const index = program.controlIndex.get(control);
    const order = index === undefined ? 'xyz' : (program.controls[index]?.rotateOrder ?? 'xyz');
    let at = 0;
    while (at < list.length) {
      const layerIndex = (list[at] as { layer: number }).layer;
      const plan = current.layers[layerIndex] as LayerPlan;
      scratch.fill(Number.NaN);
      for (; at < list.length && (list[at] as { layer: number }).layer === layerIndex; at++) {
        const entry = (list[at] as { entry: PlanEntry }).entry;
        if (entry.slot !== -1) scratch[entry.slot] = valueOf(entry, frame);
      }
      blendLayerTrs(single, 0, scratch, 0, plan.mode, plan.weight, order);
    }
    return single[slot];
  };

  const attrDefault = (control: ControlId, channel: ChannelId): number =>
    channelDefaultValue(channel, program.attrSlots[attrChannelSlot(program, control, channel)]?.def);

  return {
    clip,
    sample(frame: Frame, out: ChannelBuffer): void {
      program.resetChannels(out);
      fold(resolve(), frame, out);
    },
    value(control: ControlId, channel: ChannelId, frame: Frame): number | undefined {
      return compositeOf(control, channel, frame);
    },
    keyTimes(controls: readonly ControlId[] | null): readonly Frame[] {
      const current = resolve();
      const wanted = controls === null ? null : new Set(controls);
      const times = new Set<number>();
      for (const layer of current.layers) {
        for (const entry of layer.entries) {
          if (wanted !== null && !wanted.has(entry.control)) continue;
          const compiled = cache.get(entry.curve);
          for (let k = 0; k < compiled.keyCount; k++) times.add(compiled.t[k] as number);
        }
      }
      return [...times].sort((a, b) => a - b);
    },
    curveInfo(control: ControlId): readonly CurveInfo[] {
      return (resolve().byControl.get(control) ?? []).map(({ entry }): CurveInfo => {
        const keys = store.query.keysOfCurve(entry.curve);
        const record = store.get('curves', entry.curve);
        return {
          channel: entry.channel,
          keyTimes: [...new Set(keys.map((key) => key.t))].sort((a, b) => a - b),
          steppedThroughout: keys.length > 0 && keys.every((key) => key.outType === 'step'),
          pre: record?.pre ?? 'constant',
          post: record?.post ?? 'constant',
        };
      });
    },
    dispose(): void {
      unsubscribe();
      plan = null;
    },
  };
}
