// A ▾ petal's choices (STUDIO-TOUCH-SPEC §6.2: *Finish ▾ › Shiny*, *Merge ▾ › to centre*, *New shape ▾ › Cube*; T8
// seam): the petal stays in its slot, and its choices show as one row beside the Halo — below the selection when there
// is room, else above it — never over the selection (AS-ST-18). A choice is one more touch and runs at once; the
// current one (a swatch's finish) is marked.
import { type Box, Cluster } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import type { HaloController } from '../shell/controller';
import { pollVerb, type Verb } from './verbSource';

export function ChoiceRow({
  controller,
  verb,
  box,
  width,
  height,
  insetBottom,
}: {
  readonly controller: HaloController;
  readonly verb: Verb;
  readonly box: Box | null;
  readonly width: number;
  readonly height: number;
  readonly insetBottom: number;
}): JSX.Element {
  const { ctx } = controller;
  const choices = verb.choices ?? [];
  const rowHeight = 56;
  const below = box === null ? height - insetBottom - rowHeight - 72 : box.bottom + 12;
  const top = below + rowHeight < height - insetBottom ? below : Math.max(80, (box?.top ?? height / 2) - rowHeight - 64);
  const left = Math.min(Math.max(16, box === null ? width / 2 - 160 : (box.left + box.right) / 2 - 160), width - 336);
  return (
    <div
      data-halo-chrome=""
      data-testid="halo-choices"
      data-for={verb.id}
      className="pointer-events-auto absolute"
      style={{ left: Math.max(16, left), top }}
    >
      <Cluster className="flex max-w-[min(560px,calc(100vw-32px))] flex-wrap items-center gap-1 p-1" role="menu" aria-label={verb.label}>
        {choices.map((choice) => {
          const poll = pollVerb(ctx.app, choice);
          const reason = poll === true ? null : poll.reason;
          return (
            <button
              key={choice.id}
              type="button"
              role="menuitem"
              data-testid={`halo-choice-${choice.label}`}
              aria-disabled={reason === null ? undefined : true}
              aria-current={choice.changed === true ? 'true' : undefined}
              className={`min-h-(--touch-hit) rounded-full px-4 text-[15px] ${
                choice.changed === true ? 'bg-accent-fill text-on-accent' : 'bg-transparent text-fg'
              } ${reason === null ? '' : 'opacity-50'}`}
              onClick={() => {
                if (reason !== null) {
                  ctx.toasts.push({ key: 'reason', text: reason });
                  return;
                }
                ctx.store.set({ sub: null });
                controller.runVerb(choice, 'petal');
              }}
            >
              {choice.label}
            </button>
          );
        })}
      </Cluster>
    </div>
  );
}
