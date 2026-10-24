// Paint's tray (STUDIO-TOUCH-SPEC §7.1, §13.1, §5.5; T8): the swatch row (the first tap on a swatch makes it active and
// opens its Halo; a long-press opens the Halo without changing the active one; at most six in view, the rest behind
// `+n`, §4.8), `+` (a new swatch, then its editor), the palette chip (the palette sheet), *Pick* (the next tap on the
// model picks its colour: the Thumb key's *Pick colour* for one tap) and *Fill part* (a tap fills the part: the Thumb
// key's *Fill part* locked — one state, §5.5), and the pinned ⋯. Painting imported meshes is refused by the kernel
// ("arrives later"), so the tray says so instead of offering strokes that cannot land (§3 P12).
import type { SwatchId, SwatchRecord } from '@ekza-studio/doc';
import { Cluster, THUMB_INITIAL, useLongPress } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import { Icon } from '../../halo/icons';
import { paintWords } from '../../i18n/make';
import { useDocumentVersion, useSessionValue } from '../../shell/hooks';
import type { StageTrayProps } from '../../shell/stageParts';
import { useHaloStore } from '../../shell/store';
import { EMPTY_NOUN } from '../../verbs/nouns';
import { TrayChip, touch } from '../make/kit';
import { activeSwatch, currentPalette, hexOf, paintable, paintMeshes, swatchesOf, traySwatches } from './model';

const w = paintWords.tray;
/** Swatches in view at rest (the visible-target budget, §4.8: the row, then `+n` — the palette sheet, where *New
 *  swatch* is too — or *New swatch* and the palette chip, then Pick, Fill part and ⋯ keep Paint at rest within 22 with
 *  the top bar, ↶, the Thumb key, the puck and the Next chip). */
export const TRAY_SWATCHES = 5;
/** The row of the Thumb key's Paint Colour meanings (`input/modifierMap.ts`). */
const PAINT_ROW = 'paintColour';

function SwatchButton({
  swatch,
  active,
  focused,
  onTap,
  onHold,
}: {
  readonly swatch: SwatchRecord;
  readonly active: boolean;
  readonly focused: boolean;
  readonly onTap: () => void;
  readonly onHold: () => void;
}): JSX.Element {
  const press = useLongPress({ onTap, onLongPress: onHold });
  return (
    <button
      type="button"
      data-swatch={swatch.id}
      data-testid={`halo-swatch-${swatch.slot}`}
      aria-label={w.swatch(swatch.name, active)}
      aria-pressed={active}
      className={`relative size-(--touch-hit) shrink-0 touch-none rounded-full border-2 ${
        active ? 'border-fg' : focused ? 'border-accent' : 'border-white/40'
      }`}
      style={{ background: hexOf(swatch.srgb) }}
      {...press}
    >
      {swatch.shader === 'blinn' ? (
        <span aria-hidden="true" className="absolute top-1.5 left-2 size-2 rounded-full bg-white/80" />
      ) : null}
    </button>
  );
}

export function PaintTray({ controller }: StageTrayProps): JSX.Element {
  const { ctx } = controller;
  const { app, store } = ctx;
  useDocumentVersion(app);
  const activeId = useSessionValue(app, (s) => s.model.activeSwatch);
  useSessionValue(app, (s) => s.selection.objects);
  useSessionValue(app, (s) => s.model.hilite);
  const focus = useHaloStore(store, (s) => (s.focus?.kind === 'swatch' ? s.focus.id : null));
  const thumb = useHaloStore(store, (s) => s.thumb);
  const pick = useHaloStore(store, (s) => s.thumbPick);

  const meshes = paintMeshes(app);
  const shell = (children: JSX.Element | readonly JSX.Element[], empty = false): JSX.Element => (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-tray"
      data-stage="paint"
      data-empty={empty ? '' : undefined}
      className="pointer-events-auto relative flex w-full max-w-[1100px] items-center gap-1 p-[5px]"
    >
      {children}
    </Cluster>
  );
  if (meshes.length === 0)
    return shell(<span className="px-3 text-touch text-fg-2">{paintWords.empty.nothing}</span>, true);
  if (!meshes.some(paintable)) {
    return shell(
      <span className="px-3 text-touch text-fg-2" data-testid="halo-paint-imported">
        {paintWords.empty.imported}
      </span>,
      true,
    );
  }
  const palette = currentPalette(app);
  if (palette === null) {
    return shell(
      <TrayChip
        testId="halo-paint-starter"
        label={w.usePalette}
        icon={<Icon name="palette" />}
        onPress={() => {
          touch(ctx);
          void ctx.run('palette.ensureDefault');
        }}
      />,
      true,
    );
  }
  const swatches = swatchesOf(app, palette.id);
  const { shown, more } = traySwatches(swatches, activeId as SwatchId | null, TRAY_SWATCHES);
  const fillOn = thumb.latch === 'locked' && pick === null;
  const pickOn = thumb.latch !== 'off' && pick?.row === PAINT_ROW && pick.meaning === 'pickColour';
  const openSwatch = (swatch: SwatchRecord, activate: boolean): void => {
    touch(ctx);
    if (activate && activeSwatch(app)?.id !== swatch.id) void ctx.run('palette.setActive', { swatch: swatch.id });
    store.set({ focus: { kind: 'swatch', id: swatch.id }, halo: { mode: 'arc', at: null }, sub: null, sheet: null });
  };
  const openPalette = (): void => {
    touch(ctx);
    store.set({ sheet: 'palette', sheetArgs: null, sheetNoun: null, halo: null, focus: null });
  };
  return shell(
    <>
      <fieldset
        aria-label={w.swatches}
        className="m-0 flex min-w-0 shrink items-center gap-1.5 overflow-x-auto border-0 px-1 py-0"
        data-touch-scroll=""
        data-testid="halo-swatches"
      >
        {shown.map((swatch) => (
          <SwatchButton
            key={swatch.id}
            swatch={swatch}
            active={swatch.id === activeId}
            focused={swatch.id === focus}
            onTap={() => openSwatch(swatch, true)}
            onHold={() => openSwatch(swatch, false)}
          />
        ))}
        {more > 0 ? <TrayChip testId="halo-swatches-more" label={`+${more}`} onPress={openPalette} /> : null}
        {more > 0 ? null : (
          <TrayChip
            testId="halo-swatch-add"
            label={w.addSwatch}
            icon={<Icon name="clip" />}
            onPress={() => {
              touch(ctx);
              const base = activeSwatch(app)?.srgb ?? ([160, 160, 160] as const);
              void ctx.run('palette.addSwatch', { palette: palette.id, srgb: [...base] }).then((result) => {
                const created = (result as { readonly value?: { readonly swatch?: SwatchId } }).value?.swatch;
                if (result.status !== 'finished' || created === undefined) return;
                void ctx.run('palette.setActive', { swatch: created });
                store.set({
                  sheet: 'palette',
                  sheetArgs: { section: 'swatch' },
                  sheetNoun: null,
                  halo: null,
                  focus: null,
                });
              });
            }}
          />
        )}
      </fieldset>
      {/* `+n` is the palette's door when swatches are left out; the palette chip otherwise */}
      {more > 0 ? null : (
        <TrayChip
          testId="halo-paint-palette"
          label={w.paletteTitle}
          icon={<Icon name="palette" />}
          menu
          onPress={openPalette}
        />
      )}
      <TrayChip
        testId="halo-paint-pick"
        label={w.pick}
        pressed={pickOn}
        onPress={() => {
          touch(ctx);
          if (pickOn) store.set({ thumb: THUMB_INITIAL, thumbPick: null });
          else {
            store.set({
              thumb: { ...THUMB_INITIAL, latch: 'once', before: 'once' },
              thumbPick: { row: PAINT_ROW, meaning: 'pickColour' },
            });
            ctx.toasts.push({ key: 'pick', text: w.pickHint });
          }
        }}
      />
      <TrayChip
        testId="halo-paint-fill"
        label={w.fillPart}
        pressed={fillOn}
        onPress={() => {
          touch(ctx);
          store.set(
            fillOn
              ? { thumb: THUMB_INITIAL }
              : { thumb: { ...THUMB_INITIAL, latch: 'locked', before: 'locked' }, thumbPick: null },
          );
        }}
      />
      <TrayChip
        testId="halo-paint-more"
        label={w.more}
        icon={<Icon name="more" />}
        onPress={() => {
          touch(ctx);
          store.set({ sheet: 'more', sheetArgs: null, sheetNoun: EMPTY_NOUN, halo: null, focus: null });
        }}
      />
    </>,
  );
}
