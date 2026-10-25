// Animation layer operators (ANIM-LAYERS-SPEC §4, ADR 0026): add, remove, set active, set (weight, mute, solo, lock,
// mode, name, mask), reorder, duplicate, merge, and Halo's one-tap *Adjust on a layer* (`clip.adjustOnLayer`). Each
// document change is one undo step; `layer.setActive` is session state. Polls answer in plain words. The apply bodies
// that walk curves (remove, duplicate, merge) are a lazy chunk (`layerBodies`, loaded by `prepare`).
import { EkzaError } from '@ekza-studio/anim-core';
import { type ClipId, type ClipRecord, fractionalIndex, type LayerId, type LayerRecord } from '@ekza-studio/doc';
import { newRecordId } from '../../app/internals';
import { editLayerOf, isBaseLayer } from '../../edit/layers';
import { type EditorApp, GLOBAL_SCOPE, type OperatorContext } from '../../types';
import { layerNameProblem, uniqueLayerName } from '../../workflows/layerNames';
import { orderAfter } from '../../workflows/records';
import { activeClipRecord } from '../../workflows/targets';
import type { LayerMode, LayerSetFields } from '../args';
import { type AnyOperator, all, defineOperator, fail, isFiniteNumber, isRecord, OK, optionalArgs } from './define';
import { lazyBodies } from './lazyBodies';
import { pollEditable } from './polls';

const layerBodies = lazyBodies(() => import('./layerBodies'));
type LayerBodies = Awaited<ReturnType<typeof layerBodies>>;

const MODES: readonly LayerMode[] = ['additive', 'override'];

function layerOf(app: EditorApp, args: unknown): LayerRecord | null {
  if (!isRecord(args) || typeof args['layer'] !== 'string') return null;
  return app.store.get('layers', args['layer'] as LayerId) ?? null;
}

function pollLayerArg(app: EditorApp, args: unknown) {
  if (!isRecord(args) || typeof args['layer'] !== 'string') return fail('expects { layer }');
  return layerOf(app, args) === null ? fail('The layer does not exist') : OK;
}

/** The clip an optional `{ clip }` names, else the active clip. */
function clipArg(app: EditorApp, args: unknown): ClipRecord | string {
  const options = optionalArgs(args);
  if (options === null) return 'expects { clip? }';
  const id = options['clip'];
  if (id !== undefined && typeof id !== 'string') return 'clip must be a clip id';
  const clip = id === undefined ? activeClipRecord(app) : app.store.get('clips', id as ClipId);
  if (clip === undefined) return id === undefined ? 'The character has no active clip' : 'The clip does not exist';
  return clip;
}

/** Writes the active layer of a clip into the session (an agent run never writes the user's session). */
export function setActiveLayer(
  ctx: Pick<OperatorContext, 'app'> & Partial<OperatorContext>,
  clip: ClipId,
  layer: LayerId,
): void {
  // MCP-SPEC §4.1 runner rule 6: an agent run changes what the user sees only with the View grant.
  if (ctx.actor !== undefined && ctx.actor !== null && ctx.access !== 'view') return;
  const state = ctx.app.session.getState();
  if (state.activeLayer?.[clip] === layer) return;
  ctx.app.session.setState({ activeLayer: { ...state.activeLayer, [clip]: layer } });
}

/** A new layer record on top of `clip`'s stack. */
function topLayer(
  app: EditorApp,
  clip: ClipRecord,
  fields: { readonly name: string; readonly mode: LayerMode; readonly weight: number },
  layers: readonly LayerRecord[],
): LayerRecord {
  return {
    id: newRecordId(app, 'layer'),
    clip: clip.id,
    name: fields.name,
    mode: fields.mode,
    weight: fields.weight,
    mute: false,
    solo: false,
    owner: null,
    order: orderAfter(layers.map((layer) => layer.order)),
    deleted: null,
  };
}

// ---------- add ----------

const layerAdd = defineOperator({
  id: 'layer.add',
  label: 'Add Animation Layer',
  description: 'Add an animation layer on top of the clip (additive by default) and key into it.',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true },
  undoLabel: () => 'Add Layer',
  poll({ app }, args) {
    const clip = clipArg(app, args);
    if (typeof clip === 'string') return fail(clip);
    const options = optionalArgs(args) ?? {};
    if (options['mode'] !== undefined && !MODES.includes(options['mode'] as LayerMode)) {
      return fail("mode is 'additive' or 'override'");
    }
    const weight = options['weight'];
    if (weight !== undefined && (!isFiniteNumber(weight) || weight < 0 || weight > 1)) return fail('weight is 0…1');
    if (options['name'] !== undefined) {
      const problem = layerNameProblem(app.store, clip.id, options['name']);
      if (problem !== null) return fail(problem);
    }
    if (options['activate'] !== undefined && typeof options['activate'] !== 'boolean') {
      return fail('activate must be a boolean');
    }
    return pollEditable(app);
  },
  async prepare({ app }, args) {
    const clip = clipArg(app, args);
    if (typeof clip !== 'string') await app.store.open(`clip:${clip.id}`);
  },
  apply(ctx, args) {
    const { app, tx } = ctx;
    if (tx === null) throw new EkzaError('internal', 'layer.add runs in a transaction');
    const clip = clipArg(app, args);
    if (typeof clip === 'string') throw new EkzaError('unsupported', clip);
    const options = args ?? {};
    const layers = tx.query.layersOfClip(clip.id);
    const layer = topLayer(
      app,
      clip,
      {
        name: options.name ?? uniqueLayerName(layers, 'Layer'),
        mode: options.mode ?? 'additive',
        weight: options.weight ?? 1,
      },
      layers,
    );
    if (layers.length === 0) throw new EkzaError('unsupported', 'The clip has no base layer');
    tx.put('layers', layer);
    if (options.activate !== false) setActiveLayer(ctx, clip.id, layer.id);
    return { layer: layer.id };
  },
});

// ---------- adjust on a layer (Halo) ----------

const clipAdjustOnLayer = defineOperator({
  id: 'clip.adjustOnLayer',
  label: 'Adjust on a Layer',
  description: 'Fix this animation on a new additive layer “Fixes” above it; the animation itself stays as it is.',
  category: 'clip',
  scope: GLOBAL_SCOPE,
  flags: { undo: true },
  undoLabel: () => 'Adjust on a Layer',
  poll({ app }, args) {
    const clip = clipArg(app, args);
    if (typeof clip === 'string') return fail(clip);
    if (app.store.query.layersOfClip(clip.id).length === 0) return fail('The clip has no base layer');
    return pollEditable(app);
  },
  async prepare({ app }, args) {
    const clip = clipArg(app, args);
    if (typeof clip !== 'string') await app.store.open(`clip:${clip.id}`);
  },
  apply(ctx, args) {
    const { app, tx } = ctx;
    if (tx === null) throw new EkzaError('internal', 'clip.adjustOnLayer runs in a transaction');
    const clip = clipArg(app, args);
    if (typeof clip === 'string') throw new EkzaError('unsupported', clip);
    const layers = tx.query.layersOfClip(clip.id);
    const layer = topLayer(
      app,
      clip,
      { name: uniqueLayerName(layers, 'Fixes', true), mode: 'additive', weight: 1 },
      layers,
    );
    tx.put('layers', layer);
    setActiveLayer(ctx, clip.id, layer.id);
    return { layer: layer.id };
  },
});

// ---------- set active ----------

const layerSetActive = defineOperator({
  id: 'layer.setActive',
  label: 'Key Into Layer',
  description: 'Choose the layer keys go to (the Dope Sheet and Graph Editor show its keys).',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { internal: true },
  poll: ({ app }, args) => pollLayerArg(app, args),
  apply(ctx, args) {
    const layer = ctx.app.store.get('layers', args.layer);
    if (layer === undefined) throw new EkzaError('invalid-record', `Layer ${args.layer} does not exist`);
    setActiveLayer(ctx, layer.clip, layer.id);
  },
});

// ---------- set ----------

const SET_FIELDS = ['weight', 'mute', 'solo', 'locked', 'mode', 'name', 'mask'] as const;
const BASE_FIELDS = new Set<string>(['mute', 'solo', 'locked']);

/** Why `fields` cannot be written on `layer`, or null. */
function setProblem(app: EditorApp, layer: LayerRecord, fields: Readonly<Record<string, unknown>>): string | null {
  const given = SET_FIELDS.filter((field) => fields[field] !== undefined);
  if (given.length === 0) return `expects at least one of ${SET_FIELDS.join(', ')}`;
  const base = isBaseLayer(app.store, layer);
  for (const field of given) {
    if (base && !BASE_FIELDS.has(field)) return 'The base layer always plays in full: only mute, solo and lock change';
  }
  const { weight, mute, solo, locked, mode, name, mask } = fields;
  if (weight !== undefined && (!isFiniteNumber(weight) || weight < 0 || weight > 1)) return 'weight is 0…1';
  for (const [key, value] of [
    ['mute', mute],
    ['solo', solo],
    ['locked', locked],
  ] as const) {
    if (value !== undefined && typeof value !== 'boolean') return `${key} must be a boolean`;
  }
  if (mode !== undefined) {
    if (!MODES.includes(mode as LayerMode)) return "mode is 'additive' or 'override'";
    if (mode !== layer.mode && app.store.query.curvesOfClip(layer.clip).some((curve) => curve.layer === layer.id)) {
      return `${layer.name} has curves — merge or clear it before changing its mode`;
    }
  }
  if (name !== undefined) {
    const problem = layerNameProblem(app.store, layer.clip, name, layer.id);
    if (problem !== null) return problem;
  }
  if (mask !== undefined && mask !== null) {
    if (
      !Array.isArray(mask) ||
      mask.some((id) => typeof id !== 'string' || app.store.get('controls', id as never) === undefined)
    ) {
      return 'mask is a list of control ids (or null for every control)';
    }
  }
  return null;
}

function setUndoLabel(args: unknown): string {
  const fields = isRecord(args) ? args : {};
  const given = SET_FIELDS.filter((field) => fields[field] !== undefined);
  if (given.length !== 1) return 'Layer Settings';
  switch (given[0]) {
    case 'weight':
      return 'Layer Weight';
    case 'mute':
      return fields['mute'] === true ? 'Mute Layer' : 'Unmute Layer';
    case 'solo':
      return fields['solo'] === true ? 'Solo Layer' : 'Unsolo Layer';
    case 'locked':
      return fields['locked'] === true ? 'Lock Layer' : 'Unlock Layer';
    case 'name':
      return 'Rename Layer';
    case 'mode':
      return 'Layer Mode';
    case 'mask':
      return 'Layer Mask';
    case undefined:
      return 'Layer Settings';
  }
  return 'Layer Settings';
}

const layerSet = defineOperator({
  id: 'layer.set',
  label: 'Layer Settings',
  description: 'Weight, mute, solo, lock, mode, name or body-part mask of an animation layer.',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true, internal: true },
  undoLabel: setUndoLabel,
  poll({ app }, args) {
    const base = pollLayerArg(app, args);
    if (base !== true) return base;
    const problem = setProblem(
      app,
      layerOf(app, args) as LayerRecord,
      args as unknown as Readonly<Record<string, unknown>>,
    );
    return problem === null ? pollEditable(app) : fail(problem);
  },
  async prepare({ app }, args) {
    const layer = layerOf(app, args);
    if (layer !== null) await app.store.open(`clip:${layer.clip}`);
  },
  apply({ tx }, args) {
    if (tx === null) throw new EkzaError('internal', 'layer.set runs in a transaction');
    const layer = tx.get('layers', args.layer);
    if (layer === undefined) throw new EkzaError('invalid-record', `Layer ${args.layer} does not exist`);
    const patch: { -readonly [K in keyof LayerRecord]?: LayerRecord[K] } = {};
    const fields: LayerSetFields = args;
    if (fields.weight !== undefined && fields.weight !== layer.weight) patch.weight = fields.weight;
    if (fields.mute !== undefined && fields.mute !== layer.mute) patch.mute = fields.mute;
    if (fields.solo !== undefined && fields.solo !== layer.solo) patch.solo = fields.solo;
    if (fields.locked !== undefined && fields.locked !== (layer.locked === true)) patch.locked = fields.locked;
    if (fields.mode !== undefined && fields.mode !== layer.mode) patch.mode = fields.mode;
    if (fields.name !== undefined && fields.name !== layer.name) patch.name = fields.name;
    if (fields.mask !== undefined && JSON.stringify(fields.mask) !== JSON.stringify(layer.mask ?? null)) {
      patch.mask = fields.mask === null ? null : [...fields.mask];
    }
    if (Object.keys(patch).length > 0) tx.patch('layers', layer.id, patch);
  },
});

// ---------- reorder ----------

/** The layers of `layer`'s clip without the base, and its index among them; null when it is the base. */
function aboveBase(
  app: EditorApp,
  layer: LayerRecord,
): { readonly others: readonly LayerRecord[]; readonly index: number } | null {
  const layers = app.store.query.layersOfClip(layer.clip);
  if (layers[0]?.id === layer.id) return null;
  const others = layers.slice(1);
  return { others, index: others.findIndex((candidate) => candidate.id === layer.id) };
}

function targetIndex(to: unknown, index: number): number | null {
  if (to === 'up') return index + 1;
  if (to === 'down') return index - 1;
  return typeof to === 'number' && Number.isInteger(to) ? to - 1 : null;
}

const layerReorder = defineOperator({
  id: 'layer.reorder',
  label: 'Move Layer',
  description: 'Move an animation layer up or down the stack (the base stays at the bottom).',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true, internal: true },
  undoLabel: () => 'Move Layer',
  poll({ app }, args) {
    const base = pollLayerArg(app, args);
    if (base !== true) return base;
    const place = aboveBase(app, layerOf(app, args) as LayerRecord);
    if (place === null) return fail('The base layer stays at the bottom');
    const to = targetIndex((args as { readonly to?: unknown }).to, place.index);
    if (to === null) return fail("expects { layer, to: 'up' | 'down' | index }");
    if (to < 0) return fail('The layer is already just above the base');
    if (to >= place.others.length) return fail('The layer is already on top');
    return pollEditable(app);
  },
  apply({ app, tx }, args) {
    if (tx === null) throw new EkzaError('internal', 'layer.reorder runs in a transaction');
    const layer = tx.get('layers', args.layer);
    if (layer === undefined) throw new EkzaError('invalid-record', `Layer ${args.layer} does not exist`);
    const all = tx.query.layersOfClip(layer.clip);
    const place = aboveBase(app, layer);
    if (place === null) return;
    const to = targetIndex(args.to, place.index);
    if (to === null || to === place.index) return;
    const rest = all.filter((candidate) => candidate.id !== layer.id);
    // Insert at stack position to + 1 (the base is position 0).
    const before = rest[to] as LayerRecord;
    const after = rest[to + 1];
    tx.patch('layers', layer.id, { order: orderBetweenTwo(before.order, after?.order ?? null) });
  },
});

function orderBetweenTwo(before: string, after: string | null): string {
  return fractionalIndex(before, after);
}

// ---------- remove, duplicate, merge (lazy bodies) ----------

const layerRemove = defineOperator<'layer.remove', LayerBodies>({
  id: 'layer.remove',
  label: 'Delete Animation Layer',
  description: 'Delete an animation layer with its keys (undoable); keys then go to the layer below.',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true, internal: true },
  undoLabel: () => 'Delete Layer',
  poll({ app }, args) {
    const base = pollLayerArg(app, args);
    if (base !== true) return base;
    if (isBaseLayer(app.store, layerOf(app, args) as LayerRecord))
      return fail('The base layer stays — delete the clip instead');
    return pollEditable(app);
  },
  async prepare({ app }, args) {
    const layer = layerOf(app, args);
    if (layer !== null) await app.store.open(`clip:${layer.clip}`);
    return layerBodies();
  },
  apply: (ctx, args, bodies) => bodies.layerRemove(ctx, args),
});

const layerDuplicate = defineOperator<'layer.duplicate', LayerBodies>({
  id: 'layer.duplicate',
  label: 'Duplicate Animation Layer',
  description: 'Copy an animation layer with its curves and keys, just above it.',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true, internal: true },
  undoLabel: () => 'Duplicate Layer',
  poll: ({ app }, args) => all(pollLayerArg(app, args), pollEditable(app)),
  async prepare({ app }, args) {
    const layer = layerOf(app, args);
    if (layer !== null) await app.store.open(`clip:${layer.clip}`);
    return layerBodies();
  },
  apply: (ctx, args, bodies) => bodies.layerDuplicate(ctx, args),
});

/** The layer `layer.merge` merges: the given one, else the active layer of the active clip. */
function mergeSource(app: EditorApp, args: unknown): LayerRecord | string {
  const options = optionalArgs(args);
  if (options === null) return "expects { layer?, scope?: 'down' | 'all', times?: 'keys' | 'frames' }";
  if (options['scope'] !== undefined && options['scope'] !== 'down' && options['scope'] !== 'all') {
    return "scope is 'down' or 'all'";
  }
  if (options['times'] !== undefined && options['times'] !== 'keys' && options['times'] !== 'frames') {
    return "times is 'keys' or 'frames'";
  }
  if (options['layer'] !== undefined) {
    const layer = layerOf(app, options);
    return layer ?? 'The layer does not exist';
  }
  const clip = activeClipRecord(app);
  if (clip === undefined) return 'The character has no active clip';
  return editLayerOf(app, app.store, clip.id) ?? 'The clip has no layers';
}

const layerMerge = defineOperator<'layer.merge', LayerBodies>({
  id: 'layer.merge',
  label: 'Merge Animation Layers',
  description:
    'Bake a layer into the one below it (Merge Down) or every playing layer into the base (Merge All): what plays ' +
    'stays the same, at the keys (or on every frame).',
  category: 'layer',
  scope: GLOBAL_SCOPE,
  flags: { undo: true },
  undoLabel: (args) => (optionalArgs(args)?.['scope'] === 'all' ? 'Merge All Layers' : 'Merge Layer Down'),
  poll({ app }, args) {
    const source = mergeSource(app, args);
    if (typeof source === 'string') return fail(source);
    const scope = (optionalArgs(args)?.['scope'] ?? 'down') as 'down' | 'all';
    const problem = mergeProblem(app, source, scope);
    return problem === null ? pollEditable(app) : fail(problem);
  },
  async prepare({ app }, args) {
    const source = mergeSource(app, args);
    if (typeof source !== 'string') await app.store.open(`clip:${source.clip}`);
    return layerBodies();
  },
  apply: (ctx, args, bodies) => bodies.layerMerge(ctx, args),
});

/** Why a merge cannot run, or null (ANIM-LAYERS-SPEC §4). */
export function mergeProblem(app: EditorApp, source: LayerRecord, scope: 'down' | 'all'): string | null {
  const layers = app.store.query.layersOfClip(source.clip);
  const base = layers[0];
  if (base === undefined) return 'The clip has no layers';
  if (scope === 'all') {
    if (layers.length < 2) return 'There is only the base layer';
    if (base.mute) return 'Base is muted — unmute it to merge into it';
    if (base.locked === true) return 'Base is locked — unlock it to merge into it';
    const playing = layers.slice(1).filter((layer) => !layer.mute && layer.weight > 0);
    if (playing.length === 0) return 'No layer above the base is playing';
    return null;
  }
  const index = layers.findIndex((layer) => layer.id === source.id);
  if (index <= 0) return 'The base layer has nothing below it to merge into';
  const below = layers[index - 1] as LayerRecord;
  if (source.mute) return `${source.name} is muted — a muted layer adds nothing; unmute it or delete it`;
  if (below.mute) return `${below.name} is muted — unmute it to merge into it`;
  if (below.locked === true) return `${below.name} is locked — unlock it to merge into it`;
  if (source.locked === true) return `${source.name} is locked — unlock it to merge it`;
  return null;
}

export const LAYER_OPERATORS: readonly AnyOperator[] = [
  layerAdd,
  layerRemove,
  layerSetActive,
  layerSet,
  layerReorder,
  layerDuplicate,
  layerMerge,
  clipAdjustOnLayer,
];
