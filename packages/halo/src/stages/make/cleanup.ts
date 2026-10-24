// Cleaning up an imported or generated model (the owner's AI pipeline, 2026-10-24; MODELING-PLAN §7.2 G-a; T8): the
// Make stage's *Clean up ▾* and the mesh Halo's *Reduce ▾* call the intake operators of package G-a **by id**, with
// G-a's final contract (DECISIONS M7-GA-CONTRACT-1…6): `mesh.intake {preset = 'character', height = null,
// colours = 16, meshes?}` (normalize → reduce → quadrangulate → palette bake, one undo step), `mesh.reduce {preset,
// triangles = null, meshes?}` (null: the preset's 500 / 3,000 / 10,000), `mesh.normalize {height = null, meshes?}`,
// `mesh.paletteBake {colours = 16, meshes?}` and `mesh.textureDownsize {size = 1024, meshes?}`; without `meshes` they
// act on the selected mesh objects — beside the existing `mesh.cleanup`, `mesh.mergeByDistance` and `mesh.separate`. Halo never stubs them: until G-a registers them they show greyed with the reason (*Not in this build
// yet*); once they are live their own polls apply (ST-T8-12).
import type { EditorApp, OperatorId } from '@ekza-studio/editor-core';

/** G-a's operator ids (MODELING-PLAN §7.2), not in `OperatorMap` until G-a lands. */
export const GA_OPS = {
  intake: 'mesh.intake',
  reduce: 'mesh.reduce',
  normalize: 'mesh.normalize',
  paletteBake: 'mesh.paletteBake',
  textureDownsize: 'mesh.textureDownsize',
} as const;

export type BudgetPreset = 'prop' | 'character' | 'hero';

/** The budgets (triangles): the generation presets of §7.2 G-d, G-a's `preset` values. */
export const REDUCE_BUDGETS: readonly { readonly id: BudgetPreset; readonly triangles: number }[] = [
  { id: 'prop', triangles: 500 },
  { id: 'character', triangles: 3000 },
  { id: 'hero', triangles: 10_000 },
];

/** The default budget (a character, §7.2 G-d). */
export const CHARACTER_BUDGET = { id: 'character', triangles: 3000 } as const;

/** `mesh.reduce`'s arguments for a budget (`triangles` left to the preset). */
export const reduceArgs = (budget: { readonly id: BudgetPreset }) => ({ preset: budget.id }) as const;

/** `mesh.intake`'s arguments for a budget (height and colours: G-a's defaults). */
export const intakeArgs = (budget: { readonly id: BudgetPreset }) => ({ preset: budget.id }) as const;

/** `mesh.normalize` keeping the model's own size (stand up, metres, origin at the bottom centre). */
export const NORMALIZE_ARGS = { height: null } as const;
/** `mesh.paletteBake` into the default 16 swatches. */
export const PALETTE_BAKE_ARGS = { colours: 16 } as const;
/** `mesh.textureDownsize` to 1,024 px. */
export const TEXTURE_ARGS = { size: 1024 } as const;

/** True when the operator is registered in this build. */
export const isLive = (app: EditorApp, op: string): boolean => app.operators.get(op as OperatorId) !== undefined;
