// The Thread's ◆ Key, beside ● Rec (STUDIO-TOUCH-SPEC §10.2, §10.3; ST-KEY-1 … ST-KEY-6, owner 2026-10-25: "an
// explicit Key button beside Rec"). A labelled 44 pt button on every size class:
// - tap: `key.set` on the selected controls at the playhead, every channel, one undo step, Rec on or off — Rec keys
//   what you change, ◆ Key keys the selection now; the toast names what was keyed and when ("Keyed L Upper Arm ·
//   frame 24");
// - hold (a right-click with a mouse): *All channels* · *Only changed channels* · *Selected channels* (the last one
//   while channels are selected in Numbers or Keys), each one `key.set` run;
// - nothing selected: greyed, and a tap says "Select a body part to key";
// - the diamond is filled while the playhead sits on a key of the selection, hollow otherwise.
// The first tap on ● Rec or ◆ Key shows the coach mark that tells them apart (ST-KEY-4).
import { Cluster, useLongPress } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import { animateWords } from '../../i18n/animate';
import { coachOnce } from '../../shell/coach';
import type { HaloController } from '../../shell/controller';
import { useDocumentVersion, useSessionValue } from '../../shell/hooks';
import { type AnimateUiStore, useAnimateUi } from '../../stages/animate/ui';
import type { TimeUnit } from '../units';
import { type KeyChoice, keyButtonState, keyCall, keyChoices, keyedText, keyWhen } from './key';

const w = animateWords.thread;

const keyClass =
  'inline-flex h-(--touch-hit) min-w-(--touch-hit) shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-touch-inner px-2.5 text-touch font-medium text-fg-2 hover:bg-hover hover:text-fg active:bg-pressed data-open:bg-accent-soft data-open:text-fg aria-disabled:cursor-default aria-disabled:opacity-45';

/** ◆ Key's own toasts share one place: a key replaces an earlier "Select a body part to key" in place. */
const KEY_TOAST = 'thread-key';

/** The first tap on ● Rec or ◆ Key says what each does, once on this device (ST-KEY-4). */
export function coachRecKey(controller: HaloController): void {
  coachOnce(controller.ctx, 'recKey', w.coachRecKey);
}

/** Keys the selection now: one `key.set` (one undo step); the toast names what was keyed and when. */
async function keyNow(controller: HaloController, choice: KeyChoice, units: TimeUnit): Promise<void> {
  const { ctx } = controller;
  const state = keyButtonState(ctx.app);
  if (state.reason !== null) {
    ctx.toasts.push({ key: KEY_TOAST, text: state.reason });
    return;
  }
  const call = keyCall(choice);
  const result = await ctx.run(call.op, call.args);
  // a refusal already says why (the shell's `run`)
  if (result.status === 'finished') ctx.toasts.push({ key: KEY_TOAST, text: keyedText(state, choice, units) });
}

function Diamond({ filled }: { readonly filled: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 14 14" className="shrink-0">
      <path
        d="M7 1.4 12.6 7 7 12.6 1.4 7z"
        fill={filled ? 'var(--key-tick,#e5484d)' : 'none'}
        stroke={filled ? 'var(--key-tick,#e5484d)' : 'currentColor'}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** ◆ Key: tap keys the selection at the playhead; hold for which channels. */
export function KeyButton({
  controller,
  ui,
  menu,
  onMenu,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
  /** The long-press menu is open. */
  readonly menu: boolean;
  readonly onMenu: (open: boolean) => void;
}): JSX.Element {
  const { ctx } = controller;
  const { app, store } = ctx;
  useSessionValue(app, (s) => s.selection);
  useSessionValue(app, (s) => s.time.sceneFrame);
  useSessionValue(app, (s) => s.activeClip);
  useDocumentVersion(app);
  const units = useAnimateUi(ui, (s) => s.units);
  const state = keyButtonState(app);
  const count = (): void => store.set((s) => ({ touches: s.touches + 1 }));
  const tap = (): void => {
    count();
    coachRecKey(controller);
    onMenu(false);
    void keyNow(controller, 'all', units);
  };
  const press = useLongPress({
    onTap: tap,
    onLongPress: () => {
      count();
      coachRecKey(controller);
      ui.set({ transport: false, playMenu: false });
      onMenu(!menu);
    },
  });
  const disabled = state.reason !== null;
  return (
    <button
      type="button"
      className={`${keyClass} ${state.onKey ? 'text-fg' : ''}`}
      aria-label={disabled ? `${w.key}. ${state.reason}` : w.keyName(keyWhen(state.frame, state.fps, units))}
      aria-disabled={disabled || undefined}
      data-open={menu ? '' : undefined}
      title={disabled ? (state.reason ?? undefined) : undefined}
      data-testid="halo-thread-key"
      data-keyed={state.onKey ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tap();
        }
      }}
      {...press}
    >
      <Diamond filled={state.onKey} />
      <span>{w.key}</span>
    </button>
  );
}

/** ◆ Key's long-press: which channels to key, each one `key.set` run (greyed items say why when tapped). */
export function KeyMenu({
  controller,
  ui,
  onClose,
}: {
  readonly controller: HaloController;
  readonly ui: AnimateUiStore;
  readonly onClose: () => void;
}): JSX.Element {
  const { ctx } = controller;
  const { app, store } = ctx;
  useSessionValue(app, (s) => s.selection);
  useSessionValue(app, (s) => s.overrides);
  useSessionValue(app, (s) => s.time.sceneFrame);
  useDocumentVersion(app);
  const units = useAnimateUi(ui, (s) => s.units);
  const choices = keyChoices(app, keyButtonState(app));
  return (
    <Cluster
      data-halo-chrome=""
      data-testid="halo-thread-key-menu"
      role="menu"
      aria-label={w.keyMenu}
      className="pointer-events-auto flex flex-wrap items-center gap-1 p-[5px]"
    >
      {choices.map((item) => (
        <button
          key={item.choice}
          type="button"
          role="menuitem"
          aria-disabled={item.reason === null ? undefined : true}
          title={item.reason ?? undefined}
          data-testid={`halo-key-menu-${item.choice}`}
          className={keyClass}
          onClick={() => {
            store.set((s) => ({ touches: s.touches + 1 }));
            if (item.reason !== null) {
              ctx.toasts.push({ key: KEY_TOAST, text: item.reason });
              return;
            }
            onClose();
            void keyNow(controller, item.choice, units);
          }}
        >
          {item.label}
        </button>
      ))}
    </Cluster>
  );
}
