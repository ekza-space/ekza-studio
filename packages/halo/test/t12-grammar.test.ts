// T12's grammar patches (STUDIO-TOUCH-SPEC §6.1, §12.4): a tap on a manipulator handle over another body part selects
// that part, outside Animate (P-T7-7; Animate's Reach does it through its own press); a long-press while a brush is the
// active tool never replays the press as a click — with a brush that click is a dab (P-T9-3).
import type { ControlId } from '@ekza-studio/doc';
import { type OperatorResult, VIEWPORT_TOOL } from '@ekza-studio/editor-core';
import { createFakeEditorApp } from '@ekza-studio/editor-core/testing';
import { createToastStore } from '@ekza-studio/ui/touch';
import type { ArbiterTap, PickResult } from '@ekza-studio/viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGrammar } from '../src/halo/grammar';
import { haloVerbs } from '../src/halo/verbSource';
import type { ShellContext } from '../src/shell/context';
import { createHaloStore, initialUi } from '../src/shell/store';

const A = 'rig_1:fk.upperArm.L' as ControlId;
const B = 'rig_1:fk.lowerArm.L' as ControlId;
const HANDLE: PickResult = { kind: 'manipulator', handle: 'rx' as never };

function world(stage: 'make' | 'rig' | 'animate' | 'paint', candidates: readonly PickResult[]) {
  const app = createFakeEditorApp();
  for (const id of ['select.controls', 'select.none', 'key.set']) {
    app.operators.register({ id: id as never, label: id, category: 'edit', scope: 'global', apply() {} });
  }
  const store = createHaloStore(initialUi(stage));
  const runs: { op: string; args: unknown }[] = [];
  const piped: string[] = [];
  const vm = {
    pickCandidates: () => candidates,
    isOverMesh: () => true,
    pipe: (_pane: string, _event: unknown, phase: string) => void piped.push(phase),
  };
  const ctx: ShellContext = {
    host: {} as never,
    app,
    store,
    toasts: createToastStore(),
    vm: () => vm as never,
    run(op, args) {
      runs.push({ op, args });
      if (op === 'select.controls') {
        const s = app.session.getState();
        app.session.setState({ selection: { ...s.selection, controls: (args as { ids: ControlId[] }).ids } });
      }
      return Promise.resolve({ status: 'finished', value: undefined } as OperatorResult<unknown>);
    },
  };
  const grammar = createGrammar({
    ctx,
    verbs: haloVerbs,
    runVerb: () => {},
    consumeThumb: () => {},
    lastDown: () => ({ pointerId: 1 }) as unknown as PointerEvent,
  });
  const off = grammar.start();
  return { app, store, runs, piped, grammar, dispose: off };
}

const at = (hit: PickResult | null): ArbiterTap => ({
  paneId: 'pane-single',
  x: 300,
  y: 200,
  clientX: 300,
  clientY: 200,
  pointerType: 'touch',
  hit,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a tap on a manipulator over another body part (P-T7-7)', () => {
  it('selects the part under the handle outside Animate, and the tool never sees the tap', () => {
    const w = world('rig', [HANDLE, { kind: 'control', control: B, distancePx: 3, depth: 1 }]);
    w.app.session.setState({ selection: { ...w.app.session.getState().selection, controls: [A] } });
    expect(w.grammar.tap(at(HANDLE))).toBe('consumed');
    expect(w.runs).toEqual([{ op: 'select.controls', args: { ids: [B], mode: 'replace' } }]);
    w.dispose();
  });

  it('a tap on the selected part’s own handle stays the tool’s; Animate leaves it to Reach', () => {
    const own = world('rig', [HANDLE, { kind: 'control', control: A, distancePx: 3, depth: 1 }]);
    own.app.session.setState({ selection: { ...own.app.session.getState().selection, controls: [A] } });
    expect(own.grammar.tap(at(HANDLE))).toBe('select');
    expect(own.runs).toEqual([]);
    own.dispose();
    const animate = world('animate', [HANDLE, { kind: 'control', control: B, distancePx: 3, depth: 1 }]);
    expect(animate.grammar.tap(at(HANDLE))).toBe('select');
    expect(animate.runs).toEqual([]);
    animate.dispose();
  });
});

describe('a long-press with a brush active (P-T9-3)', () => {
  it('replays no click — no dab — and still opens the ring', () => {
    const w = world('paint', []);
    w.app.session.setState({ tools: { ...w.app.session.getState().tools, viewport: VIEWPORT_TOOL.paint } });
    w.grammar.longPress(at({ kind: 'mesh', character: 'chr_1' as never, node: 0, control: null }));
    expect(w.piped).toEqual([]);
    expect(w.store.get().halo?.mode).toBe('ring');
    w.dispose();
  });

  it('with any other tool the press is replayed as a click (the select tool picks the thing)', () => {
    const w = world('make', []);
    w.app.session.setState({ tools: { ...w.app.session.getState().tools, viewport: VIEWPORT_TOOL.select } });
    w.grammar.longPress(at({ kind: 'mesh', character: 'chr_1' as never, node: 0, control: null }));
    expect(w.piped).toEqual(['down', 'up']);
    w.dispose();
  });
});
