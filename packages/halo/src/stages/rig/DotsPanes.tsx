// The *Adjust dots* session's panes (STUDIO-TOUCH-SPEC §12.2 step 3, §4.4; T9): Quick Rig's dots move in the
// orthographic views only (front writes x/y, side z/y, M6b's axis rule), so while the session is open the canvas shows
// Auto-Rig's and Pro's R-Markers panes, `pane-front` and `pane-side` (their camera memory is shared): side by side on a
// Wide container, one at a time on Regular and Compact (a *Front · Side* toggle). They take the single pane's place
// (it hides, so its pixels are not drawn under them) and are registered like the single pane (`paneSetup`, then
// `registerPane`): the page's arbiter takes their presses, a dot under a finger is a handle (the stage's claim), a
// drag elsewhere pans the view, a tap places or picks a dot through the rig runtime as a click does in Pro. Nothing
// here writes the document.
import { PANEL, QUICK_RIG_LABELS, QUICK_RIG_MARKERS } from '@ekza-studio/editor-core';
import { Cluster, Segmented, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useLayoutEffect, useRef } from 'react';
import { rigWords } from '../../i18n/rig';
import type { HaloController } from '../../shell/controller';
import { type SizeClass, useSessionValue, useViewport } from '../../shell/hooks';
import { PANE } from '../../shell/stage';
import { DOTS_PANES, type RigStage } from './start';
import { useRigUi } from './ui';

const w = rigWords.dots;

function DotsPane({
  controller,
  id,
  flex,
}: {
  readonly controller: HaloController;
  readonly id: string;
  readonly flex: number;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const vm = useViewport(controller.ctx.host);
  useLayoutEffect(() => {
    const element = surface.current;
    if (vm === null || element === null) return undefined;
    const setup = vm.paneSetup(id);
    vm.registerPane({ id, element, camera: setup.camera, display: setup.display });
    return () => vm.unregisterPane(id);
  }, [vm, id]);
  return (
    <div
      ref={surface}
      role="application"
      aria-label={id === DOTS_PANES.front ? w.frontPane : w.sidePane}
      className="relative h-full min-w-0 outline-none"
      style={{ flex: `${flex} 1 0` }}
      data-testid={`pane-${id}`}
      data-ekza-panel={PANEL.viewport}
      data-ekza-pane={id}
    />
  );
}

/** The panes, under the chrome (the frame renders them right after the single pane). */
export default function DotsPanes({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element {
  const view = useRigUi(rig.ui, (s) => s.dotsView);
  // the single pane steps aside while the dots panes show (its camera and memory stay as they were)
  useLayoutEffect(() => {
    const single = document.querySelector<HTMLElement>(`[data-ekza-pane="${PANE}"]`);
    if (single === null) return undefined;
    const before = single.style.display;
    single.style.display = 'none';
    return () => {
      single.style.display = before;
    };
  }, []);
  const wide = size === 'wide';
  return (
    <div className="absolute inset-0 flex" data-testid="halo-rig-dots-panes" data-view={wide ? 'both' : view}>
      {wide || view === 'front' ? <DotsPane controller={controller} id={DOTS_PANES.front} flex={wide ? 3 : 1} /> : null}
      {wide || view === 'side' ? <DotsPane controller={controller} id={DOTS_PANES.side} flex={wide ? 2 : 1} /> : null}
    </div>
  );
}

/** The session's own chrome over the panes: their labels, the *Front · Side* toggle and the dots to pick by name. */
export function DotsChrome({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element {
  const { ctx } = controller;
  const view = useRigUi(rig.ui, (s) => s.dotsView);
  const quick = useSessionValue(ctx.app, (s) => s.rig.quickRig);
  const wide = size === 'wide';
  const top = size === 'regular' ? 128 + 60 : 76 + 60;
  const missing = quick !== null && QUICK_RIG_MARKERS.some((name) => quick.markers[name] === undefined);
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 flex items-start gap-2 px-(--touch-inset-left)"
        style={{ top }}
        data-halo-chrome=""
      >
        {wide ? (
          <>
            <span className="flex-[3] text-touch-label text-fg-2" data-testid="halo-rig-front-label">
              {w.frontPane}
            </span>
            <span className="flex-[2] text-touch-label text-fg-2" data-testid="halo-rig-side-label">
              {w.sidePane}
            </span>
          </>
        ) : (
          <div className="pointer-events-auto">
            <Segmented<'front' | 'side'>
              label={w.view}
              data-testid="halo-rig-dots-view"
              value={view}
              onValueChange={(next) => {
                rig.touch();
                rig.ui.set({ dotsView: next });
              }}
              items={[
                { value: 'front', label: w.front },
                { value: 'side', label: w.side },
              ]}
            />
          </div>
        )}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center px-(--touch-inset-left)"
        style={{ bottom: `calc(var(--touch-inset-bottom) + ${size === 'compact' ? 168 : 76}px)` }}
      >
        <Cluster
          role="toolbar"
          aria-label={w.pick}
          data-halo-chrome=""
          data-testid="halo-rig-dots"
          className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto p-[5px]"
          data-touch-scroll=""
        >
          {missing ? <span className="px-2 whitespace-nowrap text-fg-2">{w.placeHint}</span> : null}
          {QUICK_RIG_MARKERS.map((name) => (
            <TouchButton
              key={name}
              variant={quick?.selected === name ? 'primary' : 'ghost'}
              aria-pressed={quick?.selected === name}
              className="whitespace-nowrap"
              data-testid={`halo-rig-dot-${name}`}
              disabled={quick?.markers[name] === undefined}
              onClick={() => {
                rig.touch();
                const marker = quick?.selected === name ? null : name;
                void ctx.run('skel.quickRig.pick', { marker }).then(() => {
                  // the dot's Halo (§6.2 *Rig dot*: Re-guess, Mirror to other side, Clear dots, ⋯)
                  if (marker !== null) controller.grammar.open();
                  else controller.grammar.close();
                });
              }}
            >
              {QUICK_RIG_LABELS[name]}
            </TouchButton>
          ))}
        </Cluster>
      </div>
    </>
  );
}
