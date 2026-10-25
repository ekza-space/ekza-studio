// The layer chip (ANIM-LAYERS-SPEC §5): in the Thread's row while Keys or Curves is open and the animation has layers
// above its base — "◧ Fixes" says which layer keys go into (and whose keys Keys and Curves show). A tap opens the
// chip's Halo: ⟨Weight⟩ (a value chip: scrub, one undo step), Mute · Solo · Lock, Merge down, Delete and *All layers*
// (the Layers sheet). At rest the Thread keeps its targets (§4.8): ◆ Key's hold says "Keying into: Fixes" instead.
import type { LayerId } from '@ekza-studio/doc';
import { Cluster, ToggleChip, ValueChip } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import { layerWords as w } from '../i18n/layers';
import type { HaloController } from '../shell/controller';
import { useDocumentVersion, useSessionValue } from '../shell/hooks';
import { useHaloStore } from '../shell/store';
import {
  activeRow,
  isLayered,
  layersClip,
  mergeCall,
  type OpCall,
  percentOf,
  pollReason,
  removeCall,
  setCall,
  weightCall,
} from './model';

const chipClass =
  'inline-flex h-(--touch-hit) min-w-(--touch-hit) shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-touch-inner px-2.5 text-touch font-medium text-fg-2 hover:bg-hover hover:text-fg active:bg-pressed data-open:bg-accent-soft data-open:text-fg aria-disabled:cursor-default aria-disabled:opacity-45';

/** The layers glyph (two stacked sheets). */
export function LayersGlyph({ size = 16 }: { readonly size?: number }): JSX.Element {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M8 2 14 5.2 8 8.4 2 5.2Z" strokeLinejoin="round" />
      <path d="m2 8.4 6 3.2 6-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Runs a call from the chip or its Halo: one touch, the poll's reason as a toast when it cannot run. */
export function runLayerCall(controller: HaloController, call: OpCall): void {
  const { ctx } = controller;
  ctx.store.set((s) => ({ touches: s.touches + 1 }));
  const reason = pollReason(ctx.app, call);
  if (reason !== null) {
    ctx.toasts.push({ key: 'layers', text: reason });
    return;
  }
  void ctx.run(call.op, call.args);
}

/** Opens the Layers sheet. */
export function openLayersSheet(controller: HaloController): void {
  controller.ctx.store.set((s) => ({
    sheet: 'layers',
    sheetArgs: null,
    sheetNoun: null,
    halo: null,
    focus: null,
    touches: s.touches + 1,
  }));
}

/** The chip itself; null at rest, without layers or without an animation. */
export function LayerChip({
  controller,
  open,
  onOpen,
}: {
  readonly controller: HaloController;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
}): JSX.Element | null {
  const { app, store } = controller.ctx;
  const threadLayer = useHaloStore(store, (s) => s.threadLayer);
  useDocumentVersion(app);
  useSessionValue(app, (s) => s.activeLayer);
  useSessionValue(app, (s) => s.activeClip);
  const clip = layersClip(app);
  if (threadLayer === 0 || clip === null || !isLayered(app, clip)) return null;
  const row = activeRow(app, clip);
  if (row === null) return null;
  return (
    <button
      type="button"
      className={chipClass}
      aria-label={w.chip(row.name)}
      data-testid="halo-layer-chip"
      data-layer={row.name}
      data-open={open ? '' : undefined}
      onClick={() => {
        store.set((s) => ({ touches: s.touches + 1 }));
        onOpen(!open);
      }}
    >
      <LayersGlyph />
      <span className="max-w-[9em] truncate">{row.name}</span>
      <span aria-hidden="true" className="text-[12px] text-fg-3">
        ▾
      </span>
    </button>
  );
}

/** The chip's Halo: weight, mute, solo, lock, merge down, delete and the sheet. */
export function LayerChipHalo({
  controller,
  onClose,
}: {
  readonly controller: HaloController;
  readonly onClose: () => void;
}): JSX.Element | null {
  const { app } = controller.ctx;
  useDocumentVersion(app);
  useSessionValue(app, (s) => s.activeLayer);
  const clip = layersClip(app);
  const row = clip === null ? null : activeRow(app, clip);
  if (clip === null || row === null) return null;
  const id: LayerId = row.id;
  const set = (fields: Parameters<typeof setCall>[1]): void => runLayerCall(controller, setCall(id, fields));
  const merge = mergeCall(id, 'down');
  const remove = removeCall(id);
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-layer-halo"
      role="menu"
      aria-label={row.name}
      className="pointer-events-auto flex flex-wrap items-center gap-1 p-[5px]"
    >
      {row.base ? null : (
        <ValueChip
          label={w.weight}
          value={percentOf(row.weight)}
          step={1}
          unit="%"
          min={0}
          max={100}
          data-testid="halo-layer-weight"
          onCommit={(value) => runLayerCall(controller, weightCall(id, value))}
        />
      )}
      <ToggleChip
        label={w.mute}
        pressed={row.mute}
        data-testid="halo-layer-mute"
        onPressedChange={(mute) => set({ mute })}
      />
      <ToggleChip
        label={w.solo}
        pressed={row.solo}
        data-testid="halo-layer-solo"
        onPressedChange={(solo) => set({ solo })}
      />
      <ToggleChip
        label={w.lock}
        pressed={row.locked}
        data-testid="halo-layer-lock"
        onPressedChange={(locked) => set({ locked })}
      />
      {row.base ? null : (
        <button
          type="button"
          role="menuitem"
          className={chipClass}
          data-testid="halo-layer-merge"
          aria-disabled={pollReason(app, merge) === null ? undefined : true}
          title={pollReason(app, merge) ?? undefined}
          onClick={() => {
            onClose();
            runLayerCall(controller, merge);
          }}
        >
          {w.mergeDown}
        </button>
      )}
      {row.base ? null : (
        <button
          type="button"
          role="menuitem"
          className={chipClass}
          data-testid="halo-layer-delete"
          onClick={() => {
            onClose();
            runLayerCall(controller, remove);
          }}
        >
          {w.remove}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={chipClass}
        data-testid="halo-layer-all"
        onClick={() => {
          onClose();
          openLayersSheet(controller);
        }}
      >
        {w.allLayers} ›
      </button>
    </Cluster>
  );
}
