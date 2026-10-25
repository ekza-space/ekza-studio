// Animation layers in Ekza Studio, the pure part (ANIM-LAYERS-SPEC §5): the active animation's stack as rows, which
// layer keys go into, and the operator calls the chip, its Halo and the Layers sheet run — the same operators as
// Studio Pro's Layers panel (`layer.*`, `clip.adjustOnLayer`), so both shells write the same document.
import type { ClipId, LayerId, LayerRecord } from '@ekza-studio/doc';
import { type EditorApp, editLayerOf, playingLayers } from '@ekza-studio/editor-core';
import { threadContext } from '../thread/strip/model';

export interface LayerRow {
  readonly id: LayerId;
  readonly name: string;
  readonly base: boolean;
  readonly mode: 'additive' | 'override';
  /** 0…1 (the base: 1). */
  readonly weight: number;
  readonly mute: boolean;
  readonly solo: boolean;
  readonly locked: boolean;
  /** Keys go into this layer. */
  readonly active: boolean;
  /** It plays (not muted, not soloed away, weight above 0). */
  readonly playing: boolean;
  /** Its stack position, base = 0. */
  readonly index: number;
}

export interface OpCall {
  readonly op: string;
  readonly args?: unknown;
}

/** The animation the Thread shows (the active character's active clip), or null. */
export function layersClip(app: EditorApp): ClipId | null {
  return threadContext(app)?.clip.id ?? null;
}

/** The stack of `clip`, base first, as rows. */
export function layerRows(app: EditorApp, clip: ClipId): readonly LayerRow[] {
  const layers = app.store.query.layersOfClip(clip);
  const playing = new Set(playingLayers(layers).map((layer) => layer.id));
  const active = editLayerOf(app, app.store, clip)?.id;
  return layers.map(
    (layer: LayerRecord, index): LayerRow => ({
      id: layer.id,
      name: layer.name,
      base: index === 0,
      mode: index === 0 ? 'override' : layer.mode,
      weight: index === 0 ? 1 : layer.weight,
      mute: layer.mute,
      solo: layer.solo,
      locked: layer.locked === true,
      active: layer.id === active,
      playing: playing.has(layer.id),
      index,
    }),
  );
}

/** True when the animation has layers above its base (the chip and "Keying into" show only then). */
export function isLayered(app: EditorApp, clip: ClipId | null): boolean {
  return clip !== null && app.store.query.layersOfClip(clip).length > 1;
}

/** The name of the layer keys go into, when the animation has layers above its base; else null. */
export function keyingInto(app: EditorApp): string | null {
  const clip = layersClip(app);
  if (!isLayered(app, clip) || clip === null) return null;
  return editLayerOf(app, app.store, clip)?.name ?? null;
}

/** The row keys go into (the base when nothing else is active). */
export function activeRow(app: EditorApp, clip: ClipId): LayerRow | null {
  return layerRows(app, clip).find((row) => row.active) ?? null;
}

/** A weight as the chip shows it: whole percent. */
export function percentOf(weight: number): number {
  return Math.round(Math.min(1, Math.max(0, weight)) * 100);
}

export const adjustCall = (clip: ClipId): OpCall => ({ op: 'clip.adjustOnLayer', args: { clip } });
export const addCall = (clip: ClipId, mode: 'additive' | 'override'): OpCall => ({
  op: 'layer.add',
  args: { clip, mode },
});
export const activateCall = (layer: LayerId): OpCall => ({ op: 'layer.setActive', args: { layer } });
export const setCall = (
  layer: LayerId,
  fields: { readonly weight?: number; readonly mute?: boolean; readonly solo?: boolean; readonly locked?: boolean; readonly name?: string },
): OpCall => ({ op: 'layer.set', args: { layer, ...fields } });
export const weightCall = (layer: LayerId, percent: number): OpCall =>
  setCall(layer, { weight: Math.min(100, Math.max(0, Math.round(percent))) / 100 });
export const moveCall = (layer: LayerId, to: 'up' | 'down'): OpCall => ({ op: 'layer.reorder', args: { layer, to } });
export const duplicateCall = (layer: LayerId): OpCall => ({ op: 'layer.duplicate', args: { layer } });
export const removeCall = (layer: LayerId): OpCall => ({ op: 'layer.remove', args: { layer } });
export const mergeCall = (layer: LayerId, scope: 'down' | 'all', times: 'keys' | 'frames' = 'keys'): OpCall => ({
  op: 'layer.merge',
  args: { layer, scope, times },
});

/** The reason a call cannot run now (its poll), or null. */
export function pollReason(app: EditorApp, call: OpCall): string | null {
  if (app.operators.get(call.op) === undefined) return 'Not available here yet';
  try {
    const result = app.operators.poll(call.op, {}, call.args);
    return result === true ? null : result.reason;
  } catch {
    return null;
  }
}
