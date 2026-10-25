// The Thread's ◆ Key, as data (STUDIO-TOUCH-SPEC §10.2, §10.3; ST-KEY-1 … ST-KEY-6, owner 2026-10-25: "an explicit Key
// button beside Rec"): what a tap keys — `key.set` on the selected controls at the playhead, every channel, one undo
// step, with Rec on or off (Rec keys what you change; ◆ Key keys the selection now) — and what its long-press offers:
// *All channels*, *Only changed channels* (`key.set {channels: 'changed'}`) and, while channels are selected in Numbers
// or Keys, *Selected channels*. Whether the button is greyed and why, whether the playhead sits on a key of the
// selection (the diamond is filled), and the toast a key says. Pure over editor-core's queries.
import type { Fps, Frame } from '@ekza-studio/anim-core';
import type { ControlId } from '@ekza-studio/doc';
import { type EditorApp, type KeyChannels, PANEL } from '@ekza-studio/editor-core';
import { animateWords } from '../../i18n/animate';
import { PANE } from '../../shell/stage';
import type { TimeUnit } from '../units';
import { currentFrame, keyDots, keyTargets, threadContext, timeText } from './model';

const w = animateWords.thread;

/** The long-press choices; a tap is *All channels*. */
export type KeyChoice = 'all' | 'changed' | 'selected';

export const KEY_CHOICES: readonly KeyChoice[] = ['all', 'changed', 'selected'];

export const KEY_CHOICE_LABEL: Readonly<Record<KeyChoice, string>> = {
  all: w.keyAll,
  changed: w.keyChanged,
  selected: w.keySelected,
};

export interface KeyCall {
  readonly op: 'key.set';
  readonly args: { readonly channels: KeyChannels; readonly target: 'selected' };
}

/** The run of a choice: always the selected controls (the button keys what is selected, ST-KEY-2). */
export function keyCall(choice: KeyChoice = 'all'): KeyCall {
  return { op: 'key.set', args: { channels: choice, target: 'selected' } };
}

export interface KeyButtonState {
  /** The selected controls of the animated character (what a tap keys). */
  readonly controls: readonly ControlId[];
  /** Greyed with this reason; null when a tap keys. */
  readonly reason: string | null;
  /** The playhead sits on a key of the selection: the diamond is filled. */
  readonly onKey: boolean;
  /** What a tap keys, in words: the part's name, or "3 parts". */
  readonly subject: string;
  /** The playhead in the animation's frames (a whole frame). */
  readonly frame: Frame;
  readonly fps: Fps;
  /** Channels are selected (Numbers, Keys): the long-press offers *Selected channels*. */
  readonly channels: boolean;
}

/** The poll reason of a call in the single pane (null: it may run). */
export function keyPollReason(app: EditorApp, call: KeyCall): string | null {
  if (app.operators.get(call.op) === undefined) return null;
  try {
    const verdict = app.operators.poll(call.op, { panel: PANEL.viewport, paneId: PANE }, call.args);
    return verdict === true ? null : verdict.reason;
  } catch {
    return null;
  }
}

/** The button now: greyed without a selection ("Select a body part to key"), else by `key.set`'s own poll. */
export function keyButtonState(app: EditorApp): KeyButtonState {
  const thread = threadContext(app);
  const fps = thread?.fps ?? { num: 30, den: 1 };
  const frame = Math.round(currentFrame(app, thread));
  const channels = app.session.getState().selection.channels.length > 0;
  if (thread === null) {
    // no animation to key into: the selection first, then `key.set`'s own reason
    const none = app.session.getState().selection.controls.length === 0;
    const reason = none ? w.keySelectFirst : (keyPollReason(app, keyCall('all')) ?? w.keySelectFirst);
    return { controls: [], reason, onKey: false, subject: '', frame, fps, channels };
  }
  const targets = keyTargets(app, thread);
  const controls = targets.faint ? [] : [...targets.controls];
  if (controls.length === 0) {
    return { controls, reason: w.keySelectFirst, onKey: false, subject: '', frame, fps, channels };
  }
  const first = controls[0] as ControlId;
  const subject = controls.length > 1 ? w.keyParts(controls.length) : (app.store.get('controls', first)?.name ?? first);
  const { dots } = keyDots(app, thread);
  const onKey = dots.some((dot) => Math.abs(dot.frame - frame) < 0.5);
  return { controls, reason: keyPollReason(app, keyCall('all')), onKey, subject, frame, fps, channels };
}

/** The choices of the long-press, each with its poll reason (*Selected channels* only while channels are selected). */
export function keyChoices(
  app: EditorApp,
  state: KeyButtonState,
): readonly { readonly choice: KeyChoice; readonly label: string; readonly reason: string | null }[] {
  return KEY_CHOICES.filter((choice) => choice !== 'selected' || state.channels).map((choice) => ({
    choice,
    label: KEY_CHOICE_LABEL[choice],
    reason: state.controls.length === 0 ? w.keySelectFirst : keyPollReason(app, keyCall(choice)),
  }));
}

/** "frame 24" (Settings › Time *Frames*, the default) or "0.80 s" (*Seconds*). */
export function keyWhen(frame: Frame, fps: Fps, units: TimeUnit): string {
  return units === 'frames' ? w.keyFrame(Math.round(frame)) : timeText(frame, fps, units);
}

/** The toast after a key: "Keyed L Upper Arm · frame 24". */
export function keyedText(state: KeyButtonState, choice: KeyChoice, units: TimeUnit): string {
  const when = keyWhen(state.frame, state.fps, units);
  if (choice === 'changed') return w.keyedChanged(state.subject, when);
  if (choice === 'selected') return w.keyedSelected(state.subject, when);
  return w.keyed(state.subject, when);
}
