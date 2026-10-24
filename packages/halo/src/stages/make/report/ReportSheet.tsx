// Make editable's report (STUDIO-TOUCH-SPEC §6.7 `makeEditableReport`, §11 "its report opens in a sheet"; T8): what
// the last *Make editable* built — triangles, glTF vertices welded into points, hard edges, dropped degenerate
// triangles, the layers it carried over and its warnings — the same facts as Studio Pro's dialog
// (`lastMakeEditableReport`), at touch density. The kernel's `ui.open {dialog: 'makeEditableReport'}` opens it.
import { lastMakeEditableReport } from '@ekza-studio/editor-core';
import { TouchButton } from '@ekza-studio/ui/touch';
import type { JSX } from 'react';
import { makeWords } from '../../../i18n/make';
import type { HaloSheetProps } from '../../../manifest/sheets';
import { HaloSheet, useAppVersion } from '../../../sheets/more/kit';

export default function ReportSheet({ ctx }: HaloSheetProps): JSX.Element {
  const app = ctx.host.app;
  useAppVersion(app);
  const last = lastMakeEditableReport(app);
  const record = last === null ? undefined : app.store.get('meshes', last.mesh);
  const report = last?.report ?? null;
  const warnings = report === null ? [] : [...report.warnings];
  if (report?.hadTangents === true && !warnings.some((text) => text.includes('Tangent'))) {
    warnings.push('Tangents will be refused at export unless you drop them');
  }
  return (
    <HaloSheet
      ctx={ctx}
      id="makeEditableReport"
      title={record === undefined ? makeWords.report.title : `${record.name} is editable`}
      description="Edits are recorded as revisions of this mesh; the original file stays untouched."
      footer={
        <TouchButton variant="primary" className="flex-1" onClick={() => ctx.close()}>
          Done
        </TouchButton>
      }
    >
      {report === null ? (
        <p className="m-0 py-2 text-fg-2">{makeWords.report.nothing}</p>
      ) : (
        <div data-testid="halo-make-editable-report">
          <dl className="m-0 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-2 px-2.5 py-2 text-touch">
            {(
              [
                ['Triangles', String(report.triangles)],
                ['Points', `${report.pointsBefore} → ${report.pointsAfter}`],
                ['Hard edges', String(report.hardEdges)],
                ['Dropped triangles', report.degenerateDropped === 0 ? 'none' : String(report.degenerateDropped)],
                ['Layers', report.layers.length === 0 ? 'positions only' : report.layers.join(', ')],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-fg-2">{term}</dt>
                <dd className="m-0 text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          {warnings.map((warning) => (
            <p key={warning} className="m-0 px-2.5 py-1 text-touch-label text-fg-2">
              ⚠ {warning}
            </p>
          ))}
        </div>
      )}
    </HaloSheet>
  );
}
