// Layer stacks (ANIM-LAYERS-SPEC §1–§2, ADR 0026): which layers play, what a key-less curve on a layer is worth, and
// one control's stack at a frame. The ClipSampler folds the same stacks per frame; the editor's channel readouts,
// keying solves and merges read them through `controlStackAt`, so every reader agrees with what plays.
import {
  additiveIdentity,
  clampWeight,
  type LayerBlendMode,
  type LayerStackEntry,
  type ScalarLayerEntry,
} from '@ekza-studio/anim-core';
import type {
  AttrDef,
  ChannelId,
  ClipId,
  ControlId,
  ControlRecord,
  CurveRecord,
  LayerRecord,
  ReadView,
} from '@ekza-studio/doc';
import { channelDefaultValue, channelSlot } from './channels';

/**
 * The layers that play, in stack order (base first): a muted layer never plays; while any layer is soloed only the
 * soloed layers and the (unmuted) base play; a non-base layer at weight 0 plays nothing.
 */
export function playingLayers(layers: readonly LayerRecord[]): readonly LayerRecord[] {
  if (layers.length <= 1) return layers.length === 1 && layers[0]?.mute === true ? [] : layers;
  const soloing = layers.some((layer) => layer.solo);
  return layers.filter((layer, i) => {
    if (layer.mute) return false;
    if (i === 0) return true;
    if (soloing && !layer.solo) return false;
    return clampWeight(layer.weight) > 0;
  });
}

/** Whether a layer plays at all (`playingLayers` of its clip's stack contains it). */
export function isLayerPlaying(layers: readonly LayerRecord[], layer: LayerRecord): boolean {
  return playingLayers(layers).some((candidate) => candidate.id === layer.id);
}

/** The blend mode of a layer in its stack: the base always copies (override, weight 1). */
export function layerMode(layer: LayerRecord, base: boolean): LayerBlendMode {
  return base ? 'override' : layer.mode;
}

/** The weight of a layer in its stack: the base always 1; others clamped to 0…1. */
export function layerWeight(layer: LayerRecord, base: boolean): number {
  return base ? 1 : clampWeight(layer.weight);
}

/** Whether a layer's mask lets it affect `control` (no mask: every control). */
export function layerAffects(layer: LayerRecord, control: ControlId): boolean {
  const mask = layer.mask;
  return mask === undefined || mask === null || mask.includes(control);
}

/**
 * The value of a key-less curve on a layer: its static value, else the identity of an additive layer (0, scale 1),
 * else the channel default (an override layer, the base).
 */
export function layerRestValue(curve: CurveRecord, additive: boolean, def?: AttrDef): number {
  if (curve.staticValue !== null) return curve.staticValue;
  if (additive) {
    const slot = channelSlot(curve.channel);
    return slot === -1 ? 0 : additiveIdentity(slot);
  }
  return channelDefaultValue(curve.channel, def);
}

/** One control's stack at a frame (the playing layers that affect it, base first). */
export interface ControlStack {
  readonly layers: readonly LayerRecord[];
  /** TRS values per layer (9 slots, NaN where the layer has no curve), parallel to `layers`. */
  readonly entries: readonly LayerStackEntry[];
  /** The channel defaults the stack starts from (0 / 1 for scale). */
  readonly input: Float64Array;
}

const REST = Object.freeze([0, 0, 0, 0, 0, 0, 1, 1, 1]);

/**
 * The stack of `control` in `clip` at the frame `value` evaluates curves at (`value(curve)` gives a keyed curve's
 * value; key-less curves are resolved here). `extra` adds a layer that does not play (keying refusals inspect it).
 */
export function controlStackAt(
  view: ReadView,
  clip: ClipId,
  control: ControlRecord,
  value: (curve: CurveRecord) => number | null,
  extra?: LayerRecord,
): ControlStack {
  const all = view.query.layersOfClip(clip);
  const playing = playingLayers(all);
  const wanted = extra === undefined || playing.includes(extra) ? playing : all.filter((l) => playing.includes(l) || l.id === extra.id);
  const curves = view.query.curvesOfControl(clip, control.id);
  const layers: LayerRecord[] = [];
  const entries: LayerStackEntry[] = [];
  for (const layer of wanted) {
    const base = layer.id === all[0]?.id;
    if (!base && !layerAffects(layer, control.id)) continue;
    const additive = layerMode(layer, base) === 'additive';
    const values = new Float64Array(9).fill(Number.NaN);
    for (const curve of canonicalCurves(curves, layer)) {
      const slot = channelSlot(curve.channel);
      if (slot === -1) continue;
      values[slot] = value(curve) ?? layerRestValue(curve, additive);
    }
    layers.push(layer);
    entries.push({ mode: layerMode(layer, base), weight: layerWeight(layer, base), values });
  }
  return { layers, entries, input: Float64Array.from(REST) };
}

/** A scalar channel's stack (custom attributes '@name'), with its default as the input. */
export function attrStackAt(
  view: ReadView,
  clip: ClipId,
  control: ControlRecord,
  channel: ChannelId,
  value: (curve: CurveRecord) => number | null,
  extra?: LayerRecord,
): { readonly layers: readonly LayerRecord[]; readonly entries: readonly ScalarLayerEntry[]; readonly input: number } {
  const all = view.query.layersOfClip(clip);
  const playing = playingLayers(all);
  const wanted = extra === undefined || playing.includes(extra) ? playing : all.filter((l) => playing.includes(l) || l.id === extra.id);
  const def = control.attrs?.[channel.slice(1)];
  const layers: LayerRecord[] = [];
  const entries: ScalarLayerEntry[] = [];
  for (const layer of wanted) {
    const base = layer.id === all[0]?.id;
    if (!base && !layerAffects(layer, control.id)) continue;
    const additive = layerMode(layer, base) === 'additive';
    const curve = view.query.curveFor(clip, layer.id, control.id, channel);
    const y = curve === undefined ? Number.NaN : (value(curve) ?? layerRestValue(curve, additive, def));
    layers.push(layer);
    entries.push({ mode: layerMode(layer, base), weight: layerWeight(layer, base), value: y });
  }
  return { layers, entries, input: channelDefaultValue(channel, def) };
}

/** The canonical (smallest-id) live curve per channel of `layer` among a control's curves (ARCHITECTURE §4.2). */
function canonicalCurves(curves: readonly CurveRecord[], layer: LayerRecord): readonly CurveRecord[] {
  const byChannel = new Map<ChannelId, CurveRecord>();
  for (const curve of curves) {
    if (curve.layer !== layer.id) continue;
    const current = byChannel.get(curve.channel);
    if (current === undefined || curve.id < current.id) byChannel.set(curve.channel, curve);
  }
  return [...byChannel.values()];
}
