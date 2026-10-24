// The *Rig it for me* recipe (STUDIO-TOUCH-SPEC §9 J1, §9.11, §12.2; T9): Halo's Rig-it card over Auto-Rig's own
// orchestration in editor-core (`autorigFlow`, T5b), so Halo and Auto-Rig issue the same operator sequence for the same
// model (AS-ST-5): the card opens Quick Rig on the subject (`openMarkers`: `select.objects` then `skel.quickRig.start`
// with the One-Click guess), its first line asks the destination and the finger detail follows it (OMOBA → Thumb,
// `chooseFingers`), *Rig it* runs `runRig` (`autorig.rig` with the shared argument rules: straighten an A-posed input,
// rigid parts, the rebind confirm) with a story line from its stages, the motion test plays (`startMotionTest`), and
// the next card offers the starter set (`autorig.clip.add` per clip). *Skeleton only* is `skel.quickRig.commit`,
// Cancel `autorig.cancel` while skinning and `skel.quickRig.cancel` before. React-free and string-free: the card
// (`stages/rig/RigCard.tsx`) renders the state; a headless test drives the same functions over a recording host and
// compares the log with Auto-Rig's (`test/rig-journeys.test.ts`).
//
// The flow host is one per app (`haloFlow`): the person's runs (`run`) and the flow's bookkeeping (`quiet`) through
// the shell's funnels; its U state (subject, start pose, parts, painted since bind) in memory, never in the document.
// Home's intake (T11) is meant to run `intakeModel` on the same host, so a model brought in from Home is the card's
// subject with its start pose; without one, the card takes the subject from the document (as Auto-Rig's *From
// Studio* does) and checks it once (`autorig.inspect`).
import type { CharacterId, MeshId } from '@ekza-studio/doc';
import {
  type AutoRigFingers,
  type AutoRigFlowHost,
  type AutoRigFlowRun,
  type AutoRigRigPlan,
  type AutoRigRigStage,
  type AutoRigSubject,
  addLibraryClip,
  autoRigFlowHost,
  cancelRig,
  chooseFingers,
  DEFAULT_MOTION_CLIP,
  type EditorApp,
  memoryAutoRigFlowStore,
  type MotionTest,
  openMarkers,
  quickRigCommitArgs,
  quickRigOf,
  rebindSkin,
  resolveAutoRigSubject,
  runRig,
  startMotionTest,
  takeHandedSubject,
} from '@ekza-studio/editor-core';

/** The finger detail a destination asks for (§12.2 step 1): OMOBA needs a thumb bone on each hand. */
export const DESTINATION_FINGERS: Readonly<Record<string, AutoRigFingers>> = { omoba: 'thumb' };

/** The motion test's clips in the card (§12.2 step 6): Walk · Sword · Dance. */
export const TEST_CLIPS = [
  { id: 'walk', word: 'walk' },
  { id: 'sword-attack', word: 'sword' },
  { id: 'dance', word: 'dance' },
] as const;

/** The starter set (§9 J1 step 5): Idle · Walk · Run from the starter pack. */
export const STARTER_SET: readonly string[] = ['idle', 'walk', 'run'];

export type RigItPhase =
  /** Quick Rig is opening on the subject (the guess runs). */
  | 'opening'
  /** *Dots look right?* — Rig it · Adjust dots · ⋯ */
  | 'dots'
  /** `autorig.rig` runs (the story line). */
  | 'building'
  /** M6b's rebind question: binding again replaces the painted weights. */
  | 'confirm'
  /** The bind was cancelled: the skeleton stays (*Bind again*). */
  | 'cancelled'
  /** Rigged: the motion test plays, the starter set is offered. */
  | 'done'
  /** The starter set is on the character. */
  | 'added'
  /** Something stopped the recipe (the message says what). */
  | 'failed'
  /** Nothing to rig (no meshes; an asset character). */
  | 'none';

export interface RigItState {
  readonly phase: RigItPhase;
  /** The running composition's stage and the bind's fraction (the story line). */
  readonly stage: AutoRigRigStage | null;
  readonly fraction: number | null;
  readonly plan: AutoRigRigPlan | null;
  /** What stopped it, or the rebind question's text. */
  readonly message: string | null;
  readonly character: CharacterId | null;
  readonly fingers: AutoRigFingers;
  /** The motion test's clip and whether it plays (null: off). */
  readonly motion: { readonly clip: string; readonly state: 'playing' | 'unavailable' | 'starting' } | null;
  /** The starter set is being added. */
  readonly adding: boolean;
}

export const RIG_IT_CLOSED: RigItState = {
  phase: 'none',
  stage: null,
  fraction: null,
  plan: null,
  message: null,
  character: null,
  fingers: 'thumb',
  motion: null,
  adding: false,
};

/** The fingers of a Quick Rig preset (Auto-Rig's names, `AUTORIG_FINGER_PRESETS` reversed). */
export function fingersOfPreset(preset: string | null | undefined): AutoRigFingers {
  if (preset === 'core21') return 'mittens';
  if (preset === 'full52') return 'all';
  if (preset === 'lite17') return 'minimal';
  return 'thumb';
}

// ---------- the flow host, one per app ----------

interface HaloFlow {
  readonly host: AutoRigFlowHost;
}

const flows = new WeakMap<EditorApp, HaloFlow>();

/**
 * Halo's Auto-Rig flow host for an app: `run` is the person's run (a surface's run, which says why on a refusal),
 * `quiet` the flow's bookkeeping. The first caller's funnels win; a headless test passes its own (a recording host).
 */
export function haloFlow(
  app: EditorApp,
  funnels: { readonly run?: AutoRigFlowRun; readonly quiet?: AutoRigFlowRun } = {},
): AutoRigFlowHost {
  let flow = flows.get(app);
  if (flow === undefined) {
    flow = { host: autoRigFlowHost(app, memoryAutoRigFlowStore(), funnels) };
    flows.set(app, flow);
  }
  return flow.host;
}

/** Forgets an app's flow host (tests). */
export function dropHaloFlow(app: EditorApp): void {
  flows.delete(app);
}

/**
 * The subject the document has now (§16.3, Auto-Rig's *From Studio* rule): the selected scene meshes, else every
 * scene mesh, else the active or only model character; null when there is nothing to rig.
 */
export function subjectOfDocument(app: EditorApp): AutoRigSubject | null {
  const state = app.session.getState();
  const scene = app.store
    .list('meshes')
    .filter((mesh) => mesh.deleted === null && 'scene' in mesh.owner && mesh.data !== null)
    .map((mesh) => mesh.id);
  const selected = state.selection.objects.filter((id) => scene.includes(id as MeshId)) as MeshId[];
  if (selected.length > 0) return { character: null, meshes: selected };
  if (scene.length > 0) return { character: null, meshes: scene };
  const characters = app.store.list('characters').filter((c) => c.deleted === null && c.source.kind === 'model');
  const active = state.rig.character ?? state.activeCharacter;
  const character = characters.find((c) => c.id === active) ?? (characters.length === 1 ? characters[0] : undefined);
  return character === undefined ? null : { character: character.id, meshes: [] };
}

/** Whether the flow's subject still stands for something in the document. */
function subjectLive(host: AutoRigFlowHost): boolean {
  const subject = host.state.get().subject;
  const resolved = resolveAutoRigSubject(host.app.store, subject);
  return resolved.character !== null || resolved.meshes.length > 0;
}

// ---------- the recipe ----------

export interface RigIt {
  get(): RigItState;
  subscribe(listener: () => void): () => void;
  readonly host: AutoRigFlowHost;
  /** Opens the card: the subject, then Quick Rig with the guess (§12.2 step 2). */
  open(): Promise<void>;
  /** The card's first line (§7.3): the destination; the finger detail follows it. */
  destination(id: string): Promise<void>;
  /** The finger chip: Mittens · Thumb · All fingers. */
  fingers(fingers: AutoRigFingers): Promise<void>;
  /** *Rig it* (§12.2 step 4); `confirm` answers the rebind question. */
  rig(confirm?: boolean): Promise<void>;
  /** *Skeleton only* (the card's ⋯): Pro's Create Skeleton, no bind. */
  skeletonOnly(): Promise<void>;
  /** *Bind again* after a cancelled bind. */
  bindAgain(): Promise<void>;
  /** Cancel: the bind while skinning, else Quick Rig. */
  cancel(): Promise<void>;
  /** *Test with*: the motion test's clip. */
  testWith(clip: string): void;
  /** *Starter set: Idle · Walk · Run* (§9 J1 step 5). */
  starterSet(): Promise<void>;
  /** Closes the card (the motion test stops; Quick Rig stays open while the card is at its dots). */
  close(): Promise<void>;
  /** Stops the motion test (leaving the stage). */
  stopMotion(): Promise<void>;
  dispose(): void;
}

export interface RigItDeps {
  readonly app: EditorApp;
  readonly host: AutoRigFlowHost;
  /** The destination the card's first line set (the shell's session state). */
  readonly setDestination?: (id: string) => void;
  /** The motion test plays when rigging finished (false in headless journeys that drive it themselves). */
  readonly motionTest?: boolean;
}

export function createRigIt(deps: RigItDeps): RigIt {
  const { app, host } = deps;
  let state: RigItState = RIG_IT_CLOSED;
  const listeners = new Set<() => void>();
  let motion: MotionTest | null = null;
  let disposed = false;
  const set = (patch: Partial<RigItState>): void => {
    state = { ...state, ...patch };
    for (const listener of Array.from(listeners)) listener();
  };

  const stopMotion = async (): Promise<void> => {
    const running = motion;
    motion = null;
    if (state.motion !== null) set({ motion: null });
    await running?.stop();
  };

  const playMotion = (clip: string): void => {
    const character = state.character;
    if (character === null || deps.motionTest === false) return;
    const previous = motion;
    motion = null;
    void (async () => {
      await previous?.stop();
      if (disposed) return;
      set({ motion: { clip, state: 'starting' } });
      motion = startMotionTest(host, character, clip, (report) => {
        if (state.motion?.clip !== clip) return;
        set({ motion: { clip, state: report === null ? 'playing' : 'unavailable' } });
      });
    })();
  };

  const finished = (character: CharacterId, plan: AutoRigRigPlan): void => {
    set({ phase: 'done', stage: null, fraction: null, plan, character, message: null });
    playMotion(state.motion?.clip ?? DEFAULT_MOTION_CLIP);
  };

  const recipe: RigIt = {
    host,
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async open() {
      await stopMotion();
      const quick = quickRigOf(app);
      set({ ...RIG_IT_CLOSED, phase: 'opening', fingers: fingersOfPreset(quick?.preset) });
      // the subject: Home's intake set it on this host; else the document's (§16.3 *From Studio*)
      if (!subjectLive(host)) {
        const subject = subjectOfDocument(app);
        if (subject === null) {
          set({ phase: 'none' });
          return;
        }
        await takeHandedSubject(host, subject);
      }
      const opened = await openMarkers(host);
      if (opened.status === 'none') {
        set({ phase: 'none' });
        return;
      }
      if (opened.status === 'failed') {
        set({ phase: 'failed', message: opened.reason });
        return;
      }
      set({ phase: 'dots', fingers: fingersOfPreset(quickRigOf(app)?.preset) });
    },
    async destination(id) {
      deps.setDestination?.(id);
      const wanted = DESTINATION_FINGERS[id];
      if (wanted !== undefined && state.fingers !== wanted) await recipe.fingers(wanted);
    },
    async fingers(fingers) {
      if (await chooseFingers(host, fingers)) set({ fingers });
      else set({ fingers: fingersOfPreset(quickRigOf(app)?.preset) });
    },
    async rig(confirm = false) {
      if (quickRigOf(app) === null) return;
      set({ phase: 'building', stage: 'skeleton', fraction: null, message: null });
      const outcome = await runRig(host, {
        ...(confirm ? { confirm: true } : {}),
        onPlan: (plan) => set({ plan }),
        onStage: (stage, fraction) => set({ stage, fraction }),
      });
      switch (outcome.status) {
        case 'finished':
          finished(outcome.character, outcome.plan);
          return;
        case 'confirm-required':
          set({ phase: 'confirm', stage: null, message: outcome.message, plan: outcome.plan });
          return;
        case 'cancelled':
          set({ phase: 'cancelled', stage: null, fraction: null, plan: outcome.plan });
          return;
        case 'skipped':
          set({ phase: 'dots', stage: null });
          return;
        default:
          set({ phase: 'failed', stage: null, fraction: null, message: outcome.message, plan: outcome.plan });
      }
    },
    async skeletonOnly() {
      const quick = quickRigOf(app);
      if (quick === null) return;
      const result = await host.run('skel.quickRig.commit', quickRigCommitArgs(quick));
      if (result.status !== 'finished') {
        set({ phase: 'failed', message: result.status === 'cancelled' ? result.reason : result.error.message });
        return;
      }
      const value = result.value as { readonly character: CharacterId };
      host.state.set({ subject: { character: value.character, meshes: host.state.get().subject.meshes } });
      set({ phase: 'added', character: value.character, stage: null });
    },
    async bindAgain() {
      set({ phase: 'building', stage: 'skin', fraction: null, message: null });
      const outcome = await rebindSkin(host, {
        confirm: false,
        straighten: host.state.get().startPose?.kind === 'a',
        onStage: (stage, fraction) => set({ stage, fraction }),
      });
      if (outcome.status === 'finished') {
        const character = resolveAutoRigSubject(app.store, host.state.get().subject).character?.id ?? null;
        if (character !== null) finished(character, state.plan ?? { bind: true, straighten: false });
        else set({ phase: 'failed', message: null });
        return;
      }
      if (outcome.status === 'cancelled') set({ phase: 'cancelled', stage: null });
      else if (outcome.status === 'failed') set({ phase: 'failed', stage: null, message: outcome.message });
      else set({ phase: 'none', stage: null });
    },
    async cancel() {
      if (state.phase === 'building') {
        cancelRig(host);
        return;
      }
      await stopMotion();
      if (quickRigOf(app) !== null) await host.quiet('skel.quickRig.cancel');
      set({ ...RIG_IT_CLOSED });
    },
    testWith(clip) {
      playMotion(clip);
    },
    async starterSet() {
      const character = state.character;
      if (character === null || state.adding) return;
      await stopMotion();
      set({ adding: true });
      for (const clip of STARTER_SET) {
        const added = await addLibraryClip(host, character, clip);
        if (added.status !== 'finished') {
          set({
            adding: false,
            phase: 'failed',
            message: added.status === 'cancelled' ? added.reason : added.error.message,
          });
          return;
        }
      }
      set({ adding: false, phase: 'added' });
    },
    async close() {
      await stopMotion();
      set({ ...RIG_IT_CLOSED });
    },
    stopMotion,
    dispose() {
      disposed = true;
      void stopMotion();
      listeners.clear();
    },
  };
  return recipe;
}
