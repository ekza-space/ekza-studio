// The Make stage while the shell is mounted (STUDIO-TOUCH-SPEC §5.1, §6.2, §11; T8):
// - *Select area*: drags on the canvas go to the select tool, which draws its marquee (the twin of the Thumb key's
//   Select more on empty space, §5.2.1; one-finger orbit is back when it is off);
// - the mesh Halo's *Reduce ▾*: the generation budgets as its choices (G-a's `mesh.reduce`, greyed until it is in the
//   build, `./cleanup`);
// - *Mirror edits* on for a new character body or guides (§11 "on by default for templates"): U state, never a step;
// - the test API's `make` slice.
import { VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import type { Box } from '@ekza-studio/ui/touch';
import { makeWords } from '../../i18n/make';
import { addHaloClaim } from '../../input/claims';
import type { HaloController } from '../../shell/controller';
import { PANE } from '../../shell/stage';
import { registerHaloSlice } from '../../shell/stageParts';
import { bindNoun, type Verb } from '../../halo/verbSource';
import { capNow } from './CapHandle';
import { GA_OPS, REDUCE_BUDGETS, reduceArgs } from './cleanup';
import { componentBox } from './geometry';
import { makeStore } from './state';
import { valueRun } from './ValueHandle';

/** The templates whose meshes start with Mirror edits on (the character starts and the proportion guides). */
const MIRRORED_TEMPLATES: ReadonlySet<string> = new Set(['humanoidBody', 'humanoid']);

/** Turns Mirror edits on for the meshes a character template just made (once per run). */
function mirrorTemplates(controller: HaloController): () => void {
  const { app } = controller.ctx;
  let seen: number | null = null;
  return app.session.subscribe((state) => {
    const last = state.lastRun;
    if (last === null || last.id !== 'mesh.create.template' || last.stepId === seen) return;
    seen = last.stepId;
    const template = last.args['template'];
    if (typeof template !== 'string' || !MIRRORED_TEMPLATES.has(template)) return;
    const meshes = state.selection.objects.filter((id) => app.store.get('meshes', id as never) !== undefined);
    const unset = meshes.filter((id) => !state.model.symmetry.has(id as never));
    if (unset.length === 0) return;
    void controller.ctx.run('model.symmetry.set', { meshes: unset, mode: 'object-x' });
  });
}

/** The Reduce petal's choices: one per budget (`mesh.reduce {triangles, preset}`), greyed until G-a is in the build. */
function reduceVerb(verb: Verb): Verb {
  return {
    ...verb,
    hasMenu: true,
    choices: REDUCE_BUDGETS.map(
      (budget): Verb => ({
        id: `${GA_OPS.reduce}:${budget.id}`,
        label: makeWords.ai[budget.id],
        run: { op: GA_OPS.reduce as never, args: reduceArgs(budget) },
      }),
    ),
  };
}

export function installMake(controller: HaloController): () => void {
  const { app, store } = controller.ctx;
  const ms = makeStore(app);
  const disposers: (() => void)[] = [];
  disposers.push(
    addHaloClaim(
      app,
      (paneId) =>
        paneId === PANE &&
        store.get().stage === 'make' &&
        ms.get().selectArea &&
        app.session.getState().tools.viewport === VIEWPORT_TOOL.select,
    ),
  );
  disposers.push(
    bindNoun('mesh', {
      verb: (_app, _noun, petal, verb) => (petal.id === 'reduce' ? reduceVerb(verb) : verb),
    }),
  );
  // the component nouns' Halo, breadcrumb and chips sit beside the selected components and Make's handles, never
  // over them (AS-ST-18): the projected points of the selection, padded, with the cap or value handle
  const handlesBox = (): Box | null => {
    const vm = controller.ctx.vm();
    if (vm === null) return null;
    const project = (p: readonly [number, number, number]) => vm.project(PANE, p);
    let box: Box | null = componentBox(app, project);
    const cap = capNow(controller.ctx);
    const points = cap === null ? [] : [cap.handle];
    for (const p of points) {
      const around = { left: p.x - 32, top: p.y - 32, right: p.x + 32, bottom: p.y + 32 };
      box =
        box === null
          ? around
          : {
              left: Math.min(box.left, around.left),
              top: Math.min(box.top, around.top),
              right: Math.max(box.right, around.right),
              bottom: Math.max(box.bottom, around.bottom),
            };
    }
    const rect = vm.paneRect(PANE);
    if (box === null || rect === null) return box;
    const left = Math.max(0, Math.min(rect.w, box.left));
    const top = Math.max(0, Math.min(rect.h, box.top));
    return {
      left,
      top,
      right: Math.max(left, Math.min(rect.w, box.right)),
      bottom: Math.max(top, Math.min(rect.h, box.bottom)),
    };
  };
  for (const kind of ['faces', 'edges', 'vertices'] as const)
    disposers.push(bindNoun(kind, { box: () => handlesBox() }));
  disposers.push(mirrorTemplates(controller));
  // leaving Make closes its menu; Select area ends with the stage
  disposers.push(
    store.subscribe((next, previous) => {
      if (next.stage !== previous.stage && previous.stage === 'make') ms.set({ menu: null, selectArea: false });
    }),
  );
  disposers.push(
    registerHaloSlice('make', () => {
      const s = app.session.getState();
      const cap = capNow(controller.ctx);
      const value = valueRun(controller.ctx);
      return {
        menu: ms.get().menu,
        selectArea: ms.get().selectArea,
        tool: s.tools.viewport,
        extrude: s.model.extrudeSession !== null,
        cap: cap === null ? null : { x: cap.handle.x, y: cap.handle.y, dx: cap.dir.x, dy: cap.dir.y },
        value: value === null ? null : { op: value.op, param: value.param.name, value: value.value },
      };
    }),
  );
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}
