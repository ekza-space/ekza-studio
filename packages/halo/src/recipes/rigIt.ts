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
// The flow host is Home's (`intake/flowHost.ts`, T11's P-T11-1): one flow state per app, so the subject, the intake
// report and the start pose Home's intake recorded are what the card rigs; the person's runs go through the shell's
// funnel, the flow's bookkeeping runs quietly. Without a live subject (a model made in Make, a project, a page that
// skipped Home) the card takes it from the document as Auto-Rig's *From Studio* does and checks it once
// (`autorig.inspect`).
import type { CharacterId, MeshId } from '@ekza-studio/doc';
import {
  AUTORIG_TARGET_HEIGHT,
  type AutoRigFingers,
  type AutoRigFix,
  applyFix,
  nextFix,
  type AutoRigFlowHost,
  type AutoRigRigPlan,
  type AutoRigRigStage,
  type AutoRigSubject,
  cancelRig,
  chooseFingers,
  DEFAULT_MOTION_CLIP,
  type EditorApp,
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
import { starterSteps } from './addAnimations';

/** The finger detail a destination asks for (§12.2 step 1): OMOBA needs a thumb bone on each hand. */
export const DESTINATION_FINGERS: Readonly<Record<string, AutoRigFingers>> = { omoba: 'thumb' };

/** The motion test's clips in the card (§12.2 step 6): Walk · Sword · Dance. */
export const TEST_CLIPS = [
  { id: 'walk', word: 'walk' },
  { id: 'sword-attack', word: 'sword' },
  { id: 'dance', word: 'dance' },
] as const;

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
  /**
   * The subject came with its own rig (a VRM, a generated humanoid with the provider's rig): nothing to guess; *Use
   * its rig* makes it editable (`char.makeEditable`, M7 G-d's import) and goes straight to the checks.
   */
  | 'imported'
  /** The imported rig is the character's now: the checks follow. */
  | 'checks'
  /** Nothing to rig (no meshes). */
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

/**
 * The subject the document has now (§16.3, Auto-Rig's *From Studio* rule): the selected scene meshes, else every
 * scene mesh, else the active or only character; null when there is nothing to rig.
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
  // a model character (rig it again), or an imported one (its own rig: *Use its rig*)
  const characters = app.store.list('characters').filter((c) => c.deleted === null);
  const active = state.rig.character ?? state.activeCharacter;
  const character = characters.find((c) => c.id === active) ?? (characters.length === 1 ? characters[0] : undefined);
  return character === undefined ? null : { character: character.id, meshes: [] };
}

/**
 * The character of the subject when its rig came with it (an asset character: a VRM, or a generated humanoid with the
 * provider's rig before `char.makeEditable`), else null.
 */
export function importedCharacter(app: EditorApp, host: AutoRigFlowHost): CharacterId | null {
  const character = resolveAutoRigSubject(app.store, host.state.get().subject).character;
  return character !== null && character.source.kind !== 'model' ? character.id : null;
}

const sameSubject = (a: AutoRigSubject, b: AutoRigSubject): boolean =>
  a.character === b.character && a.meshes.length === b.meshes.length && a.meshes.every((id) => b.meshes.includes(id));

/**
 * Checks › *Fix them in order* (§12.1): Auto-Rig ①'s first fixes in its order (stand up → size → freeze → centre →
 * face), each `applyFix` (one `autorig.fix` step, then the report again), as the wizard runs them; a fix that leaves its
 * check failing stops the loop. Returns the fixes run.
 */
export async function fixInOrder(host: AutoRigFlowHost, height?: number): Promise<readonly AutoRigFix[]> {
  const done: AutoRigFix[] = [];
  for (let next = nextFix(host); next !== null; next = nextFix(host)) {
    if (done.includes(next) || done.length >= 5) break;
    done.push(next);
    const outcome = await applyFix(host, next, next === 'scale' ? (height ?? AUTORIG_TARGET_HEIGHT) : undefined);
    if (outcome.status !== 'finished') break;
  }
  return done;
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
  /** `subject`: rig these scene meshes (a part tapped in Make) rather than the flow's subject. */
  open(subject?: AutoRigSubject): Promise<void>;
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
  /** *Use its rig* (an imported or generated rig, `char.makeEditable`), then the checks. */
  useItsRig(): Promise<void>;
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
    async open(subject) {
      await stopMotion();
      const quick = quickRigOf(app);
      set({ ...RIG_IT_CLOSED, phase: 'opening', fingers: fingersOfPreset(quick?.preset) });
      // a part chosen in Make: the card rigs it (its own report: Auto-Rig's *From Studio*)
      if (subject !== undefined && !sameSubject(host.state.get().subject, subject)) {
        await takeHandedSubject(host, subject);
      }
      // the subject: Home's intake set it on this host; else the document's (§16.3 *From Studio*)
      if (!subjectLive(host)) {
        const subject = subjectOfDocument(app);
        if (subject === null) {
          set({ phase: 'none' });
          return;
        }
        await takeHandedSubject(host, subject);
      }
      // a character that came with its own rig (an asset: a VRM, a provider's rig) is not guessed again
      const imported = importedCharacter(app, host);
      if (imported !== null) {
        set({ phase: 'imported', character: imported });
        return;
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
        case 'interrupted':
        case 'failed':
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
      for (const step of starterSteps(character)) {
        const added = await host.run(step.op, step.args);
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
    async useItsRig() {
      const character = state.character;
      if (character === null) return;
      const record = app.store.get('characters', character);
      if (record !== undefined && record.source.kind !== 'model') {
        const made = await host.run('char.makeEditable', { character });
        if (made.status !== 'finished') {
          set({ phase: 'failed', message: made.status === 'cancelled' ? made.reason : made.error.message });
          return;
        }
      }
      host.state.set({ subject: { character, meshes: [] } });
      set({ phase: 'checks' });
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
