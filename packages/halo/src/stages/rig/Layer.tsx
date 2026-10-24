// The Rig stage's canvas layer (STUDIO-TOUCH-SPEC §4.1, §12; T9; the stage-parts seam): under the Halo layer and the
// chrome — the *Adjust dots* panes in the single pane's place while the session is open, then over the canvas the
// Rig-it card above the tray, the session's own chips, *Who owns this?* at a skin spot and the card of the bones an
// area follows while the brush paints.
import type { JSX } from 'react';
import type { StageLayerProps } from '../../shell/stageParts';
import DotsPanes from './DotsPanes';
import RigOverlay from './RigOverlay';
import { rigStage } from './start';
import { useRigUi } from './ui';

export function RigLayer({ controller, size }: StageLayerProps): JSX.Element {
  const rig = rigStage(controller);
  const dots = useRigUi(rig.ui, (s) => s.dots);
  return (
    <>
      {dots ? <DotsPanes controller={controller} rig={rig} size={size} /> : null}
      <RigOverlay controller={controller} rig={rig} size={size} />
    </>
  );
}
