// All bones (STUDIO-TOUCH-SPEC §12.4 step 3, §15 rows 6.6–6.7; T9): the bones the bound meshes follow — Pro's Paint
// Weights list (the union of the meshes' palettes, the points each one weights) at touch density, by body order, A–Z
// or flat, with a filter; a tap makes the bone the one painting goes to (`skin.influence.setActive`), its lock holds it
// (`skin.influence.hold`: painting leaves a held bone alone), *Hold all* / *Release all*. The order is this sheet's
// own (Studio Pro's remembered sort is a preference Halo never writes implicitly, §16.4).
import { skinTargets } from '@ekza-studio/editor-core';
import { SheetGroup, Segmented, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useState } from 'react';
import { rigWords } from '../../i18n/rig';
import type { HaloSheetProps } from '../../manifest/sheets';
import { boneRows } from '../../stages/rig/model';
import type { RigStage } from '../../stages/rig/start';
import { HaloSheet, useAppVersion } from '../more/kit';

const w = rigWords.bones;

export default function BonesSheet({ ctx, rig }: HaloSheetProps & { readonly rig: RigStage }): JSX.Element {
  const { app } = ctx.host;
  useAppVersion(app);
  const [sort, setSort] = useState<'hierarchy' | 'alpha' | 'flat'>('hierarchy');
  const [filter, setFilter] = useState('');
  const mesh = skinTargets(app)[0];
  const active = app.session.getState().rig.activeInfluence?.joint ?? null;
  const needle = filter.trim().toLowerCase();
  const rows = boneRows(app, sort).filter(
    (row) => needle === '' || row.label.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
  );
  return (
    <HaloSheet ctx={ctx} id="bones" title={w.title}>
      {mesh === undefined ? (
        <p className="m-0 py-2 text-fg-2">{w.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-1">
            <input
              type="search"
              className="min-h-(--touch-hit) min-w-0 flex-1 rounded-touch-inner border border-line bg-field px-3 text-touch-input text-fg"
              placeholder={w.filter}
              aria-label={w.filter}
              value={filter}
              data-testid="halo-bones-filter"
              onChange={(e) => setFilter(e.target.value)}
            />
            <Segmented<'hierarchy' | 'alpha' | 'flat'>
              label={w.sort}
              data-testid="halo-bones-sort"
              value={sort}
              onValueChange={setSort}
              items={[
                { value: 'hierarchy', label: w.hierarchy },
                { value: 'alpha', label: w.alpha },
                { value: 'flat', label: w.flat },
              ]}
            />
          </div>
          <div className="flex gap-2 py-1">
            <TouchButton
              variant="ghost"
              data-testid="halo-bones-hold-all"
              onClick={() => {
                rig.touch();
                void ctx.run('skin.influence.holdAll');
              }}
            >
              {w.holdAll}
            </TouchButton>
            <TouchButton
              variant="ghost"
              data-testid="halo-bones-release-all"
              onClick={() => {
                rig.touch();
                void ctx.run('skin.influence.releaseAll');
              }}
            >
              {w.releaseAll}
            </TouchButton>
          </div>
          <SheetGroup>{w.title}</SheetGroup>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={w.title} data-testid="halo-bones-list">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-1"
                style={{ paddingLeft: `${8 * Math.min(row.depth, 8)}px` }}
              >
                <TouchButton
                  variant={row.key === active ? 'primary' : 'ghost'}
                  aria-current={row.key === active}
                  className={`min-w-0 flex-1 justify-between gap-2 ${row.role === 'bone' ? '' : 'italic'}`}
                  data-testid={`halo-bone-${row.key}`}
                  onClick={() => {
                    rig.touch();
                    void ctx.run('skin.influence.setActive', { mesh, joint: row.key });
                  }}
                >
                  <span className="truncate">
                    {row.label}
                    {row.label === row.name ? '' : <span className="text-fg-2"> · {row.name}</span>}
                  </span>
                  <span className="tabular-nums text-fg-2">{w.points(row.count)}</span>
                </TouchButton>
                <TouchButton
                  variant="ghost"
                  aria-pressed={row.held}
                  title={row.held ? w.held : undefined}
                  data-testid={`halo-bone-hold-${row.key}`}
                  onClick={() => {
                    rig.touch();
                    void ctx.run('skin.influence.hold', { joint: row.key, on: !row.held });
                  }}
                >
                  {row.held ? w.release : w.hold}
                </TouchButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </HaloSheet>
  );
}
