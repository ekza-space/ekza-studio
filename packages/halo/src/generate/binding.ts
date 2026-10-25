// *Create with AI*'s binding to the Generate flow (MODELING-PLAN §7.2 G-d; STUDIO-TOUCH-SPEC §3 P12; DECISIONS
// M7-GD-*): the small module the Make stage's sheet (`stages/make/ai/CreateWithAiSheet.tsx`) imports. It binds
// editor-core's UI-free flow (`createGenFlow`: the same model and the same operators as Studio Pro's Generate panel) to
// a Halo sheet context — the sheet's `run` (failures become toasts), quiet bookkeeping runs, the host's in-memory
// gateway token — and adds what Halo does next: a finished model is brought in and cleaned up in Make (one undo step);
// *Rig it* hands the cleaned meshes to Auto-Rig's flow (the subject the Rig-it card rigs, `intake/flowHost`) and opens
// the Rig-it card on them, closing the sheet (T12, P-T9-1); a provider-rigged character goes to Animate. Lazy: only the
// sheet's chunk imports it.
import {
  type EditorApp,
  GEN_PRESET_IDS,
  GEN_PRESET_LABELS,
  GEN_TEXT,
  type GenAvailability,
  type GenFlow,
  type GenFlowHost,
  type GenFlowState,
  type GenFlowView,
  type GenImportResult,
  type GenPresetId,
  genFlowOf,
  type OperatorResult,
  takeHandedSubject,
} from '@ekza-studio/editor-core';
import { setGenerationToken } from '@ekza-studio/editor/host';
import { useEffect, useReducer } from 'react';
import { haloFlowHost } from '../intake/flowHost';
import { rigOpenersOf } from '../stages/rig/openers';

/** What the binding needs of a Halo sheet context (`HaloSheetContext` satisfies it). */
export interface CreateWithAiContext {
  readonly host: { readonly app: EditorApp };
  run(op: string, args?: unknown): Promise<OperatorResult<unknown>>;
  setStage(stage: 'make' | 'paint' | 'rig' | 'animate'): void;
}

/** The latest sheet context per app: the cached flow runs through the sheet that is open now. */
const latest = new WeakMap<EditorApp, CreateWithAiContext>();

/** The flow host of a Halo sheet: the sheet's funnel, quiet runs through the app, the host's token slot. */
export function haloGenHost(ctx: CreateWithAiContext): GenFlowHost {
  const { app } = ctx.host;
  latest.set(app, ctx);
  return {
    app,
    run: (op, args) => (latest.get(app) ?? ctx).run(op, args),
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

/** The size choices of the sheet (the clean-up budgets of Make use the same ids). */
export const CREATE_WITH_AI_PRESETS: readonly {
  readonly id: GenPresetId;
  readonly label: string;
  readonly detail: string;
}[] = GEN_PRESET_IDS.map((id) => ({ id, ...GEN_PRESET_LABELS[id] }));

/** The sheet's status words for the flow's availability (T8's `data-state` names, ST-T8-18). */
export type CreateWithAiStatus = 'checking' | 'hidden' | 'offline' | 'token' | 'ready';

export function statusOf(availability: GenAvailability): CreateWithAiStatus {
  switch (availability.status) {
    case 'ready':
      return 'ready';
    case 'needs-token':
      return 'token';
    case 'unavailable':
    case 'off':
      return 'hidden';
    case 'unknown':
    case 'checking':
      return 'checking';
    case 'error':
      return 'offline';
  }
}

/**
 * *Bring it in*: `gen.import` with the job's preset (the clean-up, one undo step); the result stays on the sheet (its
 * budgets, the badge, what comes next). A provider-rigged character goes to Animate; a model stays in Make.
 */
export async function bringIn(ctx: CreateWithAiContext, flow: GenFlow, job: string): Promise<GenImportResult | null> {
  if (flow.getState().post?.job !== job) flow.openPost(job);
  const result = await flow.runPost();
  if (result === null) return null;
  ctx.setStage(result.character !== null ? 'animate' : 'make');
  return result;
}

/**
 * *Rig it*: the cleaned meshes become Auto-Rig's subject (the hand-over Studio Pro's Auto-Rig switch makes) and the
 * mounted Rig stage opens its Rig-it card on them, which closes the sheet (T12, P-T9-1: one touch, not two). Without
 * a mounted Rig stage (a harness) Halo only goes to Rig. False when there is nothing to rig.
 */
export async function rigIt(ctx: CreateWithAiContext, result: GenImportResult): Promise<boolean> {
  const { app } = ctx.host;
  const meshes = result.meshes.filter((mesh) => app.store.get('meshes', mesh) !== undefined);
  if (meshes.length === 0) return false;
  await app.runUntyped('select.objects', { ids: meshes, mode: 'replace' });
  await takeHandedSubject(haloFlowHost({ app, run: (op, args) => ctx.run(op, args) }), {
    character: null,
    meshes,
  });
  const open = rigOpenersOf(app);
  if (open === undefined) ctx.setStage('rig');
  else await open.rigIt();
  return true;
}

export interface CreateWithAi {
  readonly flow: GenFlow;
  readonly state: GenFlowState;
  readonly view: GenFlowView;
  readonly status: CreateWithAiStatus;
  /** *Create* is on (null) or why not, in plain words. */
  readonly blocked: string | null;
  /** The sheet's *Create*: `gen.submit` with the inputs (spends money after the price line was shown). */
  create(): Promise<string | null>;
  bringIn(job: string): Promise<GenImportResult | null>;
  rigIt(result: GenImportResult): Promise<boolean>;
}

/**
 * The binding as a React hook for the sheet: the flow, its state and view (re-rendered on every change), the
 * availability check on open, *Create*, *Bring it in* and *Rig it*.
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
    status: statusOf(view.availability),
    blocked: view.blocked,
    create: () => flow.submit(),
    bringIn: (job) => bringIn(ctx, flow, job),
    rigIt: (result) => rigIt(ctx, result),
  };
}

/** The plain words both shells share (re-exported for the sheet). */
export { GEN_TEXT };
