// The Inset / Bevel value handle (STUDIO-TOUCH-SPEC §9 J2 step 3 "drag the bevel handle", §11; T8): after an Inset or
// a Bevel whose result is still selected, one 44 pt handle sits beside the result; dragging it sideways changes the
// operation's value (Inset's offset, Bevel's amount) — the path Studio Pro's value handle takes: a card preview from
// the pre-op mesh while the finger moves (`beginCardPreview`), then one `edit.adjustLast` on release, so the step is
// replaced, never added. The Thumb key's *Fine* scales the drag ×0.1. Outside the pane: a finger on it never orbits.
import type { ParamDef } from '@ekza-studio/anim-core';
import type { MeshId } from '@ekza-studio/doc';
import { beginCardPreview, type CardPreview, clampParamValue, paramSliderRate } from '@ekza-studio/editor-core';
import { type Point, thumbReduce } from '@ekza-studio/ui/touch';
import { type JSX, useEffect, useRef, useState } from 'react';
import { chipLabel } from '../../chips/EchoChips';
import { makeWords } from '../../i18n/make';
import { currentRow, meaningsOf } from '../../input/situation';
import type { ShellContext } from '../../shell/context';
import { useSessionValue } from '../../shell/hooks';
import { PANE } from '../../shell/stage';
import { useHaloStore } from '../../shell/store';
import { selectionCentroid } from './geometry';
import { touch } from './kit';
import { nearPoint, useProjected } from './useProjected';

/** The value each operation's handle edits (Studio Pro's `VALUE_HANDLE_OPS`). */
export const VALUE_PARAMS: Readonly<Record<string, string>> = { 'mesh.inset': 'offset', 'mesh.bevel': 'fraction' };
/** The handle sits this far to the right of the result's centre. */
const OFFSET_PX = 88;
const SIZE = 52;
const SLOP = { touch: 10, pen: 4, mouse: 3 } as const;

interface ValueRun {
  readonly op: string;
  readonly param: ParamDef;
  readonly mesh: MeshId;
  readonly value: number;
}

/** The live Inset or Bevel whose result is still selected, with its value; else null. */
export function valueRun(ctx: ShellContext): ValueRun | null {
  const s = ctx.app.session.getState();
  const last = s.lastRun;
  if (last === null || last.closed !== null || !last.adjustable) return null;
  const name = VALUE_PARAMS[last.id];
  const mesh = last.targets[0];
  if (name === undefined || mesh === undefined || !s.model.hilite.includes(mesh)) return null;
  if (last.kind === null || s.model.componentMode !== last.kind) return null;
  const param = last.params.find((p) => p.name === name);
  const value = last.args[name];
  if (param === undefined || typeof value !== 'number') return null;
  return { op: last.id, param, mesh, value };
}

/** Where the value handle sits now (pane px), or null. */
export function handleAt(ctx: ShellContext): Point | null {
  const run = valueRun(ctx);
  const vm = ctx.vm();
  if (run === null || vm === null) return null;
  const centre = selectionCentroid(ctx.app, run.mesh);
  if (centre === null) return null;
  const p = vm.project(PANE, centre);
  return p === null ? null : { x: p.x + OFFSET_PX, y: p.y };
}

interface Drag {
  readonly id: number;
  readonly start: Point;
  readonly run: ValueRun;
  readonly speed: number;
  readonly slop: number;
  preview: CardPreview | null;
  lastX: number;
  raw: number;
  value: number;
  moved: boolean;
}

export function ValueHandle({ ctx }: { readonly ctx: ShellContext }): JSX.Element | null {
  const last = useSessionValue(ctx.app, (s) => s.lastRun);
  const breathing = useHaloStore(ctx.store, (s) => s.breathing);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const live = last !== null && last.closed === null && VALUE_PARAMS[last.id] !== undefined;
  const at = useProjected(live, () => handleAt(ctx), nearPoint);
  useEffect(() => () => drag.current?.preview?.cancel(), []);
  const run = live ? valueRun(ctx) : null;
  if (at === null || run === null || (breathing && !dragging)) return null;

  const end = (commit: boolean): void => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    ctx.store.set({ breathing: false });
    if (d === null || !d.moved) return;
    if (!commit || d.value === d.run.value) {
      d.preview?.cancel();
      return;
    }
    void ctx.run('edit.adjustLast', { args: { [d.run.param.name]: d.value } });
    const thumb = ctx.store.get().thumb;
    if (thumb.latch === 'once') ctx.store.set({ thumb: thumbReduce(thumb, { type: 'consume' }) });
  };

  const label = chipLabel(run.param);
  return (
    <button
      type="button"
      data-halo-chrome=""
      data-testid="halo-value-handle"
      data-param={run.param.name}
      aria-label={makeWords.handles.value(label.toLowerCase())}
      className="pointer-events-auto absolute flex touch-none items-center justify-center rounded-full border-2 border-white bg-accent-fill text-on-accent shadow-touch select-none"
      style={{ left: at.x - SIZE / 2, top: at.y - SIZE / 2, width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        if (drag.current !== null || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const type = e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse';
        const row = ctx.store.get().thumb.latch === 'off' ? null : currentRow(ctx.app, ctx.store);
        const fine = row !== null && meaningsOf(row, ctx.store.get().thumbPick).drag?.id === 'fine';
        drag.current = {
          id: e.pointerId,
          start: { x: e.clientX, y: e.clientY },
          run,
          speed: fine ? 0.1 : 1,
          slop: SLOP[type],
          preview: null,
          lastX: e.clientX,
          raw: run.value,
          value: run.value,
          moved: false,
        };
        touch(ctx);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d === null || e.pointerId !== d.id) return;
        if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < d.slop) return;
        if (!d.moved) {
          d.moved = true;
          d.lastX = e.clientX;
          try {
            d.preview = beginCardPreview(ctx.app);
          } catch {
            d.preview = null;
          }
          setDragging(true);
          ctx.store.set({ breathing: true });
          return;
        }
        const rates = ctx.app.prefs.getState().virtualSlider;
        d.raw += (e.clientX - d.lastX) * paramSliderRate(d.run.param, rates) * d.speed;
        d.lastX = e.clientX;
        d.value = clampParamValue(d.run.param, d.raw).value as number;
        if (d.preview !== null && !d.preview.slow) d.preview.update({ [d.run.param.name]: d.value });
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) end(true);
      }}
      onPointerCancel={(e) => {
        if (drag.current?.id === e.pointerId) end(false);
      }}
      onLostPointerCapture={(e) => {
        if (drag.current?.id === e.pointerId) end(true);
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
      >
        <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
