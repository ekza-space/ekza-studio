// The Rig stage's slice of the test API's `halo()` (STUDIO-TOUCH-SPEC §20.7; T9): plain JSON for `page.evaluate` —
// the Rig-it card (its phase, story stage, finger detail, motion test), the *Adjust dots* session (its panes and the
// selected dot), the paint session (the brush, the Pencil's pressure toggle, the bone painting goes to, its strokes),
// the skin spot of *Who owns this?* and its bones, the bend test, the Rig mode and pose view.
import { quickRigOf, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { strokePressure } from '@ekza-studio/viewport';
import { haloFlowStore } from '../../intake/flowHost';
import type { HaloController } from '../../shell/controller';
import { bonesAt } from './model';
import { rigStage } from './start';

export function rigSlice(controller: HaloController): Record<string, unknown> {
  const { app } = controller.ctx;
  const rig = rigStage(controller);
  const ui = rig.ui.get();
  const s = app.session.getState();
  const recipe = rig.loaded?.get() ?? null;
  const quick = quickRigOf(app);
  const brush = s.rig.paint.brush;
  const subject = haloFlowStore(app).get().subject;
  return {
    mode: s.rig.mode,
    // the flow's subject (Home's intake, Create with AI's *Rig it*, the card's own pick)
    subject: { character: subject.character, meshes: [...subject.meshes] },
    startPose: haloFlowStore(app).get().startPose?.kind ?? null,
    poseView: s.rig.poseView,
    card: {
      open: ui.card,
      phase: recipe?.phase ?? null,
      stage: recipe?.stage ?? null,
      fingers: recipe?.fingers ?? null,
      motion: recipe?.motion?.state ?? null,
      character: recipe?.character ?? null,
      message: recipe?.message ?? null,
    },
    dots: {
      open: ui.dots,
      view: ui.dotsView,
      quickRig: quick !== null,
      selected: quick?.selected ?? null,
      moved: quick === null ? 0 : quick.moved.size,
      panes: ['pane-front', 'pane-side'].filter((id) => controller.ctx.vm()?.paneIds().includes(id) === true),
    },
    painting: s.workspace === 'rig' && s.rig.mode === 'skin' && s.tools.viewport === VIEWPORT_TOOL.paintSkinWeights,
    brush: { op: brush.op, radiusPx: brush.radiusPx, opacity: brush.opacity, value: brush.value, mirror: brush.mirror },
    pressure: strokePressure(app),
    active: s.rig.activeInfluence?.joint ?? null,
    strokes: ui.strokes,
    spot:
      ui.spot === null
        ? null
        : { mesh: ui.spot.mesh, point: ui.spot.point, bones: bonesAt(app, ui.spot.mesh, ui.spot.point, 3) },
    bend: ui.bend,
    show: ui.show,
  };
}
