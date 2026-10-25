// The Layers panel (ANIM-LAYERS-SPEC §5, ADR 0026): the active clip's animation layers in classic DCC form — the
// layers top-down with Base at the bottom; per row the name (double-click renames), the mode (Add / Over), the weight
// (field and slider, 0–1), M (mute), S (solo), the lock, and the active row highlighted (keys, the Dope Sheet and the
// Graph Editor go there; click a row to make it active). The toolbar: + (a new additive layer), *Adjust on a Layer*,
// Merge ▾ (down · all, at the keys · on every frame), duplicate, delete, up, down. Every change is one `layer.*` run,
// so each is one undo step. A lazy panel body (Windows › Layers).
import type { ClipId, LayerRecord } from '@ekza-studio/doc';
import { type EditorApp, editLayerOf, playingLayers, type SessionState } from '@ekza-studio/editor-core';
import { type JSX, type KeyboardEvent, useState } from 'react';
import { useDocQuery, useSession } from '../../hooks';
import { DuplicateIcon, PlusIcon, TrashIcon } from '../channels/kit/icons';
import { canRun, runUntypedOperator } from '../channels/kit/run';
import {
  BUTTON,
  EMPTY_STATE,
  INPUT,
  MUTED_TEXT,
  PANEL_ROOT,
  ROW_HOVER,
  ROW_SELECTED,
  TOOLBAR,
} from '../channels/kit/styles';
import type { PanelProps } from '../types';

const PANEL_KIND = 'layers';
const LAYER_TABLES = ['clips', 'layers', 'curves'] as const;

interface LayersView {
  readonly clip: ClipId | null;
  readonly clipName: string;
  readonly layers: readonly LayerRecord[];
  readonly playing: ReadonlySet<string>;
  readonly curves: ReadonlyMap<string, number>;
}

const selectActive = (s: SessionState) => (s.activeCharacter === null ? null : (s.activeClip[s.activeCharacter] ?? null));
const selectActiveLayer = (s: SessionState) => s.activeLayer;

function readLayers(app: EditorApp, clip: ClipId | null): LayersView {
  const record = clip === null ? undefined : app.store.get('clips', clip);
  if (clip === null || record === undefined) {
    return { clip: null, clipName: '', layers: [], playing: new Set(), curves: new Map() };
  }
  const layers = app.store.query.layersOfClip(clip);
  const curves = new Map<string, number>();
  for (const curve of app.store.query.curvesOfClip(clip)) curves.set(curve.layer, (curves.get(curve.layer) ?? 0) + 1);
  return {
    clip,
    clipName: record.name,
    layers,
    playing: new Set(playingLayers(layers).map((layer) => layer.id)),
    curves,
  };
}

const TOGGLE =
  'inline-flex h-5 w-5 items-center justify-center rounded-[3px] border border-line text-[10px] font-semibold ' +
  'text-fg-3 hover:text-fg aria-pressed:border-transparent aria-pressed:text-black';

export function LayersPanel({ app, instanceId }: PanelProps): JSX.Element {
  const clip = useSession(selectActive);
  useSession(selectActiveLayer);
  // `read` is a new function every render, so a session change (another clip, another active layer) re-reads too
  const data = useDocQuery((): LayersView => readLayers(app, clip), LAYER_TABLES);
  const active = data.clip === null ? undefined : editLayerOf(app, app.store, data.clip);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const run = (op: string, args?: unknown): void => void runUntypedOperator(app, PANEL_KIND, op, args);
  const top = [...data.layers].reverse();
  const isBase = (layer: LayerRecord): boolean => data.layers[0]?.id === layer.id;
  const activeId = active?.id ?? null;
  const activeIsBase = active === undefined || isBase(active);

  if (data.clip === null) {
    return (
      <div className={PANEL_ROOT} data-testid="layers-panel" data-instance={instanceId}>
        <div className={EMPTY_STATE}>No active clip</div>
      </div>
    );
  }
  const clipId = data.clip;
  const merge = (scope: 'down' | 'all', times: 'keys' | 'frames'): void => {
    setMergeOpen(false);
    run('layer.merge', { layer: scope === 'all' ? data.layers.at(-1)?.id : activeId, scope, times });
  };
  const onRowKey = (layer: LayerRecord, event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'F2') setRenaming(layer.id);
    else if ((event.key === 'Delete' || event.key === 'Backspace') && !isBase(layer)) run('layer.remove', { layer: layer.id });
    else if (event.key === 'Enter') run('layer.setActive', { layer: layer.id });
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className={PANEL_ROOT} data-testid="layers-panel" data-instance={instanceId}>
      <div className={TOOLBAR} role="toolbar" aria-label="Animation layers">
        <button
          type="button"
          className={BUTTON}
          title="New additive layer"
          aria-label="New layer"
          data-testid="layers-add"
          onClick={() => run('layer.add', { clip: clipId })}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={BUTTON}
          title="Fix this clip on a new additive layer “Fixes”"
          data-testid="layers-adjust"
          onClick={() => run('clip.adjustOnLayer', { clip: clipId })}
        >
          Adjust on a Layer
        </button>
        <div className="relative">
          <button
            type="button"
            className={BUTTON}
            aria-expanded={mergeOpen}
            disabled={data.layers.length < 2}
            data-testid="layers-merge"
            onClick={() => setMergeOpen(!mergeOpen)}
          >
            Merge ▾
          </button>
          {mergeOpen ? (
            <div
              role="menu"
              className="absolute top-6 left-0 z-10 flex min-w-44 flex-col rounded-[4px] border border-line bg-panel p-1 shadow-lg"
              data-testid="layers-merge-menu"
            >
              {(
                [
                  ['down', 'keys', 'Merge Down (at keys)'],
                  ['down', 'frames', 'Merge Down (every frame)'],
                  ['all', 'keys', 'Merge All (at keys)'],
                  ['all', 'frames', 'Merge All (every frame)'],
                ] as const
              ).map(([scope, times, label]) => (
                <button
                  key={`${scope}-${times}`}
                  type="button"
                  role="menuitem"
                  className={`${BUTTON} justify-start`}
                  disabled={
                    (scope === 'down' && activeIsBase) ||
                    !canRun(app, PANEL_KIND, 'layer.merge', {
                      layer: scope === 'all' ? data.layers.at(-1)?.id : activeId,
                      scope,
                      times,
                    })
                  }
                  data-testid={`layers-merge-${scope}-${times}`}
                  onClick={() => merge(scope, times)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          className={BUTTON}
          title="Move Layer Up"
          aria-label="Move layer up"
          disabled={activeIsBase || activeId === top[0]?.id}
          data-testid="layers-up"
          onClick={() => run('layer.reorder', { layer: activeId, to: 'up' })}
        >
          ▲
        </button>
        <button
          type="button"
          className={BUTTON}
          title="Move Layer Down"
          aria-label="Move layer down"
          disabled={activeIsBase || data.layers[1]?.id === activeId}
          data-testid="layers-down"
          onClick={() => run('layer.reorder', { layer: activeId, to: 'down' })}
        >
          ▼
        </button>
        <button
          type="button"
          className={BUTTON}
          title="Duplicate Layer"
          aria-label="Duplicate layer"
          disabled={activeId === null}
          data-testid="layers-duplicate"
          onClick={() => run('layer.duplicate', { layer: activeId })}
        >
          <DuplicateIcon />
        </button>
        <button
          type="button"
          className={BUTTON}
          title="Delete Layer"
          aria-label="Delete layer"
          disabled={activeIsBase}
          data-testid="layers-delete"
          onClick={() => run('layer.remove', { layer: activeId })}
        >
          <TrashIcon />
        </button>
      </div>
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-auto p-0" aria-label={`Layers of ${data.clipName}`}>
        {top.map((layer) => {
          const base = isBase(layer);
          const on = layer.id === activeId;
          const playing = data.playing.has(layer.id);
          return (
            <li
              key={layer.id}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- a row of a list box
              role="option"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className={`flex h-7 items-center gap-1.5 border-b border-line px-1.5 ${on ? ROW_SELECTED : ROW_HOVER} ${playing ? '' : 'opacity-60'}`}
              data-testid={`layers-row-${layer.name}`}
              data-active={on ? '' : undefined}
              onClick={() => {
                if (!on) run('layer.setActive', { layer: layer.id });
              }}
              onKeyDown={(event) => onRowKey(layer, event)}
              onDoubleClick={() => setRenaming(layer.id)}
            >
              <button
                type="button"
                className={TOGGLE}
                aria-pressed={layer.mute}
                aria-label={`Mute ${layer.name}`}
                title="Mute"
                style={layer.mute ? { background: 'var(--warning, #f5a524)' } : undefined}
                data-testid={`layers-mute-${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  run('layer.set', { layer: layer.id, mute: !layer.mute });
                }}
              >
                M
              </button>
              <button
                type="button"
                className={TOGGLE}
                aria-pressed={layer.solo}
                aria-label={`Solo ${layer.name}`}
                title="Solo"
                style={layer.solo ? { background: 'var(--success, #46a758)' } : undefined}
                data-testid={`layers-solo-${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  run('layer.set', { layer: layer.id, solo: !layer.solo });
                }}
              >
                S
              </button>
              <button
                type="button"
                className={TOGGLE}
                aria-pressed={layer.locked === true}
                aria-label={`Lock ${layer.name}`}
                title="Lock"
                style={layer.locked === true ? { background: 'var(--text-2, #c9ccd3)' } : undefined}
                data-testid={`layers-lock-${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  run('layer.set', { layer: layer.id, locked: !(layer.locked === true) });
                }}
              >
                🔒︎
              </button>
              {renaming === layer.id && !base ? (
                <RenameField
                  name={layer.name}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name !== null && name !== layer.name) run('layer.set', { layer: layer.id, name });
                  }}
                />
              ) : (
                <span className={`min-w-0 flex-1 truncate ${on ? 'font-semibold' : ''}`}>{layer.name}</span>
              )}
              <span className={`w-8 text-right text-[10px] ${MUTED_TEXT}`} title={base ? 'Base' : layer.mode}>
                {base ? 'Base' : layer.mode === 'additive' ? 'Add' : 'Over'}
              </span>
              {base ? (
                <span className="w-[118px]" />
              ) : (
                <Weight
                  value={layer.weight}
                  name={layer.name}
                  onCommit={(weight) => run('layer.set', { layer: layer.id, weight })}
                />
              )}
              <span className={`w-6 text-right text-[10px] ${MUTED_TEXT}`} title="Curves on this layer">
                {data.curves.get(layer.id) ?? 0}
              </span>
            </li>
          );
        })}
      </ul>
      <div className={`border-t border-line px-1.5 py-1 text-[11px] ${MUTED_TEXT}`} data-testid="layers-keying">
        Keys go into: <span className="text-fg">{active?.name ?? 'Base'}</span>
      </div>
    </div>
  );
}

function Weight({
  value,
  name,
  onCommit,
}: {
  readonly value: number;
  readonly name: string;
  readonly onCommit: (weight: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = (next: number): void => {
    setDraft(null);
    const clamped = Math.min(1, Math.max(0, Number.isFinite(next) ? next : value));
    if (clamped !== value) onCommit(Math.round(clamped * 1000) / 1000);
  };
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stops row activation while editing the weight
    <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={shown}
        aria-label={`Weight of ${name}`}
        className="w-16 accent-[var(--accent,#7c5cff)]"
        data-testid={`layers-weight-slider-${name}`}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
      />
      <input
        className={`${INPUT} w-[46px] text-right`}
        aria-label={`Weight value of ${name}`}
        data-testid={`layers-weight-${name}`}
        value={draft === null ? value.toFixed(2) : String(draft)}
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(Number(event.currentTarget.value));
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    </span>
  );
}

function RenameField({ name, onDone }: { readonly name: string; readonly onDone: (name: string | null) => void }) {
  const [text, setText] = useState(name);
  return (
    <input
      className={`${INPUT} min-w-0 flex-1`}
      aria-label="Layer name"
      data-testid="layers-rename"
      value={text}
      // biome-ignore lint/a11y/noAutofocus: the field the person double-clicked
      autoFocus
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={() => onDone(text.trim())}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') onDone(text.trim());
        if (event.key === 'Escape') onDone(null);
      }}
    />
  );
}

export { PANEL_KIND as LAYERS_PANEL_KIND };
