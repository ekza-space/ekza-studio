// The Rig-it card (STUDIO-TOUCH-SPEC §7.3, §9 J1 steps 3–5, §12.2; T9): docked above the tray, never over the model.
// Its first line asks the destination (*For: OMOBA & Ekza Space · Game engine · Just exploring*; the finger detail
// follows it), then *Dots look right? [Rig it] · Adjust dots · ⋯*, the story line while `autorig.rig` runs (Cancel
// while skinning), M6b's rebind question inline, *Rigged · N joints* with *Test with: Walk · Sword · Dance* and the
// starter set. A character that came with its own rig gets *Use its rig*, then the checks. The card renders the
// recipe's state (`recipes/rigIt.ts`); every action is the recipe's, so the operator log is Auto-Rig's.
import type { AutoRigFingers } from '@ekza-studio/editor-core';
import { PANEL, quickRigOf, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { Cluster, Segmented, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../halo/icons';
import { rigWords } from '../../i18n/rig';
import { DESTINATIONS } from '../../path/destinations';
import { RIG_IT_CLOSED, type RigIt, type RigItState, TEST_CLIPS } from '../../recipes/rigIt';
import type { HaloController } from '../../shell/controller';
import { type SizeClass, useDocumentVersion, useSessionValue } from '../../shell/hooks';
import { useHaloStore } from '../../shell/store';
import { reasonOf } from './poll';
import { aboveTray } from './dock';
import type { RigStage } from './start';
import { useRigUi } from './ui';

const w = rigWords.card;

/** The card's destinations (§7.3): the ones a character is rigged for, and *Just exploring*. */
const CARD_DESTINATIONS = ['omoba', 'engine', 'exploring'] as const;

const FINGERS: readonly { readonly value: AutoRigFingers; readonly label: string }[] = [
  { value: 'mittens', label: w.mittens },
  { value: 'thumb', label: w.thumb },
  { value: 'all', label: w.allFingers },
];

/** The recipe of the stage and its state (null until the chunk is there). */
export function useRigIt(rig: RigStage): { readonly recipe: RigIt | null; readonly state: RigItState } {
  const [recipe, setRecipe] = useState<RigIt | null>(rig.loaded);
  useEffect(() => {
    if (recipe !== null) return undefined;
    let live = true;
    void rig.recipe().then((made) => {
      if (live) setRecipe(made);
    });
    return () => {
      live = false;
    };
  }, [recipe, rig]);
  const state = useSyncExternalStore(
    (listener) => recipe?.subscribe(listener) ?? (() => {}),
    () => recipe?.get() ?? RIG_IT_CLOSED,
    () => recipe?.get() ?? RIG_IT_CLOSED,
  );
  return { recipe, state };
}

function jointCount(controller: HaloController, character: string | null): number {
  if (character === null) return 0;
  const { app } = controller.ctx;
  const skeleton = app.store.query.skeletonOfCharacter(character as never);
  return skeleton === undefined ? 0 : app.store.query.jointsOfSkeleton(skeleton.id).length;
}

export function RigCard({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element | null {
  const { ctx } = controller;
  const { app, store } = ctx;
  useDocumentVersion(app);
  const quick = useSessionValue(app, (s) => s.rig.quickRig);
  const destination = useHaloStore(store, (s) => s.destination);
  const { recipe, state } = useRigIt(rig);
  const [menu, setMenu] = useState(false);
  const trayHeight = useRigUi(rig.ui, (s) => s.trayHeight);

  // the card's outcomes the frame follows: the starter set added closes it; *Use its rig* opens the checks
  useEffect(() => {
    // the bind leaves Skin with the brush armed (M6B-AF-1): the card's next steps are no paint session (§12.2 step 6)
    if (state.phase === 'done' && app.session.getState().tools.viewport === VIEWPORT_TOOL.paintSkinWeights) {
      void ctx.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.select });
    }
    if (state.phase === 'added') rig.ui.set({ card: false });
    if (state.phase === 'checks') {
      rig.ui.set({ card: false });
      store.set({ sheet: 'checks', sheetArgs: null, sheetNoun: null, halo: null });
    }
  }, [state.phase, rig, store, app, ctx]);

  const act = (fn: (r: RigIt) => unknown): (() => void) => {
    return () => {
      rig.touch();
      setMenu(false);
      if (recipe !== null) void fn(recipe);
    };
  };
  const close = act(async (r) => {
    rig.ui.set({ card: false });
    if (r.get().phase === 'dots' || r.get().phase === 'opening') await r.cancel();
    else await r.close();
  });

  let step = 1;
  let body: JSX.Element;
  switch (state.phase) {
    case 'opening':
      body = <p className="m-0 py-2 text-fg-2">{w.opening}</p>;
      break;
    case 'dots': {
      const rigReason = reasonOf(app, 'autorig.rig', {});
      const moved = quick?.moved.size ?? 0;
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold">{w.dotsTitle}</p>
          <p className={`m-0 text-touch-label text-fg-2 ${size === 'compact' ? 'hidden' : ''}`}>
            {w.dotsDetail}
            {moved > 0 ? ` ${w.moved(moved)}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 max-w-full overflow-x-auto" data-touch-scroll="">
              <Segmented<AutoRigFingers>
                label={w.fingers}
                data-testid="halo-rig-fingers"
                value={state.fingers === 'minimal' ? 'mittens' : state.fingers}
                onValueChange={(fingers) => {
                  rig.touch();
                  void recipe?.fingers(fingers);
                }}
                items={FINGERS}
              />
            </div>
            <span className="flex-1" />
            <TouchButton
              variant="primary"
              className="gap-1.5"
              disabled={rigReason !== null}
              title={rigReason ?? undefined}
              data-testid="halo-rig-go"
              onClick={act((r) => r.rig())}
            >
              <Icon name="rig" />
              {w.rigIt}
            </TouchButton>
            <TouchButton
              data-testid="halo-rig-adjust"
              onClick={() => {
                rig.touch();
                setMenu(false);
                rig.ui.set({ dots: true });
              }}
            >
              {w.adjustDots}
            </TouchButton>
            <TouchButton
              variant="ghost"
              aria-label={w.moreOptions}
              aria-expanded={menu}
              data-testid="halo-rig-card-more"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="more" />
            </TouchButton>
          </div>
          {menu ? (
            <div role="menu" className="flex flex-wrap gap-1.5" data-testid="halo-rig-card-menu">
              <TouchButton
                role="menuitem"
                variant="ghost"
                data-testid="halo-rig-skeleton-only"
                onClick={act((r) => r.skeletonOnly())}
              >
                {w.skeletonOnly}
              </TouchButton>
              <TouchButton
                role="menuitem"
                variant="ghost"
                disabled={reasonOf(app, 'skel.quickRig.guess') !== null}
                data-testid="halo-rig-reguess"
                onClick={() => {
                  rig.touch();
                  setMenu(false);
                  void ctx.run('skel.quickRig.guess');
                }}
              >
                {w.reGuess}
              </TouchButton>
            </div>
          ) : null}
        </>
      );
      break;
    }
    case 'building': {
      step = 2;
      const text = state.stage === null ? w.stages.skeleton : w.stages[state.stage];
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold" aria-live="polite" data-testid="halo-rig-story">
            {text}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line,#333)]" aria-hidden="true">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round(100 * (state.fraction ?? (state.stage === 'skin' ? 0.5 : 0.2)))}%` }}
            />
          </div>
          <div className="flex justify-end">
            <TouchButton
              variant="ghost"
              disabled={state.stage !== 'skin'}
              data-testid="halo-rig-cancel"
              onClick={act((r) => r.cancel())}
            >
              {w.cancel}
            </TouchButton>
          </div>
        </>
      );
      break;
    }
    case 'confirm':
      step = 2;
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold">{w.rebindTitle}</p>
          <div className="flex justify-end gap-2">
            <TouchButton variant="primary" data-testid="halo-rig-rebind" onClick={act((r) => r.rig(true))}>
              {w.rebindYes}
            </TouchButton>
            <TouchButton variant="ghost" onClick={close}>
              {w.cancel}
            </TouchButton>
          </div>
        </>
      );
      break;
    case 'cancelled':
      step = 2;
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold">{w.cancelledTitle}</p>
          <div className="flex justify-end gap-2">
            <TouchButton variant="primary" data-testid="halo-rig-bind-again" onClick={act((r) => r.bindAgain())}>
              {w.rebindYes}
            </TouchButton>
            <TouchButton variant="ghost" onClick={close}>
              {w.notNow}
            </TouchButton>
          </div>
        </>
      );
      break;
    case 'done': {
      step = 3;
      const fingers = w.fingerWords[state.fingers] ?? state.fingers;
      const clip = state.motion?.clip ?? 'walk';
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold" data-testid="halo-rig-rigged">
            {w.rigged(jointCount(controller, state.character), fingers)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-2">{w.testWith}</span>
            <Segmented<string>
              label={w.testWith}
              data-testid="halo-rig-test"
              value={clip}
              onValueChange={(next) => {
                rig.touch();
                recipe?.testWith(next);
              }}
              items={TEST_CLIPS.map((c) => ({ value: c.id, label: w[c.word] }))}
            />
            {state.motion?.state === 'unavailable' ? <span className="text-fg-2">{w.motionOff}</span> : null}
          </div>
          <p className="m-0 text-fg-2">{w.addAnimations}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <TouchButton
              variant="primary"
              className="gap-1.5"
              disabled={state.adding}
              data-testid="halo-rig-starter"
              onClick={act((r) => r.starterSet())}
            >
              <Icon name="clip" />
              {state.adding ? w.adding : w.starterSet}
            </TouchButton>
            <TouchButton variant="ghost" data-testid="halo-rig-not-now" onClick={close}>
              {w.notNow}
            </TouchButton>
          </div>
        </>
      );
      break;
    }
    case 'imported': {
      const reason = reasonOf(app, 'char.makeEditable', { character: state.character });
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold">{w.importedTitle}</p>
          <p className="m-0 text-touch-label text-fg-2">{reason === null ? w.importedDetail : reason}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <TouchButton
              variant="primary"
              disabled={reason !== null}
              data-testid="halo-rig-use-its-rig"
              onClick={act((r) => r.useItsRig())}
            >
              {w.useItsRig}
            </TouchButton>
            <TouchButton
              data-testid="halo-rig-card-checks"
              onClick={() => {
                rig.touch();
                rig.ui.set({ card: false });
                store.set({ sheet: 'checks', sheetArgs: null, sheetNoun: null, halo: null });
              }}
            >
              {rigWords.tray.checks}
            </TouchButton>
          </div>
        </>
      );
      break;
    }
    case 'failed':
      body = (
        <>
          <p className="m-0 text-touch-title font-semibold">{w.failed}</p>
          {state.message === null ? null : <p className="m-0 text-fg-2">{state.message}</p>}
          <div className="flex justify-end gap-2">
            <TouchButton variant="primary" onClick={act((r) => r.open())}>
              {w.tryAgain}
            </TouchButton>
            <TouchButton variant="ghost" onClick={close}>
              {w.close}
            </TouchButton>
          </div>
        </>
      );
      break;
    case 'added':
    case 'checks':
    case 'none':
      body = (
        <>
          <p className="m-0 text-fg-2">{recipe === null ? w.opening : rigWords.tray.nothing}</p>
          <div className="flex justify-end">
            <TouchButton variant="ghost" onClick={close}>
              {w.close}
            </TouchButton>
          </div>
        </>
      );
  }
  const asksDestination = state.phase === 'dots' || state.phase === 'opening';
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-(--touch-inset-left)"
      style={{ bottom: aboveTray(trayHeight, size) }}
    >
      <Cluster
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a card of controls beside the work, not a form
        role="group"
        aria-label={w.region}
        data-halo-chrome=""
        data-testid="halo-rig-card"
        data-phase={state.phase}
        className="pointer-events-auto flex w-[min(640px,100%)] flex-col gap-2.5 p-4"
      >
        {asksDestination ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-2">{w.forLabel}</span>
            <div className="min-w-0 max-w-full overflow-x-auto" data-touch-scroll="">
              <Segmented<string>
                label={w.forLabel}
                data-testid="halo-rig-destination"
                value={(CARD_DESTINATIONS as readonly string[]).includes(destination) ? destination : 'exploring'}
                onValueChange={(next) => {
                  rig.touch();
                  void recipe?.destination(next);
                }}
                items={CARD_DESTINATIONS.map((id) => ({
                  value: id,
                  label: DESTINATIONS.find((d) => d.id === id)?.name ?? id,
                }))}
              />
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-touch-label text-fg-2">{w.step(step)}</span>
          <span className="flex-1" />
          {state.phase === 'building' ? null : (
            <TouchButton variant="ghost" aria-label={w.close} data-testid="halo-rig-card-close" onClick={close}>
              <Icon name="close" />
            </TouchButton>
          )}
        </div>
        {body}
      </Cluster>
    </div>
  );
}

/** Quick Rig is open on the card's subject (the dots are shown). */
export const dotsShown = (controller: HaloController): boolean => quickRigOf(controller.ctx.app) !== null;
