// Layer tools (ANIM-LAYERS-SPEC §4, ADR 0026): layer_add (layer.add), layer_set (layer.set, layer.reorder) and
// layer_merge (layer.merge). Agents' key and pose tools write the base layer; these manage the layers above it. An
// agent never changes which layer the user keys into (MCP-SPEC §4.1 runner rule 6).
import type { LayerId, LayerRecord } from '@ekza-studio/doc';
import { playingLayers } from '@ekza-studio/editor-core';
import { addressed, labelName, staleCheck, valueOf, writeResult } from '../../runtime/toolkit';
import { quoteName } from '../../sanitize/sanitize';
import { AgentToolFailure, type AgentToolContext, type AgentToolResult, type ConfirmPrompt } from '../../types';

export interface LayerOut {
  readonly name: string;
  readonly mode: 'additive' | 'override' | 'base';
  readonly weight: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly locked: boolean;
  readonly playing: boolean;
  readonly curves: number;
}

/** The clip's stack, base first, as the tools report it. */
export function layerStack(ctx: AgentToolContext, clip: LayerRecord['clip']): readonly LayerOut[] {
  const layers = ctx.app.store.query.layersOfClip(clip);
  const playing = new Set(playingLayers(layers).map((layer) => layer.id));
  const curves = ctx.app.store.query.curvesOfClip(clip);
  return layers.map((layer, i) => ({
    name: layer.name,
    mode: i === 0 ? 'base' : layer.mode,
    weight: i === 0 ? 1 : layer.weight,
    muted: layer.mute,
    solo: layer.solo,
    locked: layer.locked === true,
    playing: playing.has(layer.id),
    curves: curves.filter((curve) => curve.layer === layer.id).length,
  }));
}

function layerByName(ctx: AgentToolContext, clip: LayerRecord['clip'], name: string): LayerRecord {
  const layers = ctx.app.store.query.layersOfClip(clip);
  const found = layers.find((layer) => layer.id === name) ?? layers.find((layer) => layer.name === name);
  if (found !== undefined) return found;
  throw new AgentToolFailure(
    'not_found',
    `The clip has no layer ${quoteName(name)}.`,
    `its layers: ${layers.map((layer) => quoteName(layer.name)).join(', ')}`,
  );
}

// ---------- layer_add ----------
export interface LayerAddArgs {
  readonly character?: string | undefined;
  readonly clip?: string | undefined;
  readonly name?: string | undefined;
  readonly mode: 'additive' | 'override';
  readonly weight: number;
  readonly ifClipRevision?: number | undefined;
}

export async function layerAdd(ctx: AgentToolContext, args: LayerAddArgs): Promise<AgentToolResult<unknown>> {
  const target = addressed(ctx, args);
  const stale = staleCheck(ctx, target.clip.id, args.ifClipRevision, { curves: 'all', clipRecord: true });
  ctx.focus(
    { character: target.character.id, clip: target.clip.id, controls: [], frame: null },
    `Add layer to ${labelName(target.clip.name)}`,
  );
  const run = await ctx.run('layer.add', {
    clip: target.clip.id,
    ...(args.name === undefined ? {} : { name: args.name }),
    mode: args.mode,
    weight: args.weight,
    activate: false,
  });
  const { layer } = valueOf<{ readonly layer: LayerId }>('layer.add', run);
  const added = ctx.app.store.get('layers', layer);
  return writeResult(ctx, target.clip.id, run, { layer: added?.name ?? layer, layers: layerStack(ctx, target.clip.id) }, [
    stale,
    'agent key and pose tools write the base layer; the user keys into the layer they chose',
  ]);
}

// ---------- layer_set ----------
export interface LayerSetArgs {
  readonly character?: string | undefined;
  readonly clip?: string | undefined;
  readonly layer: string;
  readonly weight?: number | undefined;
  readonly mute?: boolean | undefined;
  readonly solo?: boolean | undefined;
  readonly lock?: boolean | undefined;
  readonly name?: string | undefined;
  readonly move?: 'up' | 'down' | undefined;
  readonly ifClipRevision?: number | undefined;
}

export async function layerSet(ctx: AgentToolContext, args: LayerSetArgs): Promise<AgentToolResult<unknown>> {
  const target = addressed(ctx, args);
  const layer = layerByName(ctx, target.clip.id, args.layer);
  const stale = staleCheck(ctx, target.clip.id, args.ifClipRevision, { curves: 'all', clipRecord: true });
  ctx.focus(
    { character: target.character.id, clip: target.clip.id, controls: [], frame: null },
    `Layer ${labelName(layer.name)}`,
  );
  const fields = {
    ...(args.weight === undefined ? {} : { weight: args.weight }),
    ...(args.mute === undefined ? {} : { mute: args.mute }),
    ...(args.solo === undefined ? {} : { solo: args.solo }),
    ...(args.lock === undefined ? {} : { locked: args.lock }),
    ...(args.name === undefined ? {} : { name: args.name }),
  };
  let run = null;
  if (Object.keys(fields).length > 0) run = await ctx.run('layer.set', { layer: layer.id, ...fields });
  if (args.move !== undefined) run = await ctx.run('layer.reorder', { layer: layer.id, to: args.move });
  if (run === null) {
    throw new AgentToolFailure('invalid_args', 'Nothing to change.', 'pass weight, mute, solo, lock, name or move');
  }
  valueOf('layer.set', run);
  return writeResult(ctx, target.clip.id, run, { layers: layerStack(ctx, target.clip.id) }, [stale]);
}

// ---------- layer_merge ----------
export interface LayerMergeArgs {
  readonly character?: string | undefined;
  readonly clip?: string | undefined;
  readonly layer?: string | undefined;
  readonly scope: 'down' | 'all';
  readonly times: 'keys' | 'frames';
  readonly confirm?: boolean | undefined;
  readonly ifClipRevision?: number | undefined;
}

export function layerMergeConfirm(ctx: AgentToolContext, args: LayerMergeArgs): ConfirmPrompt | null {
  if (args.scope !== 'all') return null;
  const target = addressed(ctx, args);
  return {
    title: `Merge every layer of ${quoteName(target.clip.name)} into its base?`,
    detail: 'What plays stays the same; the layers are removed. Undo restores them.',
    danger: true,
  };
}

export async function layerMerge(ctx: AgentToolContext, args: LayerMergeArgs): Promise<AgentToolResult<unknown>> {
  const target = addressed(ctx, args);
  const layers = ctx.app.store.query.layersOfClip(target.clip.id);
  const layer =
    args.layer !== undefined
      ? layerByName(ctx, target.clip.id, args.layer)
      : args.scope === 'all'
        ? layers[0]
        : layers.at(-1);
  if (layer === undefined) throw new AgentToolFailure('not_found', 'The clip has no layers.', 'layer_add adds one');
  const stale = staleCheck(ctx, target.clip.id, args.ifClipRevision, { curves: 'all', clipRecord: true });
  ctx.focus(
    { character: target.character.id, clip: target.clip.id, controls: [], frame: null },
    `Merge layers of ${labelName(target.clip.name)}`,
  );
  const run = await ctx.run('layer.merge', { layer: layer.id, scope: args.scope, times: args.times });
  const value = valueOf<{ readonly layer: LayerId; readonly keys: number }>('layer.merge', run);
  const into = ctx.app.store.get('layers', value.layer);
  return writeResult(
    ctx,
    target.clip.id,
    run,
    { into: into?.name ?? value.layer, keys: value.keys, layers: layerStack(ctx, target.clip.id) },
    [stale],
  );
}
