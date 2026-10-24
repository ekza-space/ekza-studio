// What the Paint stage paints with (STUDIO-TOUCH-SPEC §13.1; T8): the palette in use, its swatches in display order,
// the active swatch and what the tray may show. Pure over the app (reads the document and the session, never writes).
import type { MeshRecord, PaletteId, PaletteRecord, SwatchId, SwatchRecord } from '@ekza-studio/doc';
import type { EditorApp } from '@ekza-studio/editor-core';

/** The meshes Paint acts on: the hilited ones in a component mode, else the selected meshes, else every live mesh. */
export function paintMeshes(app: EditorApp): readonly MeshRecord[] {
  const s = app.session.getState();
  const live = app.store.list('meshes').filter((m) => m.deleted === null);
  const picked =
    s.model.componentMode !== 'object' && s.model.hilite.length > 0
      ? s.model.hilite
      : s.selection.objects.filter((id) => id.startsWith('msh_'));
  const chosen = live.filter((m) => picked.includes(m.id));
  return chosen.length > 0 ? chosen : live;
}

/** A mesh Paint can colour (an authored mesh: imported ones keep their materials until painting them arrives). */
export const paintable = (mesh: MeshRecord): boolean => mesh.source === null;

const live = (record: { readonly deleted: unknown }): boolean => record.deleted === null;
const byOrder = (a: { readonly order: string }, b: { readonly order: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

export function activeSwatch(app: EditorApp): SwatchRecord | null {
  const id = app.session.getState().model.activeSwatch;
  if (id === null) return null;
  const swatch = app.store.get('swatches', id as SwatchId);
  return swatch !== undefined && live(swatch) ? swatch : null;
}

/** The palette in use: the active swatch's, else the painted meshes' first, else the first palette. */
export function currentPalette(app: EditorApp): PaletteRecord | null {
  const palettes = app.store.list('palettes').filter(live);
  const byId = (id: PaletteId | null | undefined): PaletteRecord | null =>
    id === null || id === undefined ? null : (palettes.find((p) => p.id === id) ?? null);
  return (
    byId(activeSwatch(app)?.palette) ??
    byId(paintMeshes(app).find((m) => m.palette !== null)?.palette) ??
    [...palettes].sort(byOrder)[0] ??
    null
  );
}

export function swatchesOf(app: EditorApp, palette: PaletteId): readonly SwatchRecord[] {
  return app.store
    .list('swatches')
    .filter((s) => s.palette === palette && live(s))
    .sort(byOrder);
}

/** The swatches the tray shows (§4.8 budget): the active one kept in view, at most `max`, and how many are left out. */
export function traySwatches(
  swatches: readonly SwatchRecord[],
  active: SwatchId | null,
  max: number,
): { readonly shown: readonly SwatchRecord[]; readonly more: number } {
  if (swatches.length <= max) return { shown: swatches, more: 0 };
  const shown = swatches.slice(0, max);
  const index = swatches.findIndex((s) => s.id === active);
  if (index >= max) shown[max - 1] = swatches[index] as SwatchRecord;
  return { shown, more: swatches.length - max };
}

export const hexOf = (srgb: readonly [number, number, number]): string =>
  `#${srgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
