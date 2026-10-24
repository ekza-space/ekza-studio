// The Rig stage while the shell is mounted (STUDIO-TOUCH-SPEC §7.1, §12; T9; P-T6A-4): its modal sessions (the
// *Adjust dots* session and weight painting, `registerSession`: leaving commits, ✕ discards), the dots' claim on a
// finger drag (`addHaloClaim`: a dot is a handle), the skin spot of a finger held in Rig (*Who owns this?*, the
// grammar's stage hook), the Checks, Bones and Weights sheets (`registerHaloSheet`, lazy chunks), the Next chip's
// *Rig it for me ▸* that opens the card, the search recipes' openers, the weight display of Skin (§4.7, the stage
// overlay plus the weight ramp) and *mode follows touch* (§7.1: a tapped joint enters Skeleton, *Paint its weights*
// enters Skin). The card, the trays and the dots panes are the lazy dock (`./RigDock.tsx`); the recipes load with it.
// Nothing here writes the document: every change is an operator run.
import type { MeshId } from '@ekza-studio/doc';
import { type EditorApp, PANEL, quickRigOf, skinTargets, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { POINTER_TOLERANCE, rigSkinOf, type ViewportManager, viewportRigOf } from '@ekza-studio/viewport';
import { type ComponentType, createElement, type JSX, lazy, Suspense } from 'react';
import { addStageGestureHooks } from '../../halo/grammar';
import { registerPetalArgs } from '../../halo/verbSource';
import { rigWords } from '../../i18n/rig';
import { addHaloClaim } from '../../input/claims';
import type { HaloSheetProps } from '../../manifest/sheets';
import type { RigIt } from '../../recipes/rigIt';
import { provideRigOpeners } from './openers';
import { registerSession } from '../../session/sessions';
import type { HaloController } from '../../shell/controller';
import { registerNextAction } from '../../shell/PathParts';
import { registerHaloSheet } from '../../shell/Sheets';
import { registerHaloSlice } from '../../shell/stageParts';
import { registerVerbAction } from '../../halo/run';
import { rigSlice } from './slice';
import { PANE, STAGE_BASICS } from '../../shell/stage';
import { type RigUiStore, rigUi } from './ui';

/** The dots panes (§12.2 step 3: R-Markers' front and side, Pro's and Auto-Rig's ids, so their cameras are shared). */
export const DOTS_PANES = { front: 'pane-front', side: 'pane-side' } as const;

/** What the Rig stage's parts share for one mounted shell. */
export interface RigStage {
  readonly ui: RigUiStore;
  /** The *Rig it for me* recipe (made with the dock's chunk on first use). */
  recipe(): Promise<RigIt>;
  /** The recipe if it was made already. */
  readonly loaded: RigIt | null;
  /**
   * Opens the Rig-it card (switching to Rig first): the Next chip, the tray, search; `selection`: on the scene meshes
   * selected now (the Make part's *Rig it*).
   */
  openCard(opts?: { readonly selection?: boolean }): Promise<void>;
  /** Starts the bend test from search (*Fix where it bends badly*). */
  fixBend(): Promise<void>;
  /** A journey's touch (AS-ST-4). */
  touch(): void;
}

const stages = new WeakMap<HaloController, RigStage>();

/** The Rig stage of a mounted shell (made on first use; `startRig` uses the same). */
export function rigStage(controller: HaloController): RigStage {
  let found = stages.get(controller);
  if (found !== undefined) return found;
  const { ctx } = controller;
  const ui = rigUi(ctx.store);
  let made: Promise<RigIt> | null = null;
  let loaded: RigIt | null = null;
  const stage: RigStage = {
    ui,
    get loaded() {
      return loaded;
    },
    recipe() {
      made ??= Promise.all([import('../../recipes/rigIt'), import('../../intake/flowHost')]).then(
        ([{ createRigIt }, { haloFlowHost }]) => {
          loaded = createRigIt({
            app: ctx.app,
            host: haloFlowHost(ctx),
            setDestination: (id) => ctx.store.set({ destination: id }),
          });
          return loaded;
        },
        (error: unknown) => {
          made = null;
          throw error;
        },
      );
      return made;
    },
    async openCard(opts = {}) {
      const scene = new Set(
        ctx.app.store
          .list('meshes')
          .filter((mesh) => mesh.deleted === null && 'scene' in mesh.owner)
          .map((mesh) => mesh.id as string),
      );
      const picked =
        opts.selection === true ? ctx.app.session.getState().selection.objects.filter((id) => scene.has(id)) : [];
      if (ctx.store.get().stage !== 'rig') await controller.enterStage('rig');
      ui.set({ card: true, spot: null });
      ctx.store.set({ halo: null, sheet: null, sheetArgs: null, sheetNoun: null });
      const recipe = await stage.recipe();
      const phase = recipe.get().phase;
      // an open card keeps its place (a rigged character's card, a running build)
      if (picked.length > 0) await recipe.open({ character: null, meshes: picked as never });
      else if (phase === 'none' || phase === 'failed' || phase === 'added' || phase === 'checks') await recipe.open();
      else if (quickRigOf(ctx.app) === null && phase === 'dots') await recipe.open();
    },
    async fixBend() {
      if (ctx.store.get().stage !== 'rig') await controller.enterStage('rig');
      const { testView } = await import('../../recipes/fixBend');
      await testView((op, a) => ctx.run(op, a), ctx.app);
      ui.set({ bend: 'playing', spot: null, card: false });
    },
    touch: () => ctx.store.set((s) => ({ touches: s.touches + 1 })),
  };
  found = stage;
  stages.set(controller, found);
  return found;
}

const ChecksSheet = lazy(() => import('../../sheets/checks'));
const BonesSheet = lazy(() => import('../../sheets/bones'));
const WeightsSheet = lazy(() => import('../../sheets/weights'));

/** A Rig sheet in the frame's sheet slot, with the stage's own parts (the card, the touch counter). */
function sheetHost(
  stage: RigStage,
  Body: ComponentType<HaloSheetProps & { readonly rig: RigStage }>,
): ComponentType<HaloSheetProps> {
  return function RigSheetHost({ ctx, args }: HaloSheetProps): JSX.Element {
    return createElement(
      Suspense,
      { fallback: null },
      createElement(Body, { ctx, rig: stage, ...(args === undefined ? {} : { args }) }),
    );
  };
}

/** The joint a paint session starts on: the selected joint, if it moves a bound mesh. */
function paintTarget(app: EditorApp): { readonly mesh: MeshId; readonly joint: string } | null {
  const joint = app.session.getState().selection.joints.at(-1);
  const mesh = skinTargets(app)[0];
  return joint === undefined || mesh === undefined ? null : { mesh, joint };
}

/** The dot under a pane point (a handle of the dots session), via the viewport's marker overlay. */
function dotAt(app: EditorApp, paneId: string, x: number, y: number): boolean {
  const rig = viewportRigOf(app);
  if (rig === null || quickRigOf(app) === null) return false;
  rig.ensure();
  const radius = Math.max(POINTER_TOLERANCE.touch.pickPx, 12);
  return rig.markers.hits(paneId, x, y).some((hit) => hit.distPx <= radius);
}

/** Starts the Rig stage's parts for a mounted shell; the disposer ends them. */
export function installRig(controller: HaloController): () => void {
  const { ctx } = controller;
  const { app, store } = ctx;
  const stage = rigStage(controller);
  const { ui } = stage;
  const offs: (() => void)[] = [];
  const later = (run: () => void): void => {
    setTimeout(run, 0);
  };

  // ---- sheets (§12.1, §12.4): lazy chunks in the frame's slot ----
  offs.push(registerHaloSheet('checks', sheetHost(stage, ChecksSheet)));
  offs.push(registerHaloSheet('bones', sheetHost(stage, BonesSheet)));
  offs.push(registerHaloSheet('weights', sheetHost(stage, WeightsSheet)));

  // ---- the test API's `halo().slices.rig` (§20.7) ----
  offs.push(registerHaloSlice('rig', () => rigSlice(controller)));

  // ---- a petal that goes to Rig (the Make part's *Rig it*) opens the card on what is selected (§9 J1) ----
  offs.push(
    registerVerbAction(app, 'stage:rig', () => {
      void stage.openCard({ selection: true });
    }),
  );

  // ---- search's *Rig it for me* and *Fix where it bends badly* (§9.11) ----
  offs.push(provideRigOpeners(app, { rigIt: () => stage.openCard(), fixBend: () => stage.fixBend() }));

  // ---- the Next chip's *Rig it for me ▸* opens the card (J1: one touch) ----
  offs.push(
    registerNextAction(app, 'rigIt', () => {
      stage.touch();
      void stage.openCard();
    }),
  );

  // ---- sessions (§5.7): leaving commits, ✕ discards ----
  offs.push(
    registerSession(app, {
      id: 'adjustDots',
      active: () => ui.get().dots && quickRigOf(app) !== null,
      label: rigWords.dots.session,
      hint: rigWords.dots.hint,
      done: () => {
        ui.set({ dots: false });
      },
      async cancel(c) {
        ui.set({ dots: false, card: false });
        const recipe = stage.loaded;
        if (recipe !== null) await recipe.cancel();
        else if (quickRigOf(app) !== null) await c.run('skel.quickRig.cancel');
      },
    }),
  );
  offs.push(
    registerSession(app, {
      id: 'paintWeights',
      active: (a) => {
        const s = a.session.getState();
        return s.workspace === 'rig' && s.rig.mode === 'skin' && s.tools.viewport === VIEWPORT_TOOL.paintSkinWeights;
      },
      label: rigWords.paint.session,
      hint: rigWords.paint.sessionHint,
      steps: () => ui.get().strokes,
      async done(c) {
        ui.set({ strokes: 0 });
        await c.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.select });
      },
      async cancel(c) {
        const strokes = ui.get().strokes;
        ui.set({ strokes: 0 });
        for (let i = 0; i < strokes; i++) {
          if (app.history.peekUndo()?.label === undefined) break;
          await c.run('edit.undo');
        }
        await c.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.select });
      },
    }),
  );
  // the strokes of the open paint session (✕ asks above three and takes them back)
  offs.push(
    app.operators.onBeforeDocumentRun((id) => {
      if (id === 'skin.weights.paint' && store.get().stage === 'rig') ui.set({ strokes: ui.get().strokes + 1 });
    }),
  );
  offs.push(
    app.session.subscribe((next, previous) => {
      const was = previous.rig.mode === 'skin' && previous.tools.viewport === VIEWPORT_TOOL.paintSkinWeights;
      const is = next.rig.mode === 'skin' && next.tools.viewport === VIEWPORT_TOOL.paintSkinWeights;
      if (was !== is && ui.get().strokes !== 0) ui.set({ strokes: 0 });
    }),
  );

  // ---- the dots are handles (§5.1): a finger drag on one moves it; elsewhere the dots panes pan ----
  offs.push(
    addHaloClaim(
      app,
      (paneId, x, y) => store.get().stage === 'rig' && quickRigOf(app) !== null && dotAt(app, paneId, x, y),
    ),
  );

  // ---- canvas gestures in Rig: a tap beside the dots drops the selected dot; a finger held on the skin names it ----
  offs.push(
    addStageGestureHooks(app, {
      tap(tap) {
        if (store.get().stage !== 'rig') return;
        if (ui.get().spot !== null) ui.set({ spot: null });
        const quick = quickRigOf(app);
        if (quick === null || quick.selected === null) return;
        if (!dotAt(app, tap.paneId, tap.x, tap.y)) void ctx.run('skel.quickRig.pick', { marker: null });
      },
      longPress(tap) {
        if (store.get().stage !== 'rig' || quickRigOf(app) !== null) return false;
        const skin = rigSkinOf(app);
        const hit = skin?.hitAt(tap.paneId, tap.x, tap.y) ?? null;
        if (skin === null || hit === null) return false;
        const point = nearestPoint(hit, skin.worldOf(hit.surface));
        if (point < 0) return false;
        store.set({ halo: null, focus: null });
        ui.set({ spot: { mesh: hit.surface.mesh as MeshId, point, paneId: tap.paneId, at: { x: tap.x, y: tap.y } } });
        return true;
      },
    }),
  );

  // ---- a rig dot's *Mirror to other side* (§6.2): that dot at its mirrored point ----
  offs.push(
    registerPetalArgs('rigDot.mirror', (a) => {
      const quick = quickRigOf(a);
      const name = quick?.selected ?? null;
      const point = name === null ? undefined : quick?.markers[name];
      if (name === null || point === undefined) return null;
      return { name, point: [point[0] === 0 ? 0 : -point[0], point[1], point[2]] };
    }),
  );

  // ---- mode follows touch (§7.1) ----
  let busy = false;
  offs.push(
    app.session.subscribe((next, previous) => {
      if (busy || store.get().stage !== 'rig' || next.workspace !== 'rig') return;
      // a tapped joint enters Skeleton (its selection comes back with it)
      if (
        next.rig.mode === 'object' &&
        next.selection.joints.length > 0 &&
        next.selection.joints !== previous.selection.joints &&
        next.tools.viewport === VIEWPORT_TOOL.select
      ) {
        const joints = [...next.selection.joints];
        busy = true;
        later(() => {
          void ctx
            .run('rig.mode', { mode: 'skeleton' })
            .then(() => ctx.run('select.joints', { ids: joints, mode: 'replace' }))
            .finally(() => {
              busy = false;
            });
        });
        return;
      }
      // *Paint its weights* arms the brush: Skin, with that joint as the one painting goes to
      if (
        next.tools.viewport === VIEWPORT_TOOL.paintSkinWeights &&
        previous.tools.viewport !== VIEWPORT_TOOL.paintSkinWeights &&
        next.rig.mode !== 'skin'
      ) {
        const target = paintTarget(app);
        busy = true;
        later(() => {
          void (async () => {
            const { paintBone } = await import('../../recipes/fixBend');
            if (target !== null) await paintBone((op, a) => ctx.run(op, a), app, target.mesh, target.joint);
            else await ctx.run('rig.mode', { mode: 'skin' });
          })().finally(() => {
            busy = false;
          });
        });
      }
    }),
  );

  // ---- *Rig it for me* from a Halo (the empty space's ring) opens Quick Rig: the card follows it ----
  offs.push(
    app.session.subscribe((next, previous) => {
      if (next.rig.quickRig !== null && previous.rig.quickRig === null && !ui.get().card) {
        if (store.get().stage === 'rig') later(() => void stage.openCard());
      }
    }),
  );

  // ---- §4.7 stage lighting in Rig: x-ray at 40 %, and the weight display in Skin (the ramp, or Show ▾'s) ----
  let offOverlay: (() => void) | null = null;
  const overlay = (): void => {
    const vm: ViewportManager | null = ctx.vm();
    if (vm === null || store.get().stage !== 'rig') return;
    const s = app.session.getState();
    const weights = s.workspace === 'rig' && s.rig.mode === 'skin' ? ui.get().show : null;
    offOverlay?.();
    offOverlay = vm.setDisplayOverlay(PANE, {
      ...STAGE_BASICS.rig.overlay,
      ...(weights === null ? {} : { weights }),
    });
  };
  offs.push(
    store.subscribe((next, previous) => {
      if (next.stage !== previous.stage && next.stage === 'rig') overlay();
      if (next.stage !== previous.stage && previous.stage === 'rig') {
        offOverlay = null;
        ui.set({ dots: false, spot: null, menu: null, card: false });
        void stage.loaded?.stopMotion();
      }
    }),
  );
  offs.push(
    app.session.subscribe((next, previous) => {
      if (next.rig.mode !== previous.rig.mode || next.workspace !== previous.workspace) overlay();
    }),
  );
  offs.push(ui.subscribe(() => overlay()));
  offs.push(ctx.host.ui.subscribe((next, previous) => (next.viewport !== previous.viewport ? overlay() : undefined)));
  overlay();

  return () => {
    for (const off of offs.splice(0).reverse()) off();
    void stage.loaded?.stopMotion();
    ui.set({ dots: false, spot: null, menu: null, card: false, bend: 'off' });
  };
}

/** The point of a hit triangle nearest the hit (the skin spot). */
function nearestPoint(
  hit: {
    readonly tri: number;
    readonly point: readonly number[];
    readonly surface: { readonly tris: ArrayLike<number> };
  },
  world: Float64Array,
): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k++) {
    const v = hit.surface.tris[3 * hit.tri + k] as number;
    const d = Math.hypot(
      (world[3 * v] as number) - (hit.point[0] as number),
      (world[3 * v + 1] as number) - (hit.point[1] as number),
      (world[3 * v + 2] as number) - (hit.point[2] as number),
    );
    if (d < bestD || (d === bestD && v < best)) {
      best = v;
      bestD = d;
    }
  }
  return best;
}
