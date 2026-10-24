// The Paint stage while the shell is mounted (STUDIO-TOUCH-SPEC §6.2 "Swatch", §13.1; T8):
// - the swatch noun (`bindNoun('swatch')`): a focus from the tray stands for the swatch; its Halo docks above the
//   swatch in the tray (never over the model the strokes land on), and its petals act on that swatch — *Edit colour*
//   and *Rename* open the palette sheet at it, *Finish ▾* is Matte · Shiny, *Select faces* selects what it paints,
//   *Replace with active* recolours its faces with the active swatch;
// - *Pick* is the Thumb key's *Pick colour* for one tap: when that tap is spent the key's choice goes back to *Fill
//   part*;
// - the test API's `paint` slice.
import type { SwatchId } from '@ekza-studio/doc';
import type { Box } from '@ekza-studio/ui/touch';
import { bindNoun, type Verb } from '../../halo/verbSource';
import { addHaloClaim } from '../../input/claims';
import { paintWords } from '../../i18n/make';
import type { HaloController } from '../../shell/controller';
import { PANE } from '../../shell/stage';
import { registerHaloSlice } from '../../shell/stageParts';
import type { Noun as KindNoun } from '../../verbs/nouns';
import { activeSwatch, currentPalette, swatchesOf } from './model';

function swatchVerb(app: HaloController['ctx']['app'], swatchId: string, petal: string, verb: Verb): Verb {
  const swatch = app.store.get('swatches', swatchId as SwatchId);
  if (swatch === undefined) return verb;
  switch (petal) {
    case 'edit':
    case 'rename':
      return { ...verb, run: { sheet: 'palette' } };
    case 'finish':
      return {
        ...verb,
        hasMenu: true,
        choices: (['lambert', 'blinn'] as const).map(
          (shader): Verb => ({
            id: `palette.setSwatch:${shader}`,
            label: shader === 'blinn' ? paintWords.tray.shiny : paintWords.tray.matte,
            run: { op: 'palette.setSwatch', args: { swatch: swatch.id, shader } },
            ...(swatch.shader === shader ? { changed: true } : {}),
          }),
        ),
      };
    case 'selectFaces':
      return { ...verb, run: { op: 'select.mesh.bySwatch', args: { slot: swatch.slot } } };
    case 'replace': {
      const active = activeSwatch(app);
      return {
        ...verb,
        run: { op: 'mesh.paint.remap', args: { from: swatch.slot, to: active?.slot ?? swatch.slot } },
      };
    }
    default:
      return verb;
  }
}

export function installPaint(controller: HaloController): () => void {
  const { app, store } = controller.ctx;
  const disposers: (() => void)[] = [];
  disposers.push(
    bindNoun('swatch', {
      docked: true,
      focus(bound, id): KindNoun | null {
        if (id === null) return null;
        const swatch = bound.store.get('swatches', id as SwatchId);
        if (swatch === undefined || swatch.deleted !== null) return null;
        return { kind: 'swatch', id, ids: [id], label: swatch.name, count: 1, character: null };
      },
      verb: (bound, noun, petal, verb) => (noun.id === null ? verb : swatchVerb(bound, noun.id, petal.id, verb)),
      box(_bound, noun): Box | null {
        if (typeof document === 'undefined' || noun.id === null) return null;
        const el = document.querySelector(`[data-swatch="${CSS.escape(noun.id)}"]`);
        const pane = controller.ctx.vm()?.paneRect(PANE) ?? null;
        if (el === null || pane === null) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left - pane.x, top: r.top - pane.y, right: r.right - pane.x, bottom: r.bottom - pane.y };
      },
    }),
  );
  // *Pick* waits for a tap (the brush would start a stroke after its delay): the press is the tool's, tapped or not
  disposers.push(
    addHaloClaim(app, (paneId) => {
      const ui = store.get();
      return (
        paneId === PANE && ui.stage === 'paint' && ui.thumb.latch !== 'off' && ui.thumbPick?.meaning === 'pickColour'
      );
    }),
  );
  // a spent *Pick* gives the Thumb key its *Fill part* back
  disposers.push(
    store.subscribe((next, previous) => {
      if (next.thumb.latch === 'off' && previous.thumb.latch !== 'off' && next.thumbPick?.meaning === 'pickColour') {
        store.set({ thumbPick: null });
      }
    }),
  );
  disposers.push(
    registerHaloSlice('paint', () => {
      const palette = currentPalette(app);
      const ui = store.get();
      return {
        palette: palette?.id ?? null,
        swatches: palette === null ? 0 : swatchesOf(app, palette.id).length,
        active: activeSwatch(app)?.id ?? null,
        focus: ui.focus?.kind === 'swatch' ? ui.focus.id : null,
        fill: ui.thumb.latch === 'locked' && ui.thumbPick === null,
        pick: ui.thumbPick?.meaning === 'pickColour' && ui.thumb.latch !== 'off',
        tool: app.session.getState().tools.viewport,
      };
    }),
  );
  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}
