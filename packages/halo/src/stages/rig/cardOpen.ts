// A Rig card is up (STUDIO-TOUCH-SPEC §7.2, §5.6; T9): the Rig-it card, the *Adjust dots* session, a skin spot's card
// or a paint session. The Next chip gives way (it never shows while a card is open) and so do the Echo chips of the
// last run (after *Rig it* that is the inner Bind Skin, which the card speaks for). Eager and tiny (the frame and the
// Halo layer read it); the stage's own parts stay in its lazy chunk.
import { VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import type { HaloController } from '../../shell/controller';
import { useSessionValue } from '../../shell/hooks';
import { useHaloStore } from '../../shell/store';
import { rigUi, useRigUi } from './ui';

export function useRigCardOpen(controller: HaloController): boolean {
  const { store, app } = controller.ctx;
  const stage = useHaloStore(store, (s) => s.stage);
  const open = useRigUi(rigUi(store), (s) => s.card || s.dots || s.spot !== null);
  const painting = useSessionValue(
    app,
    (s) => s.workspace === 'rig' && s.rig.mode === 'skin' && s.tools.viewport === VIEWPORT_TOOL.paintSkinWeights,
  );
  return stage === 'rig' && (open || painting);
}

/** How much taller than the shell's one-row tray the Rig tray is now (it wraps): the corners and floaters rise. */
export function useRigLift(controller: HaloController): number {
  const { store } = controller.ctx;
  const stage = useHaloStore(store, (s) => s.stage);
  const height = useRigUi(rigUi(store), (s) => s.trayHeight);
  return stage === 'rig' ? Math.max(0, height - 62) : 0;
}
