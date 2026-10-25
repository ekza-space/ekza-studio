// The Rig stage's tray in the shell's tray slot (STUDIO-TOUCH-SPEC §7.1, §12; T9; the stage-parts seam).
import type { JSX } from 'react';
import type { StageTrayProps } from '../../shell/stageParts';
import RigTray from './RigTray';
import { rigStage } from './start';

export function Tray({ controller, compact }: StageTrayProps): JSX.Element {
  return <RigTray controller={controller} rig={rigStage(controller)} size={compact ? 'compact' : 'wide'} />;
}
