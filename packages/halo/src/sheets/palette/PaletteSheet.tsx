// The palette sheet (STUDIO-TOUCH-SPEC §13.1 "Palette menu" and "Swatch Halo", §13.2, §15.4 rows 4.3–4.10; T8): the
// swatch being edited (the Halo's swatch, else the active one) — its colour (the system colour picker, a hex field),
// name, Finish (Matte · Shiny, with Gloss for Shiny), *Select its faces*, *Replace with the active swatch*, *Colour the
// selection with a new swatch* and *Remove* — then every swatch of the palette (a tap makes one active; *New swatch*),
// then the palettes (*New palette*, *Duplicate as a variant*, *Rename*, *Use for the selected shapes*) and *Colours as*
// (how the export writes the colours). Every change is one operator run: `palette.*`, `select.mesh.bySwatch`,
// `mesh.paint.remap`, `mesh.setAttributes`.
import type { ColourOutput, SwatchId, SwatchRecord } from '@ekza-studio/doc';
import { Segmented, SheetGroup, TouchButton, ValueChip } from '@ekza-studio/ui/touch';
import { type JSX, useState } from 'react';
import { paintWords } from '../../i18n/make';
import type { HaloSheetProps } from '../../manifest/sheets';
import { activeSwatch, currentPalette, hexOf, paintMeshes, swatchesOf } from '../../stages/paint/model';
import { HaloSheet, useAppVersion } from '../more/kit';

const w = paintWords.sheet;
const t = paintWords.tray;

const COLOUR_OUTPUTS: readonly { readonly value: ColourOutput; readonly label: string }[] = [
  { value: 'palette-texture', label: 'Palette image' },
  { value: 'vertex-colour', label: 'Point colours' },
  { value: 'material-per-colour', label: 'One material each' },
];

function parseHex(text: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (m === null) return null;
  const hex = m[1] as string;
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function SwatchEditor({
  swatch,
  run,
}: {
  readonly swatch: SwatchRecord;
  readonly run: (op: string, args?: unknown) => void;
}): JSX.Element {
  const [hex, setHex] = useState(hexOf(swatch.srgb));
  const [name, setName] = useState(swatch.name);
  const set = (patch: Record<string, unknown>): void => run('palette.setSwatch', { swatch: swatch.id, ...patch });
  return (
    <section
      data-section="swatch"
      data-testid="halo-palette-swatch"
      aria-label={w.swatch}
      className="flex flex-col gap-2"
    >
      <SheetGroup>{`${w.swatch} · ${swatch.name}`}</SheetGroup>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <label className="flex min-h-(--touch-hit) items-center gap-2">
          <span className="text-touch-label text-fg-2">{w.colour}</span>
          <input
            type="color"
            data-testid="halo-palette-colour"
            aria-label={w.colour}
            value={hexOf(swatch.srgb)}
            className="size-(--touch-hit) cursor-pointer rounded-full border border-line bg-transparent"
            onChange={(event) => {
              const srgb = parseHex(event.currentTarget.value);
              if (srgb !== null) {
                setHex(event.currentTarget.value);
                set({ srgb });
              }
            }}
          />
        </label>
        <label className="flex min-h-(--touch-hit) items-center gap-2">
          <span className="text-touch-label text-fg-2">{w.hex}</span>
          <input
            data-testid="halo-palette-hex"
            aria-label={w.hex}
            value={hex}
            inputMode="text"
            className="w-28 rounded-touch border border-line bg-field px-2 py-1.5 text-[16px] text-fg"
            onChange={(event) => setHex(event.currentTarget.value)}
            onBlur={() => {
              const srgb = parseHex(hex);
              if (srgb !== null && hexOf(srgb) !== hexOf(swatch.srgb)) set({ srgb });
              else setHex(hexOf(swatch.srgb));
            }}
          />
        </label>
        <label className="flex min-h-(--touch-hit) min-w-0 flex-1 items-center gap-2">
          <span className="text-touch-label text-fg-2">{w.name}</span>
          <input
            data-testid="halo-palette-name"
            aria-label={w.name}
            value={name}
            className="min-w-0 flex-1 rounded-touch border border-line bg-field px-2 py-1.5 text-[16px] text-fg"
            onChange={(event) => setName(event.currentTarget.value)}
            onBlur={() => {
              if (name.trim() !== '' && name !== swatch.name) set({ name: name.trim() });
              else setName(swatch.name);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Segmented<'lambert' | 'blinn'>
          label={w.finish}
          data-testid="halo-palette-finish"
          value={swatch.shader}
          onValueChange={(shader) => set({ shader })}
          items={[
            { value: 'lambert', label: t.matte },
            { value: 'blinn', label: t.shiny },
          ]}
        />
        {swatch.shader === 'blinn' ? (
          <ValueChip
            label={w.gloss}
            value={swatch.glossiness}
            step={0.05}
            min={0}
            max={1}
            onCommit={(glossiness) => set({ glossiness })}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        <TouchButton onClick={() => run('select.mesh.bySwatch', { slot: swatch.slot })}>{w.selectFaces}</TouchButton>
        <TouchButton onClick={() => run('palette.assignMaterial', { shader: swatch.shader, srgb: [...swatch.srgb] })}>
          {w.newMaterial}
        </TouchButton>
        <TouchButton variant="danger" onClick={() => run('palette.removeSwatch', { swatch: swatch.id })}>
          {w.remove}
        </TouchButton>
      </div>
    </section>
  );
}

export default function PaletteSheet({ ctx }: HaloSheetProps): JSX.Element {
  const app = ctx.host.app;
  useAppVersion(app);
  const run = (op: string, args?: unknown): void => void ctx.run(op, args);
  const palette = currentPalette(app);
  const active = activeSwatch(app);
  const own =
    ctx.noun?.kind === 'swatch' && ctx.noun.id !== null
      ? app.store.get('swatches', ctx.noun.id as SwatchId)
      : undefined;
  const editing = own !== undefined && own.deleted === null ? own : active;
  const [rename, setRename] = useState<string | null>(null);
  const meshes = paintMeshes(app).filter((m) => m.source === null);
  const output = meshes[0]?.colourOutput ?? 'palette-texture';
  const palettes = app.store.list('palettes').filter((p) => p.deleted === null);
  return (
    <HaloSheet ctx={ctx} id="palette" title={palette === null ? w.title : `${w.title} · ${palette.name}`}>
      {palette === null ? (
        <TouchButton variant="primary" onClick={() => run('palette.ensureDefault')}>
          {t.usePalette}
        </TouchButton>
      ) : (
        <>
          {editing === null ? null : <SwatchEditor key={editing.id} swatch={editing} run={run} />}
          {editing !== null && active !== null && editing.id !== active.id ? (
            <div className="px-1 pt-2">
              <TouchButton
                data-testid="halo-palette-replace"
                onClick={() => run('mesh.paint.remap', { from: editing.slot, to: active.slot })}
              >
                {w.replaceWithActive}
              </TouchButton>
            </div>
          ) : null}
          <SheetGroup>{t.swatches}</SheetGroup>
          <div
            className="flex flex-wrap gap-2 px-1"
            role="group"
            aria-label={t.swatches}
            data-testid="halo-palette-swatches"
          >
            {swatchesOf(app, palette.id).map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                aria-label={t.swatch(swatch.name, swatch.id === active?.id)}
                aria-pressed={swatch.id === active?.id}
                className={`size-(--touch-hit) rounded-full border-2 ${swatch.id === active?.id ? 'border-fg' : 'border-white/40'}`}
                style={{ background: hexOf(swatch.srgb) }}
                onClick={() => run('palette.setActive', { swatch: swatch.id })}
              />
            ))}
            <TouchButton
              onClick={() =>
                run('palette.addSwatch', { palette: palette.id, srgb: [...(active?.srgb ?? [160, 160, 160])] })
              }
            >
              {t.addSwatch}
            </TouchButton>
          </div>
          <SheetGroup>{w.palettes}</SheetGroup>
          <div className="flex flex-col gap-2 px-1">
            {palettes.length > 1 ? (
              <Segmented<string>
                label={w.palettes}
                value={palette.id}
                onValueChange={(id) => {
                  const first = swatchesOf(app, id as never)[0];
                  if (first !== undefined) run('palette.setActive', { swatch: first.id });
                }}
                items={palettes.map((p) => ({ value: p.id, label: p.name }))}
              />
            ) : null}
            {rename === null ? null : (
              <input
                aria-label={w.name}
                value={rename}
                className="rounded-touch border border-line bg-field px-2 py-1.5 text-[16px] text-fg"
                onChange={(event) => setRename(event.currentTarget.value)}
                onBlur={() => {
                  if (rename.trim() !== '' && rename !== palette.name)
                    run('palette.rename', { palette: palette.id, name: rename.trim() });
                  setRename(null);
                }}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <TouchButton onClick={() => run('palette.create', { name: `Palette ${palettes.length + 1}` })}>
                {w.newPalette}
              </TouchButton>
              <TouchButton onClick={() => run('palette.duplicate', { palette: palette.id })}>{w.duplicate}</TouchButton>
              <TouchButton onClick={() => setRename(palette.name)}>{w.rename}</TouchButton>
              <TouchButton onClick={() => run('palette.assign', { palette: palette.id })}>{w.assign}</TouchButton>
            </div>
          </div>
          <SheetGroup>{w.colours}</SheetGroup>
          <div className="px-1">
            <Segmented<ColourOutput>
              label={w.colours}
              value={output}
              onValueChange={(colourOutput) => {
                for (const mesh of meshes) run('mesh.setAttributes', { mesh: mesh.id, patch: { colourOutput } });
              }}
              items={COLOUR_OUTPUTS}
            />
          </div>
        </>
      )}
    </HaloSheet>
  );
}
