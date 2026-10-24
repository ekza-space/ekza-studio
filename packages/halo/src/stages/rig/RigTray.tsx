// The Rig tray (STUDIO-TOUCH-SPEC §7.1, §12; T9): empty space's Halo in Rig, docked — the segment `[Character │
// Skeleton │ Skin]` (`rig.mode`, which also follows touch), *Rig it for me* (the card), *Add skeleton ▾*, *Checks ⚠n*,
// *Bind skin*, the pose segment `[Bind │ Test │ Clip]` with ▶ *Bend test* / *Pause here* / *Play again* once a skin is
// bound (§12.4 step 1, J7: one touch each), *Paint weights*, and ⋯ More, pinned last. While the brush paints, the tray
// is the brush bar (§12.4 step 3): the mode `[Replace │ Add │ Scale │ Smooth]`, ⟨Size⟩ ⟨Strength⟩ ⟨Value⟩, Pressure
// (the Pencil's), Mirror, Flood, Show ▾, the pose segment and ▶ *Play again*. Every control runs an operator (or the
// stage's own session state: the bend test, the weight display, the Pencil's pressure toggle).
import type { BrushSettings } from '@ekza-studio/editor-core';
import { PANEL, quickRigOf, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { Cluster, Segmented, ToggleChip, TouchButton, ValueChip } from '@ekza-studio/ui/touch';
import { setStrokePressure, strokePressure, subscribeStrokePressure } from '@ekza-studio/viewport';
import { type JSX, useEffect, useSyncExternalStore } from 'react';
import { Icon } from '../../halo/icons';
import { rigWords } from '../../i18n/rig';
import type { BendTest } from '../../recipes/fixBend';
import type { HaloController } from '../../shell/controller';
import { type SizeClass, useDocumentVersion, useSessionValue } from '../../shell/hooks';
import { useReadiness } from '../../shell/readiness';
import { EMPTY_NOUN } from '../../verbs/nouns';
import { rigTrayState } from './model';
import { reasonOf } from './poll';
import type { RigStage } from './start';
import { useRigUi, type WeightShow } from './ui';

const w = rigWords;

const SEGMENTS: readonly { readonly value: 'object' | 'skeleton' | 'skin'; readonly label: string }[] = [
  { value: 'object', label: w.tray.character },
  { value: 'skeleton', label: w.tray.skeleton },
  { value: 'skin', label: w.tray.skin },
];

const SKELETONS = ['lite17', 'core21', 'standard33', 'full52'].map((preset) => ({
  preset,
  label: w.tray.skeletons[preset] ?? preset,
}));

const JOINT_TOOLS = [VIEWPORT_TOOL.jointTool, VIEWPORT_TOOL.insertJoint, VIEWPORT_TOOL.socket].map((tool) => ({
  tool,
  label: w.tray.jointTools[tool] ?? tool,
}));

const OPS: readonly { readonly value: BrushSettings['op']; readonly label: string }[] = [
  { value: 'replace', label: w.paint.replace },
  { value: 'add', label: w.paint.add },
  { value: 'scale', label: w.paint.scale },
  { value: 'smooth', label: w.paint.smooth },
];

const SHOWS: readonly WeightShow[] = ['ramp', 'greyscale', 'influences', 'off'];

/** The bend test of the stage (one at a time, kept across renders). */
const bends = new WeakMap<RigStage, BendTest>();

function PoseControls({ controller, rig }: { readonly controller: HaloController; readonly rig: RigStage }) {
  const { ctx } = controller;
  const { app } = ctx;
  const view = useSessionValue(app, (s) => s.rig.poseView);
  const bend = useRigUi(rig.ui, (s) => s.bend);
  const clipReason = reasonOf(app, 'rig.pose.view', { view: 'clip' });
  // the bend test runs while its state says so (search's *Fix where it bends* starts it the same way)
  useEffect(() => {
    if (bend !== 'playing' || bends.get(rig)?.playing === true) return;
    const character = rigTrayState(app).character;
    if (character === null) return;
    void import('../../recipes/fixBend').then(({ startBendTest }) => {
      if (rig.ui.get().bend !== 'playing') return;
      bends.get(rig)?.stop();
      const test = startBendTest(app, character);
      if (test === null) rig.ui.set({ bend: 'off' });
      else bends.set(rig, test);
    });
  }, [bend, app, rig]);
  useEffect(
    () => () => {
      bends.get(rig)?.stop();
      bends.delete(rig);
    },
    [rig],
  );
  const pause = (): void => {
    rig.touch();
    bends.get(rig)?.pause();
    bends.delete(rig);
    rig.ui.set({ bend: 'paused' });
  };
  const play = (): void => {
    rig.touch();
    bends.get(rig)?.stop();
    bends.delete(rig);
    rig.ui.set({ bend: 'off' });
    void import('../../recipes/fixBend').then(({ testView }) =>
      testView((op, a) => ctx.run(op, a), app).then((ok) => {
        if (ok) rig.ui.set({ bend: 'playing', spot: null });
      }),
    );
  };
  return (
    <>
      <Segmented<'bind' | 'test' | 'clip'>
        label={w.tray.pose}
        data-testid="halo-rig-pose"
        value={view}
        onValueChange={(next) => {
          rig.touch();
          bends.get(rig)?.stop();
          bends.delete(rig);
          rig.ui.set({ bend: 'off' });
          void ctx.run('rig.pose.view', { view: next });
        }}
        items={[
          { value: 'bind', label: w.tray.poseBind },
          { value: 'test', label: w.tray.poseTest },
          { value: 'clip', label: w.tray.poseClip, disabled: clipReason !== null },
        ]}
      />
      {view === 'test' ? (
        bend === 'playing' ? (
          <TouchButton variant="primary" className="gap-1.5" data-testid="halo-rig-pause" onClick={pause}>
            <span aria-hidden="true">❚❚</span>
            {w.tray.pauseHere}
          </TouchButton>
        ) : (
          <TouchButton className="gap-1.5" data-testid="halo-rig-bend" onClick={play}>
            <Icon name="play" />
            {bend === 'paused' ? w.tray.playAgain : w.tray.bendTest}
          </TouchButton>
        )
      ) : null}
    </>
  );
}

function Menu({
  items,
  testId,
  onPick,
}: {
  readonly items: readonly { readonly id: string; readonly label: string; readonly reason?: string | null }[];
  readonly testId: string;
  readonly onPick: (id: string) => void;
}): JSX.Element {
  return (
    <Cluster
      role="menu"
      data-halo-chrome=""
      data-testid={testId}
      className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 p-[5px]"
    >
      {items.map((item) => (
        <TouchButton
          key={item.id}
          role="menuitem"
          variant="ghost"
          disabled={item.reason !== undefined && item.reason !== null}
          title={item.reason ?? undefined}
          onClick={() => onPick(item.id)}
        >
          {item.label}
        </TouchButton>
      ))}
    </Cluster>
  );
}

function BrushBar({
  controller,
  rig,
  compact,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly compact: boolean;
}): JSX.Element {
  const { ctx } = controller;
  const { app } = ctx;
  const brush = useSessionValue(app, (s) => s.rig.paint.brush);
  const menu = useRigUi(rig.ui, (s) => s.menu);
  const show = useRigUi(rig.ui, (s) => s.show);
  const pressure = useSyncExternalStore(
    (listener) => subscribeStrokePressure(app, listener),
    () => strokePressure(app),
    () => strokePressure(app),
  );
  const set = (patch: Partial<BrushSettings>): void => void ctx.run('skin.paint.set', { patch });
  const floodReason = reasonOf(app, 'skin.weights.flood', {});
  return (
    <div className="flex w-full max-w-[1100px] flex-col items-stretch gap-2" data-testid="halo-rig-brush">
      {menu === 'show' ? (
        <Menu
          testId="halo-rig-show-menu"
          items={SHOWS.map((id) => ({ id, label: w.paint.showModes[id] ?? id }))}
          onPick={(id) => {
            rig.touch();
            rig.ui.set({ show: id as WeightShow, menu: null });
          }}
        />
      ) : null}
      <Cluster
        data-halo-chrome=""
        data-testid="halo-tray"
        className="pointer-events-auto flex w-full flex-wrap items-center gap-1.5 p-[5px]"
      >
        <Segmented<BrushSettings['op']>
          label={w.paint.brush}
          data-testid="halo-rig-op"
          value={brush.op}
          onValueChange={(op) => {
            rig.touch();
            set({ op });
          }}
          items={compact ? OPS.filter((o) => o.value !== 'scale') : OPS}
        />
        <ValueChip
          label={w.paint.size}
          value={brush.radiusPx}
          step={1}
          min={1}
          max={400}
          unit="px"
          proName="Radius"
          data-testid="halo-rig-size"
          onCommit={(radiusPx) => set({ radiusPx: Math.max(1, Math.round(radiusPx)) })}
        />
        <ValueChip
          label={w.paint.strength}
          value={brush.opacity}
          step={0.05}
          min={0}
          max={1}
          proName="Opacity"
          data-testid="halo-rig-strength"
          onCommit={(opacity) => set({ opacity })}
        />
        <ValueChip
          label={w.paint.value}
          value={brush.value}
          step={0.05}
          min={brush.op === 'add' ? -1 : 0}
          max={1}
          proName="Value"
          data-testid="halo-rig-value"
          onCommit={(value) => set({ value })}
        />
        <ToggleChip
          label={w.paint.pressure}
          pressed={pressure}
          title={w.paint.pressureHint}
          data-testid="halo-rig-pressure"
          onPressedChange={(on) => {
            rig.touch();
            setStrokePressure(app, on);
          }}
        />
        <ToggleChip
          label={w.paint.mirror}
          pressed={brush.mirror}
          data-testid="halo-rig-mirror"
          onPressedChange={() => {
            rig.touch();
            void ctx.run('skin.paint.mirrorToggle');
          }}
        />
        <TouchButton
          variant="ghost"
          disabled={floodReason !== null}
          title={floodReason ?? undefined}
          data-testid="halo-rig-flood"
          onClick={() => {
            rig.touch();
            void ctx.run('skin.weights.flood', {});
          }}
        >
          {w.paint.flood}
        </TouchButton>
        <TouchButton
          variant="ghost"
          className="gap-1"
          aria-expanded={menu === 'show'}
          data-testid="halo-rig-show"
          onClick={() => rig.ui.set({ menu: menu === 'show' ? null : 'show' })}
        >
          {w.paint.show}: {w.paint.showModes[show] ?? show}
          <Icon name="down" size={16} />
        </TouchButton>
        <PoseControls controller={controller} rig={rig} />
        <span className="flex-1" />
        <TouchButton
          variant="ghost"
          aria-label={w.weights.title}
          data-testid="halo-rig-brush-more"
          onClick={() => {
            rig.touch();
            ctx.store.set({ sheet: 'weights', sheetArgs: null, sheetNoun: null, halo: null });
          }}
        >
          <Icon name="more" />
        </TouchButton>
      </Cluster>
    </div>
  );
}

export default function RigTray({
  controller,
  rig,
  size,
}: {
  readonly controller: HaloController;
  readonly rig: RigStage;
  readonly size: SizeClass;
}): JSX.Element {
  const { ctx } = controller;
  const { app, store } = ctx;
  useDocumentVersion(app);
  const mode = useSessionValue(app, (s) => s.rig.mode);
  const tool = useSessionValue(app, (s) => s.tools.viewport);
  useSessionValue(app, (s) => s.rig.quickRig);
  const menu = useRigUi(rig.ui, (s) => s.menu);
  const r = useReadiness(controller.readiness);
  const compact = size === 'compact';
  const state = rigTrayState(app);
  const painting = mode === 'skin' && tool === VIEWPORT_TOOL.paintSkinWeights;
  if (painting) return <BrushBar controller={controller} rig={rig} compact={compact} />;

  const count = r.stages.rig.count;
  const skinReason = reasonOf(app, 'rig.mode', { mode: 'skin' });
  const go = (fn: () => void): (() => void) => {
    return () => {
      rig.touch();
      fn();
    };
  };
  const checks = (
    <TouchButton
      className="gap-1.5"
      data-testid="halo-rig-checks"
      onClick={go(() => store.set({ sheet: 'checks', sheetArgs: null, sheetNoun: null, halo: null }))}
    >
      <Icon name={count > 0 ? 'warn' : 'check'} />
      {count > 0 ? w.tray.checksCount(count) : w.tray.checks}
    </TouchButton>
  );
  const rigIt = (primary: boolean) => (
    <TouchButton
      variant={primary ? 'primary' : 'default'}
      className="gap-1.5"
      data-testid="halo-rig-it"
      onClick={go(() => void rig.openCard())}
    >
      <Icon name="rig" />
      {state.character === null || quickRigOf(app) !== null ? w.tray.rigIt : w.tray.rigAgain}
    </TouchButton>
  );
  const nothing = state.meshes === 0 && state.character === null && state.asset === null;
  return (
    <div className="flex w-full max-w-[1100px] flex-col items-stretch gap-2" data-testid="halo-rig-tray">
      {menu === 'skeleton' ? (
        <Menu
          testId="halo-rig-skeleton-menu"
          items={SKELETONS.map((s) => ({
            id: s.preset,
            label: s.label,
            reason: reasonOf(app, 'skel.template.create', { preset: s.preset }),
          }))}
          onPick={(preset) => {
            rig.touch();
            rig.ui.set({ menu: null });
            void ctx.run('skel.template.create', { preset });
          }}
        />
      ) : null}
      {menu === 'joints' ? (
        <Menu
          testId="halo-rig-joints-menu"
          items={JOINT_TOOLS.map((t) => ({ id: t.tool, label: t.label }))}
          onPick={(tool) => {
            rig.touch();
            rig.ui.set({ menu: null });
            void ctx.run('view.tool', { panel: PANEL.viewport, tool });
          }}
        />
      ) : null}
      <Cluster
        data-halo-chrome=""
        data-testid="halo-tray"
        className="pointer-events-auto flex w-full flex-wrap items-center gap-1.5 p-[5px]"
      >
        <Segmented<'object' | 'skeleton' | 'skin'>
          label={w.tray.mode}
          data-testid="halo-rig-mode"
          value={mode === 'shape' ? 'object' : mode}
          onValueChange={(next) => {
            rig.touch();
            void ctx.run('rig.mode', { mode: next }).then(() => {
              // the Skin segment shows the skin; the brush is *Paint weights*' (§12.4)
              if (next === 'skin' && app.session.getState().tools.viewport === VIEWPORT_TOOL.paintSkinWeights) {
                void ctx.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.select });
              }
            });
          }}
          items={SEGMENTS.map((s) =>
            s.value === 'skin' && skinReason !== null && mode !== 'skin' ? { ...s, disabled: true } : s,
          )}
        />
        {nothing ? (
          <span className="px-2 text-fg-2" data-testid="halo-rig-nothing">
            {w.tray.nothing}
          </span>
        ) : null}
        {!nothing && (state.character === null || state.quickRig) ? rigIt(true) : null}
        {state.character === null && state.asset === null && !nothing ? (
          <TouchButton
            className="gap-1"
            aria-expanded={menu === 'skeleton'}
            data-testid="halo-rig-add-skeleton"
            onClick={() => rig.ui.set({ menu: menu === 'skeleton' ? null : 'skeleton' })}
          >
            {w.tray.addSkeleton}
            <Icon name="down" size={16} />
          </TouchButton>
        ) : null}
        {state.character !== null && !state.bound ? (
          <TouchButton
            variant="primary"
            className="gap-1.5"
            disabled={reasonOf(app, 'skin.bind') !== null}
            data-testid="halo-rig-bind"
            onClick={go(() => void ctx.run('skin.bind'))}
          >
            <Icon name="bind" />
            {w.tray.bind}
          </TouchButton>
        ) : null}
        {state.bound ? <PoseControls controller={controller} rig={rig} /> : null}
        {state.bound ? (
          <TouchButton
            className="gap-1.5"
            data-testid="halo-rig-paint"
            onClick={go(() => {
              void import('../../recipes/fixBend').then(async ({ paintBone }) => {
                const active = app.session.getState().rig.activeInfluence;
                if (active !== null) {
                  await paintBone((op, a) => ctx.run(op, a), app, active.mesh, active.joint);
                  return;
                }
                await ctx.run('rig.mode', { mode: 'skin' });
                await ctx.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.paintSkinWeights });
              });
            })}
          >
            <Icon name="paint" />
            {w.tray.paintWeights}
          </TouchButton>
        ) : null}
        {mode === 'skeleton' ? (
          <TouchButton
            className="gap-1"
            aria-expanded={menu === 'joints'}
            data-testid="halo-rig-joints"
            onClick={() => rig.ui.set({ menu: menu === 'joints' ? null : 'joints' })}
          >
            {w.tray.joints}
            <Icon name="down" size={16} />
          </TouchButton>
        ) : null}
        {nothing ? null : checks}
        {state.character !== null && !state.quickRig ? rigIt(false) : null}
        <span className="flex-1" />
        <TouchButton
          variant="ghost"
          aria-label={w.tray.more}
          data-verb="more"
          data-testid="halo-rig-more"
          onClick={go(() =>
            store.set({ sheet: 'more', sheetArgs: null, sheetNoun: EMPTY_NOUN, halo: null, focus: null }),
          )}
        >
          <Icon name="more" />
        </TouchButton>
      </Cluster>
    </div>
  );
}
