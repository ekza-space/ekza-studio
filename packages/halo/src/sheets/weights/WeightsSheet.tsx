// Weights (STUDIO-TOUCH-SPEC §12.4 "Fix weights", §15 rows 6.3, 6.8, 6.12; T9): the brush tray's ⋯ —
// - **Fix weights**: Mirror, Smooth, Prune small, Normalize and Remove unused bones, each with ⚙ Options (the
//   operator's own option box, its ParamDefs at touch density; Pro's Rig Toolkit buttons, §6.3's Options lint);
// - **Brush**: the falloff, Surface or through the body, front faces only, and what the brush does (paint, or select
//   points for *Set weight…*);
// - **Set weight…** on the selected points (`skin.weights.set`, the first UI for it): the numpad's value for the bone
//   painting goes to.
// Every control runs an operator; the brush settings are `skin.paint.set` and `skin.paint.mode`, as Pro's panel runs.
import type { ParamDef } from '@ekza-studio/anim-core';
import type { BrushSettings } from '@ekza-studio/editor-core';
import { Segmented, SheetGroup, SheetRow, ToggleChip, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useState } from 'react';
import { rigWords } from '../../i18n/rig';
import type { HaloSheetProps } from '../../manifest/sheets';
import { boneLabel } from '../../stages/rig/model';
import { reasonOf } from '../../stages/rig/poll';
import type { RigStage } from '../../stages/rig/start';
import { HaloSheet, NumberControl, ParamControl, useAppVersion } from '../more/kit';

const w = rigWords.weights;

/** The weight fixes of §12.4, in the order the spec lists them. */
export const WEIGHT_FIXES: readonly { readonly op: string; readonly label: string }[] = [
  { op: 'skin.weights.mirror', label: w.mirror },
  { op: 'skin.weights.smooth', label: w.smooth },
  { op: 'skin.weights.prune', label: w.prune },
  { op: 'skin.weights.normalize', label: w.normalize },
  { op: 'skin.palette.compact', label: w.removeUnused },
];

function FixRow({
  ctx,
  rig,
  op,
  label,
}: HaloSheetProps & { readonly rig: RigStage; readonly op: string; readonly label: string }): JSX.Element {
  const { app } = ctx.host;
  const def = app.operators.get(op);
  const params: readonly ParamDef[] = (def?.params ?? []).filter((p) => p.hidden !== true && p.kind !== 'data');
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(params.map((p) => [p.name, p.default])),
  );
  const reason = reasonOf(app, op, open ? values : undefined);
  return (
    <div className="flex flex-col gap-1" data-testid={`halo-weights-${op}`}>
      <SheetRow
        title={label}
        detail={reason ?? def?.label}
        disabled={reason !== null}
        trailing={
          <span className="flex gap-1.5">
            {params.length === 0 ? null : (
              <TouchButton variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
                ⚙ {w.options}
              </TouchButton>
            )}
            <TouchButton
              variant="primary"
              disabled={reason !== null}
              data-testid={`halo-weights-run-${op}`}
              onClick={() => {
                rig.touch();
                void ctx.run(op, open ? values : undefined);
              }}
            >
              {w.run}
            </TouchButton>
          </span>
        }
      />
      {open ? (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {params.map((param) => (
            <ParamControl
              key={param.name}
              param={param}
              value={values[param.name]}
              onChange={(value) => setValues({ ...values, [param.name]: value })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function WeightsSheet({ ctx, rig, args }: HaloSheetProps & { readonly rig: RigStage }): JSX.Element {
  const { app } = ctx.host;
  useAppVersion(app);
  const state = app.session.getState();
  const brush = state.rig.paint.brush;
  const mode = state.rig.paint.mode;
  const active = state.rig.activeInfluence;
  const [value, setValue] = useState(1);
  const set = (patch: Partial<BrushSettings>): void => {
    rig.touch();
    void ctx.run('skin.paint.set', { patch });
  };
  // the selected points (Brush does › Select points) are `skin.weights.set`'s own default
  const setArgs = active === null ? null : { value, mode: 'set' as const, joint: active.joint, mesh: active.mesh };
  const setReason = setArgs === null ? rigWords.paint.pickBone : reasonOf(app, 'skin.weights.set', setArgs);
  return (
    <HaloSheet ctx={ctx} id="weights" title={w.title}>
      <SheetGroup>{w.fix}</SheetGroup>
      {WEIGHT_FIXES.map((fix) => (
        <FixRow
          key={fix.op}
          ctx={ctx}
          rig={rig}
          op={fix.op}
          label={fix.label}
          {...(args === undefined ? {} : { args })}
        />
      ))}
      <SheetGroup>{w.brush}</SheetGroup>
      <div className="flex flex-col gap-2 py-1">
        <Segmented<BrushSettings['falloff']>
          label={w.falloff}
          data-testid="halo-weights-falloff"
          value={brush.falloff}
          onValueChange={(falloff) => set({ falloff })}
          items={(['smooth', 'linear', 'constant'] as const).map((value) => ({
            value,
            label: w.falloffs[value] ?? value,
          }))}
        />
        <Segmented<BrushSettings['reach']>
          label={w.reach}
          data-testid="halo-weights-reach"
          value={brush.reach}
          onValueChange={(reach) => set({ reach })}
          items={[
            { value: 'surface', label: w.surface },
            { value: 'volume', label: w.volume },
          ]}
        />
        <ToggleChip
          label={w.frontOnly}
          pressed={brush.frontOnly}
          data-testid="halo-weights-front"
          onPressedChange={(frontOnly) => set({ frontOnly })}
        />
        <Segmented<'paint' | 'select'>
          label={w.mode}
          data-testid="halo-weights-mode"
          value={mode}
          onValueChange={(next) => {
            rig.touch();
            void ctx.run('skin.paint.mode', { mode: next });
          }}
          items={[
            { value: 'paint', label: w.paintMode },
            { value: 'select', label: w.selectMode },
          ]}
        />
      </div>
      <SheetGroup>{w.setWeight}</SheetGroup>
      <div className="flex flex-wrap items-center gap-2 py-1" data-testid="halo-weights-set">
        <span className="text-fg-2">
          {active === null ? rigWords.paint.pickBone : w.setWeightOn(boneLabel(app, active.joint))}
        </span>
        <NumberControl label={rigWords.paint.value} value={value} step={0.05} min={0} max={1} onCommit={setValue} />
        <TouchButton
          variant="primary"
          disabled={setReason !== null}
          title={setReason ?? w.noPoints}
          onClick={() => {
            rig.touch();
            if (setArgs !== null) void ctx.run('skin.weights.set', setArgs);
          }}
        >
          {w.run}
        </TouchButton>
      </div>
    </HaloSheet>
  );
}
