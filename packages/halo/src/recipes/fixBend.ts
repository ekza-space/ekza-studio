// *Fix where it bends badly* (STUDIO-TOUCH-SPEC §9 J7, §9.11, §12.4; T9): the break-finder flow of the Rig stage as
// a recipe over the free canvas — **find it** (the Test pose and ▶ *Bend test*: the elbows and knees bend in the test
// pose, never a key, never the document; *Pause here* keeps the pose where it breaks as one test-pose step), **name
// it** (a finger held on the skin: *Who owns this?*, the bones the spot follows with their weights), **paint it** (a
// bone of that list: Skin, that bone as the one painting goes to, the weight brush) and **check it** (▶ *Play again*).
// Every document change is an operator run; the test pose is the rig chunk's own (`beginChannelEditGesture` in Rig &
// Skin answers with a test-pose gesture, C7 §5.17), so nothing here keys or writes the document. React-free: the Rig
// stage's tray and cards drive it, search offers it (`SEARCH_RECIPES`), a test runs it headless.
import type { CharacterId, MeshId } from '@ekza-studio/doc';
import {
  beginChannelEditGesture,
  type ChannelEditGesture,
  type EditorApp,
  type OperatorResult,
  PANEL,
  VIEWPORT_TOOL,
} from '@ekza-studio/editor-core';
import { type BendTarget, bendTargets } from '../stages/rig/model';

/** The four steps of §12.4, for a stepper and the recipe's words. */
export const FIX_BEND_STEPS = ['find', 'name', 'paint', 'check'] as const;
export type FixBendStep = (typeof FIX_BEND_STEPS)[number];

/** One bend: 0 → the deepest bend → 0 (seconds). */
export const BEND_PERIOD_S = 2.4;

/** How deep the bend is at a time (0…1): a smooth swing, `(1 − cos 2πt/T) / 2`. */
export function bendAt(seconds: number, period = BEND_PERIOD_S): number {
  return (1 - Math.cos((2 * Math.PI * seconds) / period)) / 2;
}

/** The channel edits of a bend at depth `s` from the controls' start values. */
export function bendEdits(
  targets: readonly BendTarget[],
  start: ReadonlyMap<string, number>,
  s: number,
): { readonly control: BendTarget['control']; readonly channel: BendTarget['channel']; readonly value: number }[] {
  return targets.map((target) => ({
    control: target.control,
    channel: target.channel,
    value: (start.get(`${target.control}:${target.channel}`) ?? 0) + target.bend * s,
  }));
}

export interface BendTest {
  /** Bending now (false once paused or stopped). */
  readonly playing: boolean;
  /** The depth of the bend shown now (0…1). */
  readonly depth: number;
  /** *Pause here*: the pose stays as one test-pose step (painting is posed on it). */
  pause(): void;
  /** Back to the pose the test started from (no step). */
  stop(): void;
}

/** A clock and a frame scheduler (the browser's by default; a test steps its own). */
export interface BendClock {
  now(): number;
  request(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

function defaultClock(): BendClock | null {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  const caf = (globalThis as { cancelAnimationFrame?: (handle: number) => void }).cancelAnimationFrame;
  if (typeof raf !== 'function' || typeof caf !== 'function') return null;
  return {
    now: () => performance.now(),
    request: (callback) => raf(callback),
    cancel: (handle) => caf(handle as number),
  };
}

/**
 * ▶ *Bend test* (§12.4 step 1): the character's elbows and knees swing through their bend in the test pose, from the
 * pose shown now, until *Pause here* (one test-pose step) or a stop (nothing kept). Null outside Rig & Skin or when
 * the character has no forearm or shin controls.
 */
export function startBendTest(
  app: EditorApp,
  character: CharacterId,
  opts: { readonly clock?: BendClock | null; readonly onFrame?: (depth: number) => void } = {},
): BendTest | null {
  if (app.session.getState().workspace !== 'rig') return null;
  const targets = bendTargets(app, character);
  if (targets.length === 0) return null;
  const start = new Map<string, number>();
  for (const target of targets) {
    start.set(`${target.control}:${target.channel}`, app.evaluation.channelValues(target.control)[target.channel]);
  }
  const gesture: ChannelEditGesture = beginChannelEditGesture(app, 'Test Pose', { key: 'none' });
  const clock = opts.clock === undefined ? defaultClock() : opts.clock;
  const t0 = clock?.now() ?? 0;
  let playing = true;
  let depth = 0;
  let handle: unknown = null;
  const frame = (): void => {
    handle = null;
    if (!playing || !gesture.active) {
      playing = false;
      return;
    }
    depth = bendAt(((clock?.now() ?? t0) - t0) / 1000);
    gesture.update(bendEdits(targets, start, depth));
    opts.onFrame?.(depth);
    if (clock !== null) handle = clock.request(frame);
  };
  frame();
  const halt = (): void => {
    playing = false;
    if (handle !== null) clock?.cancel(handle);
    handle = null;
  };
  return {
    get playing() {
      return playing;
    },
    get depth() {
      return depth;
    },
    pause() {
      if (!playing) return;
      halt();
      gesture.update(bendEdits(targets, start, depth));
      gesture.commit();
    },
    stop() {
      halt();
      if (gesture.active) gesture.cancel();
    },
  };
}

type Run = (op: string, args?: unknown) => Promise<OperatorResult<unknown>>;

/**
 * *Paint it* (§12.4 step 3): Skin, the bone as the one painting goes to (`skin.influence.setActive`), the weight
 * brush. False when a run was refused (its reason is the funnel's to say).
 */
export async function paintBone(run: Run, app: EditorApp, mesh: MeshId, joint: string): Promise<boolean> {
  if (app.session.getState().rig.mode !== 'skin' && (await run('rig.mode', { mode: 'skin' })).status !== 'finished')
    return false;
  if ((await run('skin.influence.setActive', { mesh, joint })).status !== 'finished') return false;
  if (app.session.getState().tools.viewport !== VIEWPORT_TOOL.paintSkinWeights) {
    return (
      (await run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.paintSkinWeights })).status === 'finished'
    );
  }
  return true;
}

/** *Test* (§12.4 step 1): the pose segment's Test view (`rig.pose.view`), when it is not shown already. */
export async function testView(run: Run, app: EditorApp): Promise<boolean> {
  if (app.session.getState().rig.poseView === 'test') return true;
  return (await run('rig.pose.view', { view: 'test' })).status === 'finished';
}
