// Checks (STUDIO-TOUCH-SPEC §12.1, §15 rows 5.3 and 5.14; T9): the Rig stage's checks in plain words, from the one
// readiness list (§7.2: the same rows as Health, the status corner and Share), each with its Fix:
// - **Before rigging**: Auto-Rig's model check (stand up → size → freeze → centre → face, its fix order from
//   `editor-core/autorigFlow`, through Halo's flow host — Home's intake report when there is one, else *Check the
//   model*); each Fix is Auto-Rig's own `applyFix` (one `autorig.fix` step, then the report again), *Fix them in order*
//   runs them as ① does;
// - **Rig**: the rig checklist and the Validation rows for the destination (its profile follows the destination),
//   with Fix and Show me;
// - **Fix where it bends badly ▸** (§9.11): the break-finder recipe (the Test pose and the bend test).
import {
  type AutoRigFix,
  applyFix,
  liveSubjectMeshes,
  nextFix,
  reinspectSubject,
  takeHandedSubject,
} from '@ekza-studio/editor-core';
import { SheetGroup, SheetRow, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useState } from 'react';
import { haloFlowHost } from '../../intake/flowHost';
import { rigWords } from '../../i18n/rig';
import type { HaloSheetProps } from '../../manifest/sheets';
import { subjectOfDocument } from '../../recipes/rigIt';
import type { RigStage } from '../../stages/rig/start';
import { healthModel, modelCheckRows, type ModelCheckRun } from '../health/model';
import { HaloSheet, useAppVersion } from '../more/kit';

const w = rigWords.checks;

export default function ChecksSheet({ ctx, rig }: HaloSheetProps & { readonly rig: RigStage }): JSX.Element {
  const { app } = ctx.host;
  useAppVersion(app);
  const [busy, setBusy] = useState(false);
  const host = haloFlowHost({ app, run: (op, a) => ctx.run(op, a) });
  const flow = host.state.get();
  const meshes = liveSubjectMeshes(app, flow.subject);
  const run: ModelCheckRun | null =
    flow.intake === null || meshes.length === 0 ? null : { report: flow.intake, meshes };
  const model = healthModel(app, ctx.destination, null);
  const rigRows = model.groups.find((g) => g.stage === 'rig')?.rows ?? [];
  const checks = run === null ? null : modelCheckRows(app, run);
  const failing = (checks ?? []).filter((row) => !row.ok);
  const touch = (): void => rig.touch();

  const work = (fn: () => Promise<unknown>): void => {
    touch();
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };
  const check = (): void =>
    work(async () => {
      if (liveSubjectMeshes(app, host.state.get().subject).length === 0) {
        const subject = subjectOfDocument(app);
        if (subject !== null && subject.character === null) await takeHandedSubject(host, subject);
      } else await reinspectSubject(host);
    });
  const fix = (fixId: AutoRigFix): void => work(() => applyFix(host, fixId));
  const fixAll = (): void =>
    work(async () => {
      const done = new Set<AutoRigFix>();
      for (let next = nextFix(host); next !== null && !done.has(next) && done.size < 5; next = nextFix(host)) {
        done.add(next);
        const outcome = await applyFix(host, next);
        if (outcome.status !== 'finished') return;
      }
    });

  return (
    <HaloSheet ctx={ctx} id="checks" title={w.title} description={`${w.profile} ${model.destination.name}`}>
      <SheetGroup>{w.before}</SheetGroup>
      {checks === null ? (
        <p className="m-0 px-1 py-2 text-touch-label text-fg-2">{w.beforeEmpty}</p>
      ) : (
        checks.map((row) => (
          <SheetRow
            key={row.fix}
            title={row.label}
            detail={row.ok ? '✓' : row.problem}
            trailing={
              row.ok || row.action === null ? null : (
                <TouchButton
                  variant="primary"
                  disabled={busy || !row.action.enabled}
                  title={row.action.reason ?? undefined}
                  data-testid={`halo-checks-fix-${row.fix}`}
                  onClick={() => fix(row.fix)}
                >
                  {w.fix}
                </TouchButton>
              )
            }
          />
        ))
      )}
      <div className="flex flex-wrap gap-2 py-2">
        <TouchButton
          disabled={busy || model.inspect.reason !== null}
          title={model.inspect.reason ?? undefined}
          data-testid="halo-checks-inspect"
          onClick={check}
        >
          {checks === null ? w.check : w.checkAgain}
        </TouchButton>
        {failing.length > 1 ? (
          <TouchButton variant="primary" disabled={busy} data-testid="halo-checks-fix-all" onClick={fixAll}>
            {w.fixInOrder}
          </TouchButton>
        ) : null}
      </div>
      <SheetGroup>{w.rig}</SheetGroup>
      {rigRows.length === 0 ? (
        <p className="m-0 px-1 py-2 text-touch-label text-fg-2" data-testid="halo-checks-rig-clean">
          {w.nothing} {model.destination.name}
        </p>
      ) : (
        rigRows.map((row) => (
          <SheetRow
            key={row.id}
            title={row.text}
            detail={row.why}
            trailing={
              <span className="flex gap-1.5">
                {row.fix === null ? null : (
                  <TouchButton
                    variant="primary"
                    data-testid={`halo-checks-row-fix-${row.id}`}
                    onClick={() => {
                      touch();
                      const action = row.fix;
                      if (action === null) return;
                      if (action.sheet !== undefined) ctx.open(action.sheet);
                      else void ctx.run(action.op, action.args);
                    }}
                  >
                    {w.fix}
                  </TouchButton>
                )}
                {row.show === null ? null : (
                  <TouchButton
                    variant="ghost"
                    onClick={() => {
                      touch();
                      const action = row.show;
                      if (action !== null) void ctx.run(action.op, action.args);
                    }}
                  >
                    {w.showMe}
                  </TouchButton>
                )}
              </span>
            }
          />
        ))
      )}
      <SheetGroup>{w.fixBend}</SheetGroup>
      <SheetRow
        title={w.fixBend}
        detail={w.fixBendDetail}
        trailing={<span aria-hidden="true">▸</span>}
        onClick={() => {
          touch();
          ctx.close();
          void rig.fixBend();
        }}
      />
    </HaloSheet>
  );
}
