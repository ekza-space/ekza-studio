// What the selection-driven operators act on (Graph Editor, time slider, keying, pose tools).
//
// - Keys: `selection.keys` entries whose key still exists (key parts and handle parts).
// - Curves (§4.9 graph rows, WP-6 request): the curves of the selected keys; else the curves of the selected channels;
//   else the curves of the selected controls; else every curve of the active clip — what the Graph Editor shows.
//   Always the active clip's edit layer (ANIM-LAYERS: the session's active layer, else the base).
// - Controls: the selected ones; keying the character and selecting all use its visible controls.
import type {
  ChannelId,
  CharacterId,
  ClipRecord,
  ControlId,
  ControlRecord,
  CurveId,
  CurveRecord,
  KeyId,
  KeyRecord,
  LayerId,
  ReadView,
} from '@ekza-studio/doc';
import { editLayerOf } from '../edit/layers';
import { activeClipOf } from '../evaluation/time';
import type { BodyPart, EditorApp, KeyPartSelection, KeyTarget, SessionState } from '../types';
import { bodyPartIn } from './bodyParts';

export interface SelectedKey {
  readonly key: KeyRecord;
  readonly parts: KeyPartSelection;
}

/** Selected keys that still exist, in selection order. */
export function selectedKeys(app: EditorApp, view: ReadView = app.store): readonly SelectedKey[] {
  const out: SelectedKey[] = [];
  for (const [id, parts] of app.session.getState().selection.keys) {
    const key = view.get('keys', id);
    if (key !== undefined && (parts.key || parts.in || parts.out)) out.push({ key, parts });
  }
  return out;
}

/** Ids of the selected keys whose key part is selected (moving, deleting, copying act on these). */
export function selectedKeyIds(app: EditorApp, view: ReadView = app.store): readonly KeyId[] {
  return selectedKeys(app, view)
    .filter((s) => s.parts.key)
    .map((s) => s.key.id);
}

/** The active character's active clip. */
export function activeClipRecord(app: EditorApp, view: ReadView = app.store): ClipRecord | undefined {
  const state = app.session.getState();
  return state.activeCharacter === null ? undefined : activeClipOf(view, state, state.activeCharacter);
}

/** Controls of a character's rig, parents first. */
export function controlsOfCharacter(view: ReadView, character: CharacterId): readonly ControlRecord[] {
  const rig = view.query.rigOfCharacter(character);
  return rig === undefined ? [] : view.query.controlsOfRig(rig.id);
}

/** Shown in the viewport and outliner: not hidden by the user, secondary controls only when shown. */
export function isControlVisible(state: SessionState, control: ControlRecord): boolean {
  if (state.hiddenControls.has(control.id)) return false;
  return state.showSecondary || !control.hiddenByDefault;
}

/** Visible controls of the active character. */
export function visibleControls(app: EditorApp, view: ReadView = app.store): readonly ControlRecord[] {
  const state = app.session.getState();
  if (state.activeCharacter === null) return [];
  return controlsOfCharacter(view, state.activeCharacter).filter((control) => isControlVisible(state, control));
}

/** Selected controls that exist, in selection order (lead last). */
export function selectedControls(app: EditorApp, view: ReadView = app.store): readonly ControlRecord[] {
  const out: ControlRecord[] = [];
  for (const id of app.session.getState().selection.controls) {
    const control = view.get('controls', id);
    if (control !== undefined) out.push(control);
  }
  return out;
}

/** Curves of one layer of a clip (the base unless `layer` is given), optionally limited to some controls. */
export function baseCurves(
  view: ReadView,
  clip: ClipRecord,
  controls?: ReadonlySet<ControlId>,
  layer?: LayerId,
): readonly CurveRecord[] {
  const target = layer ?? view.query.baseLayer(clip.id)?.id;
  if (target === undefined) return [];
  return view.query
    .curvesOfClip(clip.id)
    .filter((curve) => curve.layer === target && (controls === undefined || controls.has(curve.control)));
}

/** ANIM-LAYERS: the id of the layer the person edits in `clip` (the session's active layer, else the base). */
export function editLayerIdOf(app: EditorApp, view: ReadView, clip: ClipRecord): LayerId | undefined {
  return editLayerOf(app, view, clip.id)?.id;
}

/** The edit layer's curves of a clip (what the Dope Sheet and Graph Editor show), optionally of some controls. */
export function editCurves(
  app: EditorApp,
  view: ReadView,
  clip: ClipRecord,
  controls?: ReadonlySet<ControlId>,
): readonly CurveRecord[] {
  return baseCurves(view, clip, controls, editLayerIdOf(app, view, clip));
}

/** Curves the curve-level Graph Editor operators act on (see the header). */
export function targetCurves(app: EditorApp, view: ReadView = app.store): readonly CurveRecord[] {
  const keys = selectedKeys(app, view);
  if (keys.length > 0) {
    const seen = new Set<CurveId>();
    const curves: CurveRecord[] = [];
    for (const { key } of keys) {
      if (seen.has(key.curve)) continue;
      seen.add(key.curve);
      const curve = view.get('curves', key.curve);
      if (curve !== undefined) curves.push(curve);
    }
    return curves;
  }
  const clip = activeClipRecord(app, view);
  if (clip === undefined) return [];
  const layer = editLayerIdOf(app, view, clip);
  const channels = app.session.getState().selection.channels;
  if (channels.length > 0) {
    const wanted = new Set(channels.map((ref) => `${ref.control}\u0000${ref.channel}`));
    return baseCurves(view, clip, undefined, layer).filter((curve) =>
      wanted.has(`${curve.control}\u0000${curve.channel}`),
    );
  }
  const selected = selectedControls(app, view);
  if (selected.length > 0) return baseCurves(view, clip, new Set(selected.map((control) => control.id)), layer);
  return baseCurves(view, clip, undefined, layer);
}

/** Every key of the given curves. */
export function keysOfCurves(view: ReadView, curves: readonly CurveRecord[]): readonly KeyId[] {
  return curves.flatMap((curve) => view.query.keysOfCurve(curve.id).map((key) => key.id));
}

/** Sorted unique key times of the given controls' curves on one layer of a clip (base unless `layer`; all controls when null). */
export function keyTimes(
  view: ReadView,
  clip: ClipRecord,
  controls: ReadonlySet<ControlId> | null,
  layer?: LayerId,
): readonly number[] {
  const times = new Set<number>();
  for (const curve of baseCurves(view, clip, controls ?? undefined, layer)) {
    for (const key of view.query.keysOfCurve(curve.id)) times.add(key.t);
  }
  return [...times].sort((a, b) => a - b);
}

/** The curve of a control channel on one layer of a clip (the base unless `layer` is given). */
export function curveOf(
  view: ReadView,
  clip: ClipRecord,
  control: ControlId,
  channel: ChannelId,
  layer?: LayerId,
): CurveRecord | undefined {
  const target = layer ?? view.query.baseLayer(clip.id)?.id;
  return target === undefined ? undefined : view.query.curveFor(clip.id, target, control, channel);
}

/**
 * M2A-SPEC §5.19 (A0 baseline): the controls a key target addresses, in rig order for the character targets.
 *
 * - `'selected'`: the selected controls (selection order).
 * - `'character'`: the active character's controls that §5.5 rule 1 does not hide.
 * - `'bodyPart'`: every control of the body parts of the selected controls that rule 1 does not hide (controls
 *   hidden only by the IK/FK rule are included, so a later switch finds keys on both sets); a selected control
 *   without a part (generic rigs) stands for itself.
 */
export function keyTargetControls(app: EditorApp, target: KeyTarget, view: ReadView = app.store): readonly ControlId[] {
  switch (target) {
    case 'selected':
      return selectedControls(app, view).map((control) => control.id);
    case 'character':
      return visibleControls(app, view).map((control) => control.id);
    case 'bodyPart': {
      const state = app.session.getState();
      const selected = selectedControls(app, view);
      const parts = new Set<BodyPart>();
      const themselves = new Set<ControlId>();
      const characters: CharacterId[] = [];
      for (const control of selected) {
        const part = bodyPartIn(view, control.id);
        if (part === null) themselves.add(control.id);
        else parts.add(part);
        const character = view.get('rigs', control.rig)?.character;
        if (character !== undefined && !characters.includes(character)) characters.push(character);
      }
      const out: ControlId[] = [];
      for (const character of characters) {
        for (const control of controlsOfCharacter(view, character)) {
          if (!isControlVisible(state, control)) continue;
          if (themselves.has(control.id)) out.push(control.id);
          else {
            const part = bodyPartIn(view, control.id);
            if (part !== null && parts.has(part)) out.push(control.id);
          }
        }
      }
      return out;
    }
  }
}
