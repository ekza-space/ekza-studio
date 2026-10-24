// The Rig stage's openers for search's recipes (STUDIO-TOUCH-SPEC §9.11; T9): the mounted shell's Rig stage opens the
// Rig-it card and the bend test; `recipes/rigOffers.ts` (search's lazy chunk) asks for them by app. Eager and tiny.
import type { EditorApp } from '@ekza-studio/editor-core';

export interface RigOpeners {
  rigIt(): Promise<void>;
  fixBend(): Promise<void>;
}

const openers = new WeakMap<EditorApp, RigOpeners>();

/** The mounted shell's Rig stage provides the openers; the disposer withdraws them. */
export function provideRigOpeners(app: EditorApp, provided: RigOpeners): () => void {
  openers.set(app, provided);
  return () => {
    if (openers.get(app) === provided) openers.delete(app);
  };
}

/** The openers of an app's mounted Rig stage, or undefined. */
export const rigOpenersOf = (app: EditorApp): RigOpeners | undefined => openers.get(app);
