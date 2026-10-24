// The stage trays' small parts (STUDIO-TOUCH-SPEC §4.1 tray, §6.2 ▾ petals; T8, shared by Make and Paint): a tray chip
// with an optional ▾, a toggle chip, and the menu a ▾ chip opens above the tray (a `menu` of `menuitem`s; a greyed item
// says why when tapped, §6.3). Every tap here is one touch of the journey counter (AS-ST-4). 44 pt targets throughout.
import { Cluster } from '@ekza-studio/ui/touch';
import type { JSX, ReactNode } from 'react';
import type { ShellContext } from '../../shell/context';

/** One touch of the journey counter (§9: a deliberate tap, drag or filled field). */
export function touch(ctx: Pick<ShellContext, 'store'>): void {
  ctx.store.set((s) => ({ touches: s.touches + 1 }));
}

const chip =
  'inline-flex min-h-(--touch-hit) shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3 text-touch font-medium whitespace-nowrap text-fg-2 select-none';

export function TrayChip({
  label,
  icon,
  menu = false,
  open = false,
  pressed,
  disabledReason,
  testId,
  onPress,
  onReason,
}: {
  readonly label: string;
  readonly icon?: ReactNode;
  /** A ▾ chip: it opens a menu. */
  readonly menu?: boolean;
  readonly open?: boolean;
  /** A toggle: its state (`aria-pressed`). */
  readonly pressed?: boolean;
  readonly disabledReason?: string | null;
  readonly testId?: string;
  readonly onPress: () => void;
  readonly onReason?: (reason: string) => void;
}): JSX.Element {
  const disabled = disabledReason !== undefined && disabledReason !== null;
  return (
    <button
      type="button"
      data-testid={testId}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      aria-pressed={pressed}
      aria-disabled={disabled ? true : undefined}
      title={disabled ? (disabledReason ?? undefined) : undefined}
      className={`${chip} ${pressed === true || open ? 'border-accent/60 bg-accent-soft text-fg' : ''} ${
        disabled ? 'opacity-45' : 'active:bg-pressed'
      }`}
      onClick={() => {
        if (disabled) onReason?.(disabledReason ?? '');
        else onPress();
      }}
    >
      {icon}
      <span>{label}</span>
      {menu ? (
        <span aria-hidden="true" className="text-[12px] text-fg-3">
          ▾
        </span>
      ) : null}
      {pressed === undefined ? null : (
        <span
          aria-hidden="true"
          className={`ml-0.5 inline-block size-2.5 rounded-full ${pressed ? 'bg-accent' : 'border border-fg-3'}`}
        />
      )}
    </button>
  );
}

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /** Greyed with this reason (the tap says it, §6.3). */
  readonly reason?: string | null;
  /** A toggle's state. */
  readonly pressed?: boolean;
  /** The current choice. */
  readonly current?: boolean;
  readonly run: () => void;
}

export function TrayMenu({
  label,
  items,
  testId,
  onReason,
}: {
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly testId?: string;
  readonly onReason: (reason: string) => void;
}): JSX.Element {
  return (
    <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-(--z-popover) -translate-x-1/2">
      <Cluster
        role="menu"
        aria-label={label}
        data-testid={testId}
        className="flex max-w-[min(720px,calc(100vw-32px))] flex-wrap items-center justify-center gap-1 p-1"
      >
        {items.map((item) => {
          const reason = item.reason ?? null;
          return (
            <button
              key={item.id}
              type="button"
              role={item.pressed === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.pressed}
              aria-current={item.current === true ? 'true' : undefined}
              aria-disabled={reason === null ? undefined : true}
              data-testid={testId === undefined ? undefined : `${testId}-${item.id}`}
              className={`${chip} ${
                item.pressed === true || item.current === true ? 'border-accent/60 bg-accent-soft text-fg' : ''
              } ${reason === null ? 'active:bg-pressed' : 'opacity-45'}`}
              onClick={() => {
                if (reason !== null) onReason(reason);
                else item.run();
              }}
            >
              {item.label}
              {item.pressed === undefined ? null : (
                <span
                  aria-hidden="true"
                  className={`ml-1 inline-block size-2.5 rounded-full ${item.pressed ? 'bg-accent' : 'border border-fg-3'}`}
                />
              )}
            </button>
          );
        })}
      </Cluster>
    </div>
  );
}

/** The *Create with AI* mark (a sparkle; the Halo's own line icons have none). */
export function Sparkle(): JSX.Element {
  return (
    <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2z" strokeLinejoin="round" />
      <path d="M19 3.5v3M17.5 5h3" strokeLinecap="round" />
    </svg>
  );
}
