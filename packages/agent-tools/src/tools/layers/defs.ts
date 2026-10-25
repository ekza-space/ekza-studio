// Layer tools (ANIM-LAYERS-SPEC §4, ADR 0026): add, set and merge animation layers of a clip.
import { z } from 'zod';
import { confirmFlag, scoped, writes } from '../../schemas/common';
import { BUDGETS, defineTool } from '../define';
import {
  layerAdd as layerAddRun,
  layerMergeConfirm,
  layerMerge as layerMergeRun,
  layerSet as layerSetRun,
} from './run';

const layerName = z
  .string()
  .regex(/^[A-Za-z0-9 _.-]{1,64}$/)
  .describe('Layer name: 1…64 characters of letters, digits, space, _ . - (unique in the clip)');
const layerOut = z.object({
  name: z.string(),
  mode: z.enum(['base', 'additive', 'override']),
  weight: z.number(),
  muted: z.boolean(),
  solo: z.boolean(),
  locked: z.boolean(),
  playing: z.boolean(),
  curves: z.number(),
});

export const layerAdd = defineTool({
  name: 'layer_add',
  title: 'Add an animation layer',
  description:
    'Add an animation layer on top of a clip: additive (default; its curves add to what is below — a fix such as ' +
    '+10° on a joint) or override (it replaces what is below by its weight). weight is 0…1 (default 1). The base ' +
    'stays as it is. Agent key and pose tools write the base layer; the user keys into the layer they chose.',
  group: 'clip',
  input: z.strictObject({
    ...scoped,
    ...writes,
    name: layerName.optional().describe('Name (default "Layer 1", "Layer 2"…).'),
    mode: z.enum(['additive', 'override']).default('additive').describe('additive (default) or override.'),
    weight: z.number().min(0).max(1).default(1).describe('Weight 0…1 (default 1).'),
  }),
  output: z.object({ layer: z.string(), layers: z.array(layerOut) }),
  annotations: { readOnly: false, destructive: false, idempotent: false },
  access: 'edit',
  hosts: ['live', 'headless'],
  alwaysLoad: false,
  stretch: false,
  kind: 'edit',
  budget: BUDGETS.write,
  example: { clip: 'walk', name: 'Fixes' },
  ready: true,
  run: (ctx, args) => layerAddRun(ctx, args) as never,
});

export const layerSet = defineTool({
  name: 'layer_set',
  title: 'Change an animation layer',
  description:
    'Change a layer of a clip by name: weight (0…1), mute, solo, lock, name, or move it up or down the stack. The ' +
    'base layer takes only mute, solo and lock. Returns the stack (base first) with what plays.',
  group: 'clip',
  input: z
    .strictObject({
      ...scoped,
      ...writes,
      layer: z.string().min(1).max(200).describe('The layer (name or id).'),
      weight: z.number().min(0).max(1).optional().describe('Weight 0…1.'),
      mute: z.boolean().optional().describe('Mute: the layer stops playing.'),
      solo: z.boolean().optional().describe('Solo: only soloed layers (and the base) play.'),
      lock: z.boolean().optional().describe('Lock: no edit changes its keys.'),
      name: layerName.optional().describe('New name.'),
      move: z.enum(['up', 'down']).optional().describe('Move one place up or down (the base stays at the bottom).'),
    })
    .refine(
      (value) =>
        ['weight', 'mute', 'solo', 'lock', 'name', 'move'].some((field) => value[field as 'weight'] !== undefined),
      'pass weight, mute, solo, lock, name or move',
    ),
  output: z.object({ layers: z.array(layerOut) }),
  annotations: { readOnly: false, destructive: true, idempotent: false },
  access: 'edit',
  hosts: ['live', 'headless'],
  alwaysLoad: false,
  stretch: false,
  kind: 'edit',
  budget: BUDGETS.write,
  example: { clip: 'walk', layer: 'Fixes', weight: 0.5 },
  ready: true,
  run: (ctx, args) => layerSetRun(ctx, args) as never,
});

export const layerMerge = defineTool({
  name: 'layer_merge',
  title: 'Merge animation layers',
  description:
    'Bake layers so that what plays stays the same: scope down (default) merges a layer (default the top one) ' +
    'into the layer below it; scope all merges every playing layer into the base (the editor asks the user; ' +
    'headless pass confirm: true). times keys (default) writes at the merged curves’ key times; frames on every ' +
    'frame (exact on every frame). The merged layers are removed (undoable).',
  group: 'clip',
  input: z.strictObject({
    ...scoped,
    ...writes,
    layer: z.string().min(1).max(200).optional().describe('The layer to merge down (default the top one).'),
    scope: z.enum(['down', 'all']).default('down').describe('down (default) or all.'),
    times: z.enum(['keys', 'frames']).default('keys').describe('keys (default) or frames.'),
    confirm: confirmFlag,
  }),
  output: z.object({ into: z.string(), keys: z.number(), layers: z.array(layerOut) }),
  annotations: { readOnly: false, destructive: true, idempotent: false },
  access: 'edit',
  hosts: ['live', 'headless'],
  alwaysLoad: false,
  stretch: false,
  kind: 'edit',
  budget: BUDGETS.write,
  example: { clip: 'walk', layer: 'Fixes' },
  ready: true,
  confirm: (ctx, args) => layerMergeConfirm(ctx, args),
  run: (ctx, args) => layerMergeRun(ctx, args) as never,
});
