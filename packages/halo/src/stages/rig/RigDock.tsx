// The Rig stage in the frame (STUDIO-TOUCH-SPEC §4.1, §7.1, §12; T9; P-T6A-4: it replaces the shell's stand-in tray in
// Rig): the Rig tray (or the brush tray while painting) where the tray docks, and above the canvas the Rig-it card, the
// *Adjust dots* panes, the card of the bones an area follows and *Who owns this?*. Both are a lazy chunk (§20.2:
// non-initial stages are lazy); this hook is the frame's seam. The Next chip gives way while a card is open (§7.2).
import { type JSX, lazy, Suspense } from 'react';
import type { HaloController } from '../../shell/controller';
import type { SizeClass } from '../../shell/hooks';
import { useHaloStore } from '../../shell/store';
import { rigStage } from './start';
import { useRigUi } from './ui';

const RigTrayBody = lazy(() => import('./RigTray'));
const RigOverlayBody = lazy(() => import('./RigOverlay'));
const DotsPanesBody = lazy(() => import('./DotsPanes'));

/** The Rig stage's dock and overlay for the frame; nulls outside Rig. */
export function useRigDock(
  controller: HaloController,
  size: SizeClass,
): {
  readonly dock: JSX.Element | null;
  readonly overlay: JSX.Element | null;
  /** The *Adjust dots* panes, under the chrome (the frame puts them right after the single pane). */
  readonly panes: JSX.Element | null;
  readonly hideNext: boolean;
} {
  const stage = useHaloStore(controller.ctx.store, (s) => s.stage);
  const rig = rigStage(controller);
  const card = useRigUi(rig.ui, (s) => s.card || s.dots || s.spot !== null);
  const dots = useRigUi(rig.ui, (s) => s.dots);
  if (stage !== 'rig') return { dock: null, overlay: null, panes: null, hideNext: false };
  return {
    dock: (
      <Suspense fallback={null}>
        <RigTrayBody controller={controller} rig={rig} size={size} />
      </Suspense>
    ),
    overlay: (
      <Suspense fallback={null}>
        <RigOverlayBody controller={controller} rig={rig} size={size} />
      </Suspense>
    ),
    panes: dots ? (
      <Suspense fallback={null}>
        <DotsPanesBody controller={controller} rig={rig} size={size} />
      </Suspense>
    ) : null,
    hideNext: card,
  };
}
