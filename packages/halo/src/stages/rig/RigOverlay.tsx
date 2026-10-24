// What the Rig stage puts over the canvas (STUDIO-TOUCH-SPEC §4.2 E, §12; T9): the Rig-it card above the tray (§12.2),
// the *Adjust dots* panes (front and side, §12.2 step 3), *Who owns this?* at a skin spot (§12.4 step 2) and, while
// the brush paints, the card of the bones the area follows, docked to the right edge (a tray row on phones, §4.4).
// Never over the selection: the cards dock to edges; the spot's card sits beside the finger.
import type { JSX } from 'react';
import type { HaloController } from '../../shell/controller';
import type { SizeClass } from '../../shell/hooks';
import { useSessionValue } from '../../shell/hooks';
import { VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { DotsChrome } from './DotsPanes';
import { FollowsCard, OwnsCard } from './SkinCards';
import { RigCard } from './RigCard';
import type { RigStage } from './start';
import { useRigUi } from './ui';

export default function RigOverlay({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element {
  const { app } = controller.ctx;
  const card = useRigUi(rig.ui, (s) => s.card);
  const dots = useRigUi(rig.ui, (s) => s.dots);
  const spot = useRigUi(rig.ui, (s) => s.spot);
  const painting = useSessionValue(
    app,
    (s) => s.workspace === 'rig' && s.rig.mode === 'skin' && s.tools.viewport === VIEWPORT_TOOL.paintSkinWeights,
  );
  return (
    <>
      {dots ? <DotsChrome controller={controller} rig={rig} size={size} /> : null}
      {card && !dots ? <RigCard controller={controller} rig={rig} size={size} /> : null}
      {spot !== null ? <OwnsCard controller={controller} rig={rig} spot={spot} size={size} /> : null}
      {painting && spot === null ? <FollowsCard controller={controller} rig={rig} size={size} /> : null}
    </>
  );
}
