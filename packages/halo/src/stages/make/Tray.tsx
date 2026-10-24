// Make's tray (STUDIO-TOUCH-SPEC §4.2 B, §7.1, §11; the owner's clean-up focus of 2026-10-24; T8): the selection level
// `[Whole │ Points │ Edges │ Faces]`, *Drag ▾* (what a drag on the selection does: Select, Select area, Move, Turn,
// Scale, with Snap and Falloff), *Mirror edits*, *Cut ▾* (Multi-cut, Loop cut, Slide), *Clean up ▾* (Reduce to a
// budget, Stand up and size, Colours to swatches, Tidy, Merge close points, Separate), *New shape ▾* (the primitives and
// the character starts), *Create with AI* and the pinned ⋯ (empty space's More). An empty scene shows the bridge to the
// next step instead (§7.1): *Make a character · Create with AI · Bring a model*. Every control runs an operator; the
// only state here is which menu is open and *Select area*.
import type { ComponentMode, ToolId } from '@ekza-studio/editor-core';
import { PANEL, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { Cluster, Segmented } from '@ekza-studio/ui/touch';
import { type JSX, type RefObject, useRef } from 'react';
import { Icon } from '../../halo/icons';
import { en } from '../../i18n/en';
import { makeWords } from '../../i18n/make';
import { useDocumentVersion, useSessionValue } from '../../shell/hooks';
import type { StageTrayProps } from '../../shell/stageParts';
import { startCall, type StartChoice } from '../../home/model';
import { EMPTY_NOUN } from '../../verbs/nouns';
import { VERB_TABLE } from '../../verbs/table';
import {
  CHARACTER_BUDGET,
  GA_OPS,
  intakeArgs,
  isLive,
  NORMALIZE_ARGS,
  PALETTE_BAKE_ARGS,
  REDUCE_BUDGETS,
  reduceArgs,
  TEXTURE_ARGS,
} from './cleanup';
import { type MenuItem, Sparkle, TrayChip, TrayMenu, touch } from './kit';
import { aiShown, useAiAvailability } from './ai/availability';
import { openCreateWithAi } from './ai/open';
import { makeStore, useMakeState } from './state';

const w = makeWords.tray;

const PICK: readonly { readonly value: ComponentMode; readonly label: string }[] = [
  { value: 'object', label: en.tray.whole },
  { value: 'vertex', label: en.tray.points },
  { value: 'edge', label: en.tray.edges },
  { value: 'face', label: en.tray.faces },
];

/** The template starts of *Make a character* (Home's, T11) that run in Make. */
const STARTS: readonly StartChoice[] = ['smooth', 'blocky'];

const DRAG_TOOLS: readonly { readonly tool: ToolId; readonly label: string }[] = [
  { tool: VIEWPORT_TOOL.select, label: w.select },
  { tool: VIEWPORT_TOOL.move, label: w.move },
  { tool: VIEWPORT_TOOL.rotate, label: w.turn },
  { tool: VIEWPORT_TOOL.scale, label: w.scale },
];

export function MakeTray({ controller, compact }: StageTrayProps): JSX.Element {
  const { ctx } = controller;
  const { app, store } = ctx;
  const ms = makeStore(app);
  const menu = useMakeState(app, (s) => s.menu);
  const selectArea = useMakeState(app, (s) => s.selectArea);
  const mode = useSessionValue(app, (s) => s.model.componentMode);
  const ai = aiShown(useAiAvailability(app));
  const tool = useSessionValue(app, (s) => s.tools.viewport);
  const softSelect = useSessionValue(app, (s) => s.model.softSelect.on);
  const gridSnap = useSessionValue(app, (s) => s.model.snap.grid);
  const symmetry = useSessionValue(app, (s) => s.model.symmetry);
  const hilite = useSessionValue(app, (s) => s.model.hilite);
  const objects = useSessionValue(app, (s) => s.selection.objects);
  useSessionValue(app, (s) => s.lastRun);
  useDocumentVersion(app);
  const file = useRef<HTMLInputElement>(null);

  const reason = (text: string): void => {
    ctx.toasts.push({ key: 'reason', text });
  };
  const run = (op: string, args?: unknown): void => {
    ms.set({ menu: null });
    void ctx.run(op, args);
  };
  const toggleMenu = (next: Exclude<typeof menu, null>): void => {
    touch(ctx);
    ms.set({ menu: menu === next ? null : next });
  };
  const poll = (op: string, args?: unknown): string | null => {
    if (!isLive(app, op)) return en.verbs.notInBuild;
    try {
      const result = app.operators.poll(op, { panel: PANEL.viewport, paneId: 'pane-single' }, args);
      return result === true ? null : result.reason;
    } catch {
      return null;
    }
  };
  const item = (id: string, label: string, op: string, args?: unknown): MenuItem => ({
    id,
    label,
    reason: poll(op, args),
    run: () => {
      touch(ctx);
      run(op, args);
    },
  });

  const meshes = app.store.list('meshes').filter((m) => m.deleted === null);
  if (meshes.length === 0) return <EmptyMake controller={controller} compact={compact} file={file} />;

  // Mirror edits: the hilite in a component mode, else the selected meshes (`model.symmetry.set`'s own targets)
  const targets = mode === 'object' ? objects.filter((id) => id.startsWith('msh_')) : hilite;
  const mirrorOn = targets.length > 0 && targets.every((id) => (symmetry.get(id as never)?.mode ?? 'off') !== 'off');
  const mirrorReason = targets.length === 0 ? w.selectFirst : null;
  const dragLabel = selectArea ? w.selectArea : (DRAG_TOOLS.find((d) => d.tool === tool)?.label ?? w.select);

  const dragItems: MenuItem[] = [
    ...DRAG_TOOLS.map(
      (d): MenuItem => ({
        id: d.tool,
        label: d.label,
        current: !selectArea && tool === d.tool,
        run: () => {
          touch(ctx);
          ms.set({ selectArea: false });
          run('view.tool', { panel: PANEL.viewport, tool: d.tool });
        },
      }),
    ),
    {
      id: 'selectArea',
      label: w.selectArea,
      current: selectArea,
      run: () => {
        touch(ctx);
        ms.set({ selectArea: true, menu: null });
        if (tool !== VIEWPORT_TOOL.select)
          void ctx.run('view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.select });
      },
    },
    {
      id: 'snap',
      label: w.snap,
      pressed: gridSnap,
      reason: poll('model.snap.toggle', { kind: 'grid' }),
      run: () => {
        touch(ctx);
        void ctx.run('model.snap.toggle', { kind: 'grid' });
      },
    },
    {
      id: 'falloff',
      label: w.falloff,
      pressed: softSelect,
      reason: poll('model.softSelect.toggle'),
      run: () => {
        touch(ctx);
        void ctx.run('model.softSelect.toggle');
      },
    },
  ];
  const cutItems: MenuItem[] = [
    item('multiCut', w.multiCut, 'view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.multiCut }),
    item('loopCut', w.loopCut, 'view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.insertLoop }),
    item('slide', w.slide, 'view.tool', { panel: PANEL.viewport, tool: VIEWPORT_TOOL.slide }),
    item('last', w.lastTool, 'tool.last'),
  ];
  // a budget row's arguments are the same for the readiness poll and the run (`./cleanup`, G-a's contract)
  const budgetRow = (menuId: 'intake' | 'reduce', op: string, label: string): MenuItem => ({
    id: menuId,
    label,
    reason: poll(op, menuId === 'intake' ? intakeArgs(CHARACTER_BUDGET) : reduceArgs(CHARACTER_BUDGET)),
    run: () => {
      touch(ctx);
      ms.set({ menu: menuId });
    },
  });
  const cleanItems: MenuItem[] = [
    budgetRow('intake', GA_OPS.intake, w.intake),
    budgetRow('reduce', GA_OPS.reduce, w.reduce),
    item('normalize', w.normalize, GA_OPS.normalize, NORMALIZE_ARGS),
    item('paletteBake', w.paletteBake, GA_OPS.paletteBake, PALETTE_BAKE_ARGS),
    item('textures', w.textures, GA_OPS.textureDownsize, TEXTURE_ARGS),
    item('tidy', w.tidy, 'mesh.cleanup'),
    item('mergeClose', w.mergeClose, 'mesh.mergeByDistance'),
    item('separate', w.separate, 'mesh.separate'),
  ];
  const budgetItems = (op: string, args: (b: (typeof REDUCE_BUDGETS)[number]) => unknown): MenuItem[] =>
    REDUCE_BUDGETS.map((budget) => item(budget.id, makeWords.ai[budget.id], op, args(budget)));
  const reduceItems = budgetItems(GA_OPS.reduce, reduceArgs);
  const intakeItems = budgetItems(GA_OPS.intake, intakeArgs);
  const shapeItems: MenuItem[] = [
    // the primitives in the verb table's words (empty space's *New shape ▾*, §6.2)
    ...(VERB_TABLE.empty.find((p) => p.id === 'newShape')?.menu ?? []).map((c) => item(c.op, c.plain, c.op, c.args)),
    // the character starts (Home's *Make a character*, T11's `startCall`)
    ...STARTS.map((start) => {
      const call = startCall(start);
      return item(start, en.home.starts[start]?.[0] ?? start, call?.op ?? 'mesh.create.template', call?.args);
    }),
  ];

  const menus: Record<Exclude<typeof menu, null>, { label: string; items: readonly MenuItem[] }> = {
    drag: { label: w.dragTitle, items: dragItems },
    cut: { label: w.cutTitle, items: cutItems },
    cleanUp: { label: w.cleanUpTitle, items: cleanItems },
    reduce: { label: w.reduce, items: reduceItems },
    intake: { label: w.intake, items: intakeItems },
    newShape: { label: w.newShape, items: shapeItems },
  };
  const open = menu === null ? null : menus[menu];

  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-tray"
      data-stage="make"
      className="pointer-events-auto relative flex w-full max-w-[1100px] items-center gap-1 overflow-visible p-[5px]"
    >
      {open === null ? null : (
        <TrayMenu label={open.label} items={open.items} testId={`halo-make-menu-${menu}`} onReason={reason} />
      )}
      <Segmented<ComponentMode>
        label={en.tray.pick}
        data-testid="halo-pick"
        value={mode}
        onValueChange={(next) => {
          touch(ctx);
          ms.set({ menu: null });
          void ctx.run('select.mode', { mode: next });
        }}
        items={PICK}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" data-touch-scroll="">
        <TrayChip
          testId="halo-make-drag"
          label={dragLabel}
          menu
          open={menu === 'drag'}
          onPress={() => toggleMenu('drag')}
        />
        {/* the AI pipeline's door, early in the row so a portrait tray shows it (the owner's priority); only where a
            generation gateway is configured and enabled (ST-T8-18) */}
        {ai ? (
          <TrayChip
            testId="halo-make-ai"
            label={w.createAi}
            icon={<Sparkle />}
            onPress={() => {
              touch(ctx);
              ms.set({ menu: null });
              openCreateWithAi(ctx);
            }}
          />
        ) : null}
        {/* §4.8: with nothing to mirror the chip would only say why; it shows with a shape selected */}
        {mirrorReason === null ? (
          <TrayChip
            testId="halo-make-mirror"
            label={w.mirrorEdits}
            pressed={mirrorOn}
            onPress={() => {
              touch(ctx);
              void ctx.run('model.symmetry.set', { mode: mirrorOn ? 'off' : 'object-x' });
            }}
          />
        ) : null}
        <TrayChip testId="halo-make-cut" label={w.cut} menu open={menu === 'cut'} onPress={() => toggleMenu('cut')} />
        <TrayChip
          testId="halo-make-cleanup"
          label={w.cleanUp}
          menu
          open={menu === 'cleanUp' || menu === 'reduce' || menu === 'intake'}
          onPress={() => toggleMenu('cleanUp')}
        />
        {compact ? null : (
          <TrayChip
            testId="halo-make-new"
            label={w.newShape}
            menu
            open={menu === 'newShape'}
            onPress={() => toggleMenu('newShape')}
          />
        )}
      </div>
      <TrayChip
        testId="halo-make-more"
        label={w.more}
        icon={<Icon name="more" />}
        onPress={() => {
          touch(ctx);
          ms.set({ menu: null });
          store.set({ sheet: 'more', sheetArgs: null, sheetNoun: EMPTY_NOUN, halo: null, focus: null });
        }}
      />
    </Cluster>
  );
}

function EmptyMake({
  controller,
  file,
}: StageTrayProps & { readonly file: RefObject<HTMLInputElement | null> }): JSX.Element {
  const { ctx } = controller;
  const ai = aiShown(useAiAvailability(ctx.app));
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-tray"
      data-stage="make"
      data-empty=""
      className="pointer-events-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-2 p-[5px]"
    >
      <span className="px-2 text-touch text-fg-2">{makeWords.empty.title}</span>
      {STARTS.map((start) => (
        <TrayChip
          key={start}
          testId={`halo-make-start-${start}`}
          label={en.home.starts[start]?.[0] ?? start}
          icon={<Icon name="pencil" />}
          onPress={() => {
            touch(ctx);
            const call = startCall(start);
            if (call !== null) void ctx.run(call.op, call.args);
          }}
        />
      ))}
      {ai ? (
        <TrayChip
          testId="halo-make-ai"
          label={makeWords.empty.createAi}
          icon={<Sparkle />}
          onPress={() => {
            touch(ctx);
            openCreateWithAi(ctx);
          }}
        />
      ) : null}
      <TrayChip
        testId="halo-make-bring"
        label={makeWords.empty.bring}
        icon={<Icon name="upload" />}
        onPress={() => {
          touch(ctx);
          file.current?.click();
        }}
      />
      <input
        ref={file}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          if (files.length > 0) void ctx.host.files.openFiles(files);
        }}
      />
    </Cluster>
  );
}
