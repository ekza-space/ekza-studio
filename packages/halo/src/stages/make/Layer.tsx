// Make's canvas layer (STUDIO-TOUCH-SPEC §4.2 B, §11; T8): the extrude cap handle while a Pull is open, and the Inset
// / Bevel value handle while one is live. Both are frame chrome over the canvas, beside the work.
import type { JSX } from 'react';
import type { StageLayerProps } from '../../shell/stageParts';
import { CapHandle } from './CapHandle';
import { ValueHandle } from './ValueHandle';

export function MakeLayer({ controller }: StageLayerProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0" data-stage-layer="make">
      <CapHandle ctx={controller.ctx} />
      <ValueHandle ctx={controller.ctx} />
    </div>
  );
}
