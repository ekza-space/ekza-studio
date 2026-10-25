// The Layers sheet (ANIM-LAYERS-SPEC §5): the active animation's layers, top first, Base at the bottom. A row's tap
// makes it the layer keys go into; each row has ⟨Weight⟩ (scrub, one undo step), Mute · Solo · Lock and ⋯ (Rename,
// Duplicate, Up, Down, Delete). The header adds a fix layer (*Adjust on a layer*: additive "Fixes") or a replacing
// layer, and merges (down or all; at the keys or on every frame). A lazy chunk (§20.6), on the T6b sheet contract;
// the same operators as Studio Pro's Layers panel.
import { ToggleChip, TouchButton, ValueChip } from '@ekza-studio/ui/touch';
import { type JSX, useState } from 'react';
import { layerWords as w } from '../i18n/layers';
import type { HaloSheetProps } from '../manifest/sheets';
import { HaloSheet, useAppVersion } from '../sheets/more/kit';
import {
  activateCall,
  addCall,
  adjustCall,
  duplicateCall,
  type LayerRow,
  layerRows,
  layersClip,
  mergeCall,
  moveCall,
  type OpCall,
  percentOf,
  pollReason,
  removeCall,
  setCall,
  weightCall,
} from './model';

export default function LayersSheet({ ctx }: HaloSheetProps): JSX.Element {
  const app = ctx.host.app;
  useAppVersion(app);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const clipId = layersClip(app);
  const clip = clipId === null ? undefined : app.store.get('clips', clipId);
  const rows = clipId === null ? [] : [...layerRows(app, clipId)].reverse();
  const run = (call: OpCall): void => {
    ctx.touch?.();
    void ctx.run(call.op, call.args);
  };
  const active = rows.find((row) => row.active) ?? null;
  return (
    <HaloSheet
      ctx={ctx}
      id="layers"
      title={clip === undefined ? w.layers : w.sheetTitle(clip.name)}
      description={rows.length <= 1 ? w.onlyBase : active === null ? undefined : w.keyingInto(active.name)}
    >
      <div className="flex flex-col gap-2 pb-2" data-testid="halo-layers">
        {clipId === null ? null : (
          <div className="flex flex-wrap items-center gap-2" data-testid="halo-layers-header">
            <TouchButton data-testid="halo-layers-adjust" onClick={() => run(adjustCall(clipId))}>
              {w.adjust}
            </TouchButton>
            <TouchButton data-testid="halo-layers-add-override" onClick={() => run(addCall(clipId, 'override'))}>
              {w.newReplace}
            </TouchButton>
            {rows.length > 1 ? (
              <TouchButton
                data-testid="halo-layers-merge"
                aria-expanded={merging}
                onClick={() => {
                  ctx.touch?.();
                  setMerging(!merging);
                }}
              >
                {w.mergeMenu} ▾
              </TouchButton>
            ) : null}
          </div>
        )}
        {merging && active !== null ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="halo-layers-merge-menu">
            {(
              [
                ['down', 'keys'],
                ['down', 'frames'],
                ['all', 'keys'],
                ['all', 'frames'],
              ] as const
            ).map(([scope, times]) => {
              const layer = scope === 'down' ? active.id : (rows[0]?.id ?? active.id);
              const call = mergeCall(layer, scope, times);
              const reason = pollReason(app, call);
              return (
                <TouchButton
                  key={`${scope}-${times}`}
                  data-testid={`halo-layers-merge-${scope}-${times}`}
                  disabled={reason !== null}
                  title={reason ?? undefined}
                  onClick={() => {
                    setMerging(false);
                    run(call);
                  }}
                >
                  {scope === 'down' ? w.mergeDown : w.mergeAll} · {times === 'keys' ? w.mergeKeys : w.mergeFrames}
                </TouchButton>
              );
            })}
          </div>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="halo-layers-rows">
          {rows.map((row) => (
            <li key={row.id}>
              <Row
                row={row}
                last={row.index === rows.length - 1}
                menuOpen={menu === row.id}
                renaming={renaming === row.id}
                onActivate={() => run(activateCall(row.id))}
                onSet={(fields) => run(setCall(row.id, fields))}
                onWeight={(percent) => run(weightCall(row.id, percent))}
                onMenu={() => {
                  ctx.touch?.();
                  setMenu(menu === row.id ? null : row.id);
                }}
                onRow={(call) => {
                  setMenu(null);
                  run(call);
                }}
                onRename={(name) => {
                  setRenaming(null);
                  if (name !== null && name !== row.name) run(setCall(row.id, { name }));
                }}
                onStartRename={() => {
                  setMenu(null);
                  setRenaming(row.id);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </HaloSheet>
  );
}

/** Focuses the rename field the person just asked for (once, when it mounts). */
const focusOnce = (input: HTMLInputElement | null): void => {
  if (input !== null && document.activeElement !== input) input.focus();
};

function Row({
  row,
  last,
  menuOpen,
  renaming,
  onActivate,
  onSet,
  onWeight,
  onMenu,
  onRow,
  onRename,
  onStartRename,
}: {
  readonly row: LayerRow;
  readonly last: boolean;
  readonly menuOpen: boolean;
  readonly renaming: boolean;
  readonly onActivate: () => void;
  readonly onSet: (fields: Parameters<typeof setCall>[1]) => void;
  readonly onWeight: (percent: number) => void;
  readonly onMenu: () => void;
  readonly onRow: (call: OpCall) => void;
  readonly onRename: (name: string | null) => void;
  readonly onStartRename: () => void;
}): JSX.Element {
  const [name, setName] = useState(row.name);
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-touch border px-2 py-1.5 ${row.active ? 'border-accent/70 bg-accent-soft' : 'border-line bg-panel'}`}
      data-testid={`halo-layer-row-${row.name}`}
      data-active={row.active ? '' : undefined}
      data-playing={row.playing ? '' : undefined}
    >
      <div className="flex items-center gap-2">
        {renaming ? (
          <input
            className="h-(--touch-hit) min-w-0 flex-1 rounded-touch-inner border border-line bg-field px-2 text-touch text-fg"
            aria-label={w.renameLabel}
            data-testid="halo-layer-rename"
            value={name}
            ref={focusOnce}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(name.trim());
              if (e.key === 'Escape') onRename(null);
            }}
            onBlur={() => onRename(name.trim())}
          />
        ) : (
          <button
            type="button"
            className="flex h-(--touch-hit) min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-touch text-fg"
            aria-pressed={row.active}
            aria-label={row.active ? `${row.name}, ${w.active}` : `${row.name}, ${w.keyHere}`}
            data-testid={`halo-layer-activate-${row.name}`}
            onClick={onActivate}
          >
            <span className="truncate font-medium">{row.name}</span>
            {row.base ? null : <span className="text-[12px] text-fg-3">{w.modes[row.mode]}</span>}
            {row.active ? <span className="text-[12px] text-accent">◆ {w.active}</span> : null}
          </button>
        )}
        {row.base ? null : (
          <button
            type="button"
            className="inline-flex size-(--touch-hit) cursor-pointer items-center justify-center rounded-touch-inner text-fg-2 hover:bg-hover"
            aria-label={w.rowMenu(row.name)}
            aria-expanded={menuOpen}
            data-testid={`halo-layer-menu-${row.name}`}
            onClick={onMenu}
          >
            ⋯
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.base ? null : (
          <ValueChip
            label={w.weight}
            value={percentOf(row.weight)}
            step={1}
            unit="%"
            min={0}
            max={100}
            data-testid={`halo-layer-weight-${row.name}`}
            onCommit={onWeight}
          />
        )}
        <ToggleChip
          label={w.mute}
          pressed={row.mute}
          data-testid={`halo-layer-mute-${row.name}`}
          onPressedChange={(mute) => onSet({ mute })}
        />
        <ToggleChip
          label={w.solo}
          pressed={row.solo}
          data-testid={`halo-layer-solo-${row.name}`}
          onPressedChange={(solo) => onSet({ solo })}
        />
        <ToggleChip
          label={w.lock}
          pressed={row.locked}
          data-testid={`halo-layer-lock-${row.name}`}
          onPressedChange={(locked) => onSet({ locked })}
        />
      </div>
      {menuOpen ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`halo-layer-row-menu-${row.name}`}>
          <TouchButton onClick={onStartRename}>{w.rename}</TouchButton>
          <TouchButton onClick={() => onRow(duplicateCall(row.id))}>{w.duplicate}</TouchButton>
          {last ? null : <TouchButton onClick={() => onRow(moveCall(row.id, 'up'))}>{w.up}</TouchButton>}
          {row.index > 1 ? <TouchButton onClick={() => onRow(moveCall(row.id, 'down'))}>{w.down}</TouchButton> : null}
          <TouchButton onClick={() => onRow(mergeCall(row.id, 'down'))}>{w.mergeDown}</TouchButton>
          <TouchButton data-testid={`halo-layer-delete-${row.name}`} onClick={() => onRow(removeCall(row.id))}>
            {w.remove}
          </TouchButton>
        </div>
      ) : null}
    </div>
  );
}
