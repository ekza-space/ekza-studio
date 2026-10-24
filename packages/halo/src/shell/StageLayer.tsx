// The current stage's canvas layer (STUDIO-TOUCH-SPEC §4.1, §11; `./stageParts`): handles and chips a stage package
// draws over the canvas beside the work — Make's cap handle and value handle, a reference image's chips. Under the
// Halo layer, so the grammar's floaters stay on top; lazy per stage, nothing while its chunk loads.
import { type JSX, Suspense } from 'react';
import { STAGE_LAYERS, type StageLayerProps } from './stageParts';
import { useHaloStore } from './store';

export function StageLayer(props: StageLayerProps): JSX.Element | null {
  const stage = useHaloStore(props.controller.ctx.store, (s) => s.stage);
  const Layer = STAGE_LAYERS[stage];
  if (Layer === undefined) return null;
  return (
    <Suspense fallback={null}>
      <Layer {...props} />
    </Suspense>
  );
}
