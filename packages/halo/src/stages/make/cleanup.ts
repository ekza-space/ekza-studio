// Cleaning up an imported or generated model (the owner's AI pipeline, 2026-10-24; MODELING-PLAN §7.2 G-a; T8):
// the Make stage's *Clean up ▾* and the mesh Halo's *Reduce* call the intake operators of package G-a **by id** —
// `mesh.reduce` (an exact triangle target), `mesh.normalize` (+Z forward, metres, origin bottom centre, a height) and
// `mesh.paletteBake` (base colours → swatches) — beside the existing `mesh.cleanup`, `mesh.mergeByDistance` and
// `mesh.separate`. Halo never stubs them: until G-a registers them they show greyed with the reason (*Not in this build
// yet*), and once they are live their own polls, forms and Echo chips apply. The Reduce budgets are the generation
// presets (§7.2 G-d: Prop ≤ 500, Character ≤ 3k, Hero ≤ 10k); the triangle target goes to the operator's integer
// parameter whose name says target, triangles, budget or count (G-a's names are not frozen yet — ST-T8-12).
import type { ParamDef } from '@ekza-studio/anim-core';
import type { EditorApp, OperatorId } from '@ekza-studio/editor-core';

/** G-a's operator ids (MODELING-PLAN §7.2), not in `OperatorMap` until G-a lands. */
export const GA_OPS = {
  reduce: 'mesh.reduce',
  normalize: 'mesh.normalize',
  paletteBake: 'mesh.paletteBake',
} as const;

/** The Reduce budgets (triangles), the generation presets of §7.2 G-d. */
export const REDUCE_BUDGETS = [
  { id: 'prop', triangles: 500 },
  { id: 'character', triangles: 3000 },
  { id: 'hero', triangles: 10_000 },
] as const;

/** The integer parameter of `mesh.reduce` that takes the triangle target, or null (not registered, no such param). */
export function reduceTargetParam(app: EditorApp): string | null {
  const def = app.operators.get(GA_OPS.reduce as OperatorId) as { readonly params?: readonly ParamDef[] } | undefined;
  const params = def?.params ?? [];
  const named = params.find((p) => (p.kind === 'int' || p.kind === 'number') && /target|triangle|budget|count/i.test(p.name));
  return named?.name ?? null;
}

/** The arguments of a Reduce to `triangles` (null: the operator is not live, so the verb stays greyed). */
export function reduceArgs(app: EditorApp, triangles: number): Readonly<Record<string, number>> | null {
  const param = reduceTargetParam(app);
  return param === null ? null : { [param]: triangles };
}

/** True when the operator is registered in this build. */
export const isLive = (app: EditorApp, op: string): boolean => app.operators.get(op as OperatorId) !== undefined;
