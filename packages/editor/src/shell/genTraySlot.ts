// The job tray's slot in the help line (MODELING-PLAN §7.2 G-d "job tray in the help line"): the lazy Generate chunk
// puts its live pill here once it has loaded (jobs exist only after the panel ran one), so the help line carries no
// generation code until then — the rig shell's `setRigHelp` pattern.
import type { ReactElement } from 'react';

type Listener = () => void;

let tray: (() => ReactElement | null) | null = null;
const listeners = new Set<Listener>();

/** Sets (or clears) the tray's renderer. */
export function setGenTray(render: (() => ReactElement | null) | null): void {
  tray = render;
  for (const listener of listeners) listener();
}

export function genTray(): (() => ReactElement | null) | null {
  return tray;
}

export function subscribeGenTray(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
