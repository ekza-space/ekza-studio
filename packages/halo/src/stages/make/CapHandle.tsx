// The extrude cap handle (STUDIO-TOUCH-SPEC §4.2 B, §11, §5.5; T8, prototyped first — ST-T8-1): after *Pull* an open
// extrude session shows one big handle on the cap's projected normal; dragging it changes the distance. It drives the
// session's own absorb gesture (`app.extrude.beginAbsorb`, the path Studio Pro's Z arrow takes): each drag previews
// from the pre-op mesh and commits one `edit.adjustLast`, so the session keeps its args stack, its zero-drop and its
// one undo step per drag. The Thumb key's drag meaning is read at the drag's start: *Smart* (✦, Pro's Shift at drag
// start) begins a new extrude from the cap (`beginSmartExtrude`), *Fine* scales the drag ×0.1. A 44 pt target in the
// frame, outside the pane: a finger on it never orbits, and the pane never sees it.
import type { AbsorbGesture, EditorApp } from '@ekza-studio/editor-core';
import { beginSmartExtrude } from '@ekza-studio/editor-core';
import { type Point, thumbReduce } from '@ekza-studio/ui/touch';
import { type JSX, useEffect, useRef, useState } from 'react';
import { en } from '../../i18n/en';
import { currentRow, meaningsOf } from '../../input/situation';
import type { ShellContext } from '../../shell/context';
import { useSessionValue } from '../../shell/hooks';
import { PANE } from '../../shell/stage';
import { useHaloStore } from '../../shell/store';
import { type CapGeometry, capDistance, capGeometry } from './geometry';
import { nearPoint, useProjected } from './useProjected';

/** A drag starts after this much travel (§5.4: a finger's slop; the pen's and the mouse's are smaller). */
const SLOP = { touch: 10, pen: 4, mouse: 3 } as const;
/** The handle's size: above the 44 pt minimum, so a fingertip finds it at arm's length. */
const SIZE = 52;

interface Drag {
  readonly id: number;
  readonly start: Point;
  readonly cap: CapGeometry;
  readonly smart: boolean;
  readonly speed: number;
  readonly slop: number;
  gesture: AbsorbGesture | null;
  moved: boolean;
}

/** What the Thumb key's drag line means now in the cap row (`smart`, `fine` or null). */
function dragMeaning(ctx: ShellContext): string | null {
  const ui = ctx.store.get();
  if (ui.thumb.latch === 'off') return null;
  const row = currentRow(ctx.app, ctx.store);
  if (row === null) return null;
  return meaningsOf(row, ui.thumbPick).drag?.id ?? null;
}

function project(ctx: ShellContext): ((p: readonly [number, number, number]) => Point | null) | null {
  const vm = ctx.vm();
  if (vm === null) return null;
  return (p) => vm.project(PANE, p);
}

/** The cap on screen now, or null. */
export function capNow(ctx: ShellContext): CapGeometry | null {
  const proj = project(ctx);
  return proj === null ? null : capGeometry(ctx.app, proj);
}

function begin(app: EditorApp, smart: boolean): AbsorbGesture | null {
  return smart ? beginSmartExtrude(app, { panel: 'viewport', paneId: PANE }) : app.extrude.beginAbsorb('move', 'component');
}

export function CapHandle({ ctx }: { readonly ctx: ShellContext }): JSX.Element | null {
  const session = useSessionValue(ctx.app, (s) => s.model.extrudeSession);
  const breathing = useHaloStore(ctx.store, (s) => s.breathing);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  // the cap follows the camera and the drag: measured every frame while a session is open
  const cap = useProjected(
    session !== null,
    () => capNow(ctx),
    (a, b) => nearPoint(a?.handle ?? null, b?.handle ?? null) && nearPoint(a?.at ?? null, b?.at ?? null),
  );
  useEffect(() => () => drag.current?.gesture?.cancel(), []);
  if (session === null || cap === null || (breathing && !dragging)) return null;
  const angle = (Math.atan2(cap.dir.y, cap.dir.x) * 180) / Math.PI + 90;

  const end = (commit: boolean): void => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    ctx.store.set({ breathing: false });
    if (d === null) return;
    if (commit && d.moved) d.gesture?.commit();
    else d.gesture?.cancel();
    if (d.moved) {
      // the drag used the Thumb key's drag meaning: a `once` latch turns off (§5.5)
      const thumb = ctx.store.get().thumb;
      if (thumb.latch === 'once') ctx.store.set({ thumb: thumbReduce(thumb, { type: 'consume' }) });
    }
  };

  return (
    <div
      data-halo-chrome=""
      data-testid="halo-cap"
      className="pointer-events-none absolute inset-0"
      style={dragging ? { zIndex: 1 } : undefined}
    >
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        <line
          x1={cap.at.x}
          y1={cap.at.y}
          x2={cap.handle.x}
          y2={cap.handle.y}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      </svg>
      <button
        type="button"
        data-testid="halo-cap-handle"
        aria-label={en.make.capHandle}
        data-dir={`${cap.dir.x.toFixed(3)},${cap.dir.y.toFixed(3)}`}
        className="pointer-events-auto absolute flex touch-none items-center justify-center rounded-full border-2 border-white bg-accent-fill text-on-accent shadow-touch select-none"
        style={{ left: cap.handle.x - SIZE / 2, top: cap.handle.y - SIZE / 2, width: SIZE, height: SIZE }}
        onPointerDown={(e) => {
          if (drag.current !== null || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const meaning = dragMeaning(ctx);
          const type = e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse';
          drag.current = {
            id: e.pointerId,
            start: { x: e.clientX, y: e.clientY },
            cap,
            smart: meaning === 'smart',
            speed: meaning === 'fine' ? 0.1 : 1,
            slop: SLOP[type],
            gesture: null,
            moved: false,
          };
          ctx.store.set((s) => ({ touches: s.touches + 1 }));
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d === null || e.pointerId !== d.id) return;
          const at = { x: e.clientX, y: e.clientY };
          if (!d.moved && Math.hypot(at.x - d.start.x, at.y - d.start.y) < d.slop) return;
          if (!d.moved) {
            d.moved = true;
            d.gesture = begin(ctx.app, d.smart);
            setDragging(true);
            ctx.store.set({ breathing: true });
          }
          const distance = capDistance(d.cap, d.start, at, d.speed);
          const n = d.cap.normal;
          d.gesture?.update({ translate: [n[0] * distance, n[1] * distance, n[2] * distance] });
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
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
