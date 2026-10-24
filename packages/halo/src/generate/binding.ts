// *Create with AI*'s binding to the Generate flow (MODELING-PLAN §7.2 G-d; STUDIO-TOUCH-SPEC §3 P12; DECISIONS
// M7-GD-*): the small module the Make stage's sheet (T8, `stages/make/ai/CreateWithAiSheet.tsx`) imports to make its
// placeholder real. It binds editor-core's UI-free flow (`createGenFlow`: the same model and the same operators as
// Studio Pro's Generate panel) to a Halo sheet context — the sheet's `run` (failures become toasts), quiet bookkeeping
// runs, the host's in-memory gateway token — and adds what Halo does next: a finished model is brought in and cleaned
// up in Make (one undo step), a humanoid goes on to Rig (*Rig it for me*), a provider-rigged character to Animate.
// Lazy: only the sheet's chunk imports it (`halo/src/generate` is never on `/app`'s first visit).
import {
  GEN_PRESET_IDS,
  GEN_PRESET_LABELS,
  GEN_TEXT,
  type EditorApp,
  type GenFlow,
  type GenFlowHost,
  type GenFlowState,
  type GenFlowView,
  type GenImportResult,
  type GenPresetId,
  genFlowOf,
  type OperatorResult,
} from '@ekza-studio/editor-core';
import { setGenerationToken } from '@ekza-studio/editor/host';
import { useEffect, useReducer } from 'react';

/** What the binding needs of a Halo sheet context (`HaloSheetContext` satisfies it). */
export interface CreateWithAiContext {
  readonly host: { readonly app: EditorApp };
  run(op: string, args?: unknown): Promise<OperatorResult<unknown>>;
  setStage(stage: 'make' | 'paint' | 'rig' | 'animate'): void;
}

/** The flow host of a Halo sheet: the sheet's funnel, quiet runs through the app, the host's token slot. */
export function haloGenHost(ctx: CreateWithAiContext): GenFlowHost {
  const { app } = ctx.host;
  return {
    app,
    run: (op, args) => ctx.run(op, args),
    quiet: (op, args) => app.runUntyped(op, args),
    setToken: (token) => {
      setGenerationToken(app.services.generation, token);
    },
  };
}

/** Halo's flow on an app (one per app; its inputs survive the sheet closing, the jobs are the app's session). */
export function haloGenFlow(ctx: CreateWithAiContext): GenFlow {
  return genFlowOf(haloGenHost(ctx), 'halo');
}

/** The size choices of the sheet (T8's budget segment uses the same ids). */
export const CREATE_WITH_AI_PRESETS: readonly {
  readonly id: GenPresetId;
  readonly label: string;
  readonly detail: string;
}[] = GEN_PRESET_IDS.map((id) => ({ id, ...GEN_PRESET_LABELS[id] }));

export interface CreateWithAi {
  readonly flow: GenFlow;
  readonly state: GenFlowState;
  readonly view: GenFlowView;
  /** *Create* is on (null) or why not, in plain words. */
  readonly blocked: string | null;
  /** The sheet's *Create*: `gen.submit` with the inputs (spends money after the quote line was shown). */
  create(): Promise<string | null>;
  /**
   * *Bring it in*: `gen.import` with the preset's clean-up, in Make (one undo step); then Halo goes on — a humanoid to
   * Rig, a provider-rigged character to Animate, a prop stays in Make.
   */
  bringIn(job: string): Promise<GenImportResult | null>;
}

/** Brings a finished job in and moves Halo to the stage that comes next (see `CreateWithAi.bringIn`). */
export async function bringInAndContinue(
  ctx: CreateWithAiContext,
  flow: GenFlow,
  job: string,
): Promise<GenImportResult | null> {
  flow.openPost(job);
  const result = await flow.runPost();
  flow.closePost();
  if (result === null) return null;
  if (result.character !== null) ctx.setStage('animate');
  else if (result.rig === 'auto-rig') ctx.setStage('rig');
  else ctx.setStage('make');
  return result;
}

/**
 * The binding as a React hook for the sheet: the flow, its state and view (re-rendered on every change), the
 * availability check on open, *Create* and *Bring it in*.
 */
export function useCreateWithAi(ctx: CreateWithAiContext): CreateWithAi {
  const flow = haloGenFlow(ctx);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => flow.subscribe(bump), [flow]);
  useEffect(() => {
    const status = flow.session.getState().availability.status;
    if (status === 'unknown' || status === 'error') void flow.check();
  }, [flow]);
  const view = flow.view();
  return {
    flow,
    state: flow.getState(),
    view,
    blocked: view.blocked,
    create: () => flow.submit(),
    bringIn: (job) => bringInAndContinue(ctx, flow, job),
  };
}

/** The plain words both shells share (re-exported for the sheet). */
export { GEN_TEXT };
