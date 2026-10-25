// The Thread at rest (STUDIO-TOUCH-SPEC §10.3, §4.8; T7, ST-KEY-1): ▶ · the time readout · the ruler · ● Rec · ◆ Key ·
// the labelled layer switch [Timeline │ Keys │ Curves] — eight targets. Tapping the readout expands the transport (start,
// previous key, −1 / +1 frame, next key, end, the four speeds, the range); holding ▶ offers repeat, once, ping-pong and
// backwards; ◆ Key keys the selection now (`KeyButton.tsx`), holding it offers which channels. On a phone the ruler
// takes a row of its own, ● Rec and ◆ Key keep their words, and the layer switch folds into one chip when the row
// would not fit (ST-KEY-5). Playback never fades or locks it (§4.7, C18). Every control is an operator run or the
// shell's own setting (Rec, the layer).
import type { LoopMode, PlaybackSpeed } from '@ekza-studio/editor-core';
import { Cluster, rovingIndex, Segmented, useLongPress } from '@ekza-studio/ui/touch';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { animateWords } from '../../i18n/animate';
import type { HaloController } from '../../shell/controller';
import { useDocumentVersion, useSessionValue } from '../../shell/hooks';
import { useHaloStore } from '../../shell/store';
import { AnimateGlyph, type AnimateIcon } from '../../stages/animate/icons';
import { sceneFps } from '../../stages/animate/model';
import { type AnimateUiStore, useAnimateUi } from '../../stages/animate/ui';
import { coachRecKey, KeyButton, KeyMenu } from './KeyButton';
import { currentFrame, threadContext, timeText } from './model';
import { ThreadStrip } from './ThreadStrip';

const w = animateWords.thread;

const LAYERS = [
  { value: '0', label: w.layers.timeline },
  { value: '1', label: w.layers.keys },
  { value: '2', label: w.layers.curves },
] as const;

const SPEEDS: readonly { readonly value: PlaybackSpeed; readonly label: string }[] = [
  { value: 'realtime', label: w.speeds.realtime },
  { value: 'every-frame', label: w.speeds['every-frame'] },
  { value: 'half', label: w.speeds.half },
  { value: 'double', label: w.speeds.double },
];

const LOOPS: readonly { readonly value: LoopMode; readonly label: string }[] = [
  { value: 'loop', label: w.loopModes.loop },
  { value: 'once', label: w.loopModes.once },
  { value: 'oscillate', label: w.loopModes.oscillate },
];

const tpClass =
  'inline-flex h-(--touch-hit) min-w-(--touch-hit) shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-touch-inner px-2.5 text-touch font-medium text-fg-2 hover:bg-hover hover:text-fg active:bg-pressed aria-pressed:bg-accent-soft aria-pressed:text-fg disabled:opacity-45';

function TransportButton(props: {
  readonly label: string;
  readonly icon?: AnimateIcon;
  readonly text?: string;
  readonly onPress: () => void;
  readonly testId?: string;
  readonly pressed?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      className={tpClass}
      aria-label={props.label}
      aria-pressed={props.pressed}
      data-testid={props.testId}
      onClick={props.onPress}
    >
      {props.icon === undefined ? null : <AnimateGlyph name={props.icon} />}
      {props.text === undefined ? null : <span className="tabular-nums">{props.text}</span>}
    </button>
  );
}

/** The expanded transport (§10.3), above the Thread. */
function Transport({
  controller,
  ui,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
}): JSX.Element {
  const { ctx } = controller;
  const speed = useSessionValue(ctx.app, (s) => s.time.speed);
  const range = useSessionValue(ctx.app, (s) => s.time.playbackRange);
  const count = (): void => ctx.store.set((s) => ({ touches: s.touches + 1 }));
  const run = (op: string, args?: unknown): void => {
    count();
    void ctx.run(op, args);
  };
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-thread-transport"
      className="pointer-events-auto flex flex-wrap items-center gap-1 p-[5px]"
    >
      <TransportButton label={w.start} icon="start" onPress={() => run('time.goToStart')} testId="halo-tp-start" />
      <TransportButton label={w.prevKey} icon="prevKey" onPress={() => run('time.prevKey')} testId="halo-tp-prev-key" />
      <TransportButton
        label={w.prevFrame}
        text="−1 f"
        onPress={() => run('time.step', { delta: -1 })}
        testId="halo-tp-prev"
      />
      <TransportButton
        label={w.nextFrame}
        text="+1 f"
        onPress={() => run('time.step', { delta: 1 })}
        testId="halo-tp-next"
      />
      <TransportButton label={w.nextKey} icon="nextKey" onPress={() => run('time.nextKey')} testId="halo-tp-next-key" />
      <TransportButton label={w.end} icon="end" onPress={() => run('time.goToEnd')} testId="halo-tp-end" />
      <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
      <Segmented<PlaybackSpeed>
        label={w.speed}
        data-testid="halo-tp-speed"
        value={speed}
        onValueChange={(next) => run('time.setSpeed', { speed: next })}
        items={SPEEDS}
      />
      <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
      <TransportButton
        label={w.clearRange}
        text={range === null ? w.range : w.clearRange}
        pressed={range !== null}
        testId="halo-tp-range"
        onPress={() => {
          if (range !== null) {
            run('time.setPlaybackRange', { range: null });
            return;
          }
          count();
          ui.set({ docked: { kind: 'playhead' }, transport: false });
        }}
      />
    </Cluster>
  );
}

/** ▶'s long-press menu: repeat, once, ping-pong, and backwards (§10.3). */
function PlayMenu({
  controller,
  ui,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
}): JSX.Element {
  const { ctx } = controller;
  const loop = useSessionValue(ctx.app, (s) => s.time.loop);
  const run = (op: string, args?: unknown): void => {
    ctx.store.set((s) => ({ touches: s.touches + 1 }));
    ui.set({ playMenu: false });
    void ctx.run(op, args);
  };
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-thread-play-menu"
      role="menu"
      className="pointer-events-auto flex flex-wrap items-center gap-1 p-[5px]"
    >
      {LOOPS.map((item) => (
        <button
          key={item.value}
          type="button"
          role="menuitemradio"
          aria-checked={loop === item.value}
          className={tpClass}
          onClick={() => run('time.setLoop', { loop: item.value })}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className={tpClass}
        onClick={() => run('time.togglePlay', { direction: -1 })}
      >
        {w.backwards}
      </button>
    </Cluster>
  );
}

function PlayButton({
  controller,
  ui,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
}): JSX.Element {
  const { ctx } = controller;
  const playing = useSessionValue(ctx.app, (s) => s.time.playing);
  const press = useLongPress({
    onTap: () => {
      ctx.store.set((s) => ({ touches: s.touches + 1 }));
      void ctx.run('time.togglePlay');
    },
    onLongPress: () => {
      ctx.store.set((s) => ({ touches: s.touches + 1 }));
      ui.set({ playMenu: !ui.get().playMenu, transport: false });
    },
  });
  return (
    <button
      type="button"
      className={`${tpClass} text-fg`}
      aria-label={`${playing ? w.pause : w.play}. ${w.playHint}`}
      data-testid="halo-thread-play"
      data-playing={playing ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void ctx.run('time.togglePlay');
        }
      }}
      {...press}
    >
      <AnimateGlyph name={playing ? 'pause' : 'play'} />
    </button>
  );
}

function Readout({
  controller,
  ui,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
}): JSX.Element {
  const { ctx } = controller;
  const { app } = ctx;
  useSessionValue(app, (s) => s.time.sceneFrame);
  useDocumentVersion(app);
  const expanded = useAnimateUi(ui, (s) => s.transport);
  const thread = threadContext(app);
  const units = useAnimateUi(ui, (s) => s.units);
  const text =
    thread === null ? timeText(0, sceneFps(app), units) : timeText(currentFrame(app, thread), thread.fps, units);
  return (
    <button
      type="button"
      className={`${tpClass} min-w-[84px] text-fg tabular-nums`}
      aria-label={w.readout(text)}
      aria-expanded={expanded}
      data-testid="halo-thread-readout"
      onClick={() => {
        ctx.store.set((s) => ({ touches: s.touches + 1 }));
        ui.set({ transport: !expanded, playMenu: false });
      }}
    >
      {text}
    </button>
  );
}

function RecChip({ controller }: { readonly controller: HaloController }): JSX.Element {
  const { store } = controller.ctx;
  const rec = useHaloStore(store, (s) => s.rec);
  return (
    <button
      type="button"
      className={`${tpClass} ${rec ? 'text-fg' : ''}`}
      aria-pressed={rec}
      aria-label={rec ? w.recOn : w.recOff}
      data-testid="halo-thread-rec"
      onClick={() => {
        store.set((s) => ({ rec: !s.rec, touches: s.touches + 1 }));
        coachRecKey(controller);
      }}
    >
      <span
        aria-hidden="true"
        className={`size-3 rounded-full ${rec ? 'bg-[var(--autokey,#e5484d)]' : 'border-2 border-[var(--text-3)]'}`}
      />
      {/* the word stays on a phone too: ● Rec and ◆ Key side by side (ST-KEY-1) */}
      <span>{w.rec}</span>
    </button>
  );
}

type LayerValue = '0' | '1' | '2';

/** The layer switch's items: at rest Keys · Curves (the Thread is the timeline), Timeline joins while one is open. */
function layerItems(layer: 0 | 1 | 2): readonly (typeof LAYERS)[number][] {
  return layer === 0 ? LAYERS.slice(1) : LAYERS;
}

const switchClass = 'inline-flex shrink-0 items-center gap-0.5 rounded-touch bg-field p-0.5';
const segmentClass =
  'inline-flex min-h-(--touch-hit) min-w-(--touch-hit) cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-touch-inner px-3 text-touch font-medium text-fg-2 transition-colors duration-(--motion-hover) hover:text-fg data-on:bg-pressed data-on:text-fg data-on:shadow-[0_1px_3px_rgba(0,0,0,0.35)]';

/**
 * The labelled layer switch (§10.3, ST-KEY-5): a radio group of the Thread's layers — at rest *Keys · Curves* (the
 * Thread itself is the timeline, so the at-rest row keeps seven targets with ◆ Key), and *Timeline · Keys · Curves*
 * while Keys or Curves is open (one tap back). Each layer is one tap, as before; arrows move between them.
 */
function LayerSwitch({ controller, compact }: { readonly controller: HaloController; readonly compact: boolean }) {
  const { store } = controller.ctx;
  const layer = useHaloStore(store, (s) => s.threadLayer);
  const items = layerItems(layer);
  const choose = (value: LayerValue): void => {
    if (Number(value) === layer) return;
    store.set((s) => ({ threadLayer: Number(value) as 0 | 1 | 2, touches: s.touches + 1 }));
  };
  const focusable = Math.max(
    0,
    items.findIndex((item) => Number(item.value) === layer),
  );
  return (
    <div role="radiogroup" aria-label={w.layer} data-testid="halo-thread-layer" className={switchClass}>
      {items.map((item, index) => {
        const on = Number(item.value) === layer;
        return (
          <button
            key={item.value}
            type="button"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a 44 pt segment, as the touch kit's `Segmented` draws
            role="radio"
            aria-checked={on}
            aria-label={compact ? item.label : undefined}
            tabIndex={index === focusable ? 0 : -1}
            data-on={on ? '' : undefined}
            data-testid={`halo-thread-layer-${item.value}`}
            className={segmentClass}
            onClick={() => choose(item.value)}
            onKeyDown={(e) => {
              const next = rovingIndex(index, e.key, items.length);
              const target = next === null ? undefined : items[next];
              if (target === undefined) return;
              e.preventDefault();
              choose(target.value);
              const group = e.currentTarget.parentElement;
              requestAnimationFrame(() =>
                group?.querySelector<HTMLElement>(`[data-testid="halo-thread-layer-${target.value}"]`)?.focus(),
              );
            }}
          >
            {compact ? item.label.slice(0, 1) : item.label}
          </button>
        );
      })}
    </div>
  );
}

/** The layer switch folded into one chip (a phone row that would not fit, ST-KEY-5): its name; a tap lists all three. */
function LayerChip({
  controller,
  open,
  onOpen,
}: {
  readonly controller: HaloController;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
}): JSX.Element {
  const { store } = controller.ctx;
  const layer = useHaloStore(store, (s) => s.threadLayer);
  const name = LAYERS[layer]?.label ?? w.layers.timeline;
  return (
    <button
      type="button"
      className={`${tpClass} ${open ? 'bg-accent-soft text-fg' : ''}`}
      aria-label={w.layerChip(name)}
      data-testid="halo-thread-layer-chip"
      data-open={open ? '' : undefined}
      onClick={() => {
        store.set((s) => ({ touches: s.touches + 1 }));
        onOpen(!open);
      }}
    >
      <span>{name}</span>
      <span aria-hidden="true" className="text-[12px] text-fg-3">
        ▾
      </span>
    </button>
  );
}

/** The folded chip's list: Timeline · Keys · Curves, one tap each. */
function LayerMenu({ controller, onClose }: { readonly controller: HaloController; readonly onClose: () => void }) {
  const { store } = controller.ctx;
  const layer = useHaloStore(store, (s) => s.threadLayer);
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-thread-layer-menu"
      role="menu"
      aria-label={w.layer}
      className="pointer-events-auto flex flex-wrap items-center gap-1 p-[5px]"
    >
      {LAYERS.map((item) => (
        <button
          key={item.value}
          type="button"
          role="menuitemradio"
          aria-checked={String(layer) === item.value}
          className={tpClass}
          onClick={() => {
            onClose();
            store.set((s) => ({ threadLayer: Number(item.value) as 0 | 1 | 2, touches: s.touches + 1 }));
          }}
        >
          {item.label}
        </button>
      ))}
    </Cluster>
  );
}

/** A phone's layer segment (one letter: a 44 pt target and the 2 px gap after it) and the switch's padding less one
 *  gap (CSS px), as `LayerSwitch` draws them: three segments are 140 px, two 94 px. */
const SEGMENT_PX = 46;
const SWITCH_CHROME_PX = 2;

/**
 * Whether the layer switch folds into one chip (ST-KEY-5): on a phone, when the row's controls (everything but the
 * ruler, which has a row of its own there) and a switch of `segments` would not fit on one line. ▶, ● Rec and ◆ Key are
 * measured; the switch is computed, so the answer does not depend on which form shows.
 */
function useFoldLayers(row: HTMLDivElement | null, compact: boolean, segments: number): boolean {
  const [room, setRoom] = useState<{ readonly inner: number; readonly others: number } | null>(null);
  useEffect(() => {
    if (row === null || !compact || typeof ResizeObserver === 'undefined') return undefined;
    const check = (): void => {
      const style = getComputedStyle(row);
      const inner = row.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const others = [...row.children].filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && !/^halo-thread-(ruler|layer|layer-chip)$/.test(el.dataset['testid'] ?? ''),
      );
      // each control and the gap after it, then the switch
      const width = others.reduce((sum, el) => sum + el.offsetWidth + gap, 0);
      setRoom((prev) => (prev?.inner === inner && prev.others === width ? prev : { inner, others: width }));
    };
    // the observer reports the row's first size too
    const observer = new ResizeObserver(check);
    observer.observe(row);
    return () => observer.disconnect();
  }, [row, compact]);
  if (!compact || room === null) return false;
  return room.inner + 0.5 < room.others + SWITCH_CHROME_PX + SEGMENT_PX * segments;
}

/** The Thread: its rest row, with the transport, ▶'s menu, ◆ Key's menu or the layer list above it when open. */
export function Thread({
  controller,
  ui,
  compact,
  before,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
  readonly compact: boolean;
  /** Content of the row before ▶ (nothing on wide containers). */
  readonly before?: ReactNode;
}): JSX.Element {
  const { store } = controller.ctx;
  const layer = useHaloStore(store, (s) => s.threadLayer);
  const transport = useAnimateUi(ui, (s) => s.transport);
  const playMenu = useAnimateUi(ui, (s) => s.playMenu);
  // ◆ Key's menu or the folded layer list: one menu at a time above the row
  const [menu, setMenu] = useState<'key' | 'layer' | null>(null);
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const fold = useFoldLayers(row, compact, layerItems(layer).length);
  // the transport or ▶'s menu opening closes it (adjusted while rendering, React's derived-state pattern)
  const other = transport || playMenu;
  const [otherBefore, setOtherBefore] = useState(other);
  if (other !== otherBefore) {
    setOtherBefore(other);
    if (other) setMenu(null);
  }
  const keyMenu = menu === 'key';
  const layerMenu = menu === 'layer' && fold;
  const openKeyMenu = (open: boolean): void => setMenu(open ? 'key' : null);
  const openLayerMenu = (open: boolean): void => {
    setMenu(open ? 'layer' : null);
    if (open) ui.set({ transport: false, playMenu: false });
  };
  return (
    <div className="flex flex-col items-stretch gap-2">
      {transport ? <Transport controller={controller} ui={ui} /> : null}
      {playMenu ? <PlayMenu controller={controller} ui={ui} /> : null}
      {keyMenu ? <KeyMenu controller={controller} ui={ui} onClose={() => setMenu(null)} /> : null}
      {layerMenu ? <LayerMenu controller={controller} onClose={() => setMenu(null)} /> : null}
      <Cluster
        ref={setRow}
        data-halo-chrome=""
        data-testid="halo-thread"
        data-folded={fold ? '' : undefined}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of controls, not a form (<fieldset>)
        role="group"
        aria-label={w.region}
        className="pointer-events-auto flex w-full flex-wrap items-center gap-1 p-[5px]"
      >
        {before}
        <PlayButton controller={controller} ui={ui} />
        {compact ? null : <Readout controller={controller} ui={ui} />}
        <ThreadStrip controller={controller} ui={ui} row={compact} />
        <RecChip controller={controller} />
        <KeyButton controller={controller} ui={ui} menu={keyMenu} onMenu={openKeyMenu} />
        {fold ? (
          <LayerChip controller={controller} open={layerMenu} onOpen={openLayerMenu} />
        ) : (
          <LayerSwitch controller={controller} compact={compact} />
        )}
      </Cluster>
    </div>
  );
}
