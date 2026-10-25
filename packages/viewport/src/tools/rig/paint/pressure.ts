// Pencil pressure of the Paint Skin Weights brush (STUDIO-TOUCH-SPEC §12.4, §5.1, AS-ST-12; Halo T9): a pen's pressure
// scales each stamp's strength at stamp time (folded into `StrokeStamp.strength`, so `skin.weights.paint`'s arguments,
// replay and MCP determinism stay unchanged, AS-ST-16). Read only for `pointerType === 'pen'` on the arbiter's path
// (the only events that carry `pressure`): finger strokes use the Strength chip as it is (touch reports 0.5) and the
// mouse never has one, so Studio Pro paints exactly as before. A per-app toggle (the brush tray's *Pressure* chip) turns
// it off; it is session state of this page, never a preference or the document. React-free and dependency-light: a
// touch shell's lazy chunk imports it.
import type { EditorApp } from '@ekza-studio/editor-core';

const off = new WeakMap<EditorApp, boolean>();
const listeners = new WeakMap<EditorApp, Set<() => void>>();

/** Whether a pen's pressure sets stamp strength in this app (default on). */
export function strokePressure(app: EditorApp): boolean {
  return off.get(app) !== true;
}

/** Turns pressure on or off for this app's strokes (from the next stroke on); listeners hear a change. */
export function setStrokePressure(app: EditorApp, on: boolean): void {
  if (strokePressure(app) === on) return;
  if (on) off.delete(app);
  else off.set(app, true);
  for (const listener of Array.from(listeners.get(app) ?? [])) listener();
}

/** Hears every change of the toggle; the disposer stops. */
export function subscribeStrokePressure(app: EditorApp, listener: () => void): () => void {
  let set = listeners.get(app);
  if (set === undefined) {
    set = new Set();
    listeners.set(app, set);
  }
  set.add(listener);
  return () => {
    listeners.get(app)?.delete(listener);
  };
}

/** The strength factor of a pressure: clamped to 0…1 (a non-finite value counts as full strength). */
export function pressureFactor(pressure: number): number {
  if (!Number.isFinite(pressure)) return 1;
  return pressure <= 0 ? 0 : pressure >= 1 ? 1 : pressure;
}

/**
 * Whether a stroke started by this event reads pressure: a pen on the arbiter's path (it carries `pressure`) while the
 * app's toggle is on. Decided once per stroke, so a stroke is never half pressured.
 */
export function strokeReadsPressure(
  app: EditorApp,
  e: { readonly pointerType: string; readonly pressure?: number },
): boolean {
  return (
    e.pointerType === 'pen' && typeof e.pressure === 'number' && Number.isFinite(e.pressure) && strokePressure(app)
  );
}
