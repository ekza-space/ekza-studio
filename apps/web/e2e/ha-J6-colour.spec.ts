import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { centre, meshIds, paintSlice, paneCentre, touches } from './helpers/halo-make';
import { halo, haloMenu, openHalo, PANE } from './helpers/halo';
import { shareSettled } from './helpers/halo-share';
import { call, expectKernelStarted, lastExport, openEditor, runOk } from './helpers/test-api';
import { fingerDrag, fingerTap } from './helpers/touch';

// ha-J6 / ha-J6f Colour with swatches and export a GLB (STUDIO-TOUCH-SPEC §9 J6, §5.2.1, §22 AS-ST-4; T8 exit test),
// `chrome-touch`, from a fresh project with the real defaults (a character body made from Home, the starter palette):
// Path › Paint; tap a swatch (it is active and its Halo docks above the tray); strokes on the model (J6) or Fill part
// and a tap on the part (J6f, finger-only); Finish ▾ › Shiny in the open swatch Halo; Share › Game engine › Export.
// At most 8 touches plus strokes (J6) and 10 finger-only (J6f) — iOS's own *Save* counts one more on a device, here
// the export downloads. The colours Halo emitted, run in Studio Pro on a fresh project, export the same bytes (§22).

const touchOnly = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');
/** iOS's *Save* in the share sheet (a device's touch, not this browser's). */
const IOS_SAVE = 1;

async function bodyFromHome(page: Page): Promise<string> {
  await openHalo(page);
  await fingerTap(page, await centre(page, 'halo-home-make'));
  await fingerTap(page, await centre(page, 'halo-home-start-smooth'));
  await expect.poll(async () => (await meshIds(page)).length).toBe(1);
  const [mesh] = await meshIds(page);
  if (mesh === undefined) throw new Error('no mesh');
  return mesh;
}

async function toPaint(page: Page): Promise<void> {
  const tab = page.getByTestId('halo-path').getByRole('tab', { name: /^Paint/ });
  const box = await tab.boundingBox();
  if (box === null) throw new Error('no Paint tab');
  await fingerTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect.poll(async () => (await halo(page)).stage).toBe('paint');
  await expect(page.locator('[data-testid="halo-tray"][data-stage="paint"]')).toBeVisible();
}

const shaderOf = async (page: Page, swatch: string | null): Promise<string | undefined> =>
  (await call(page, 'palettes')).flatMap((p) => p.swatches).find((s) => s.id === swatch)?.shader;

async function shiny(page: Page): Promise<void> {
  const finish = haloMenu(page).getByRole('menuitem', { name: /^Finish/ });
  await expect(finish).toBeVisible();
  const box = await finish.boundingBox();
  if (box === null) throw new Error('no Finish');
  await fingerTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(page.getByTestId('halo-choices')).toBeVisible();
  await fingerTap(page, await centre(page, 'halo-choice-Shiny'));
}

/** Share › Game engine › Export (3); returns the exported file's hash. */
async function share(page: Page): Promise<{ name: string; sha256: string }> {
  await fingerTap(page, await centre(page, 'halo-share'));
  await expect(page.getByTestId('halo-sheet-share')).toBeVisible();
  await fingerTap(page, await centre(page, 'halo-share-dest-engine'));
  expect(await shareSettled(page)).toMatchObject({ status: 'ready' });
  const download = page.waitForEvent('download');
  await fingerTap(page, await centre(page, 'halo-share-export'));
  const name = (await download).suggestedFilename();
  await expect.poll(async () => (await lastExport(page))?.fileName).toBe(name);
  return { name, sha256: (await lastExport(page))?.sha256 ?? '' };
}

test('ha-J6: colour with swatches and export a GLB in ≤ 8 touches plus strokes', async ({ page }, testInfo) => {
  touchOnly(testInfo);
  test.setTimeout(180_000);
  const mesh = await bodyFromHome(page);
  const base = await touches(page);

  // 1. Path › Paint (1) → a swatch (1): active, its Halo docked above the tray
  await toPaint(page);
  await fingerTap(page, await centre(page, 'halo-swatch-3'));
  await expect.poll(async () => (await paintSlice(page)).focus).not.toBeNull();
  await expect.poll(async () => (await halo(page)).noun?.kind).toBe('swatch');
  const active = (await paintSlice(page)).active;
  expect(active).toBe((await paintSlice(page)).focus);
  // strokes on the model (not counted): one `mesh.paint` step each
  await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
  const steps = (await call(page, 'history')).undo.length;
  const c = await paneCentre(page);
  await fingerDrag(page, { x: c.x - 8, y: c.y - 90 }, { x: c.x + 8, y: c.y + 30 }, 14);
  await expect.poll(async () => (await call(page, 'history')).undo.length).toBe(steps + 1);
  expect((await call(page, 'lastOp'))?.id).toBe('mesh.paint');
  const stroke = (await call(page, 'lastOp'))?.args ?? {};
  // the swatch's Halo is still open after the stroke
  expect((await halo(page)).noun?.kind).toBe('swatch');

  // 2. Finish ▾ › Shiny (2)
  await shiny(page);
  await expect.poll(() => shaderOf(page, active)).toBe('blinn');

  // 3. Share › Game engine › Export (3) (+ iOS Save on a device)
  const halos = await share(page);
  const used = (await touches(page)) - base + IOS_SAVE;
  testInfo.annotations.push({ type: 'touches', description: `${used} (with iOS Save)` });
  expect(used).toBeLessThanOrEqual(8);
  expect(halos.name).toMatch(/\.glb$/);

  // §22: the same steps in Studio Pro export the same bytes
  const glb = await staticGlb(page, mesh);
  await replayInPro(page, { halo: glb, slot: Number(stroke['slot']), paint: stroke, fill: false }, testInfo);
});

test('ha-J6f: finger-only — Fill part and a tap colour a part, ≤ 10 touches', async ({ page }, testInfo) => {
  touchOnly(testInfo);
  test.setTimeout(180_000);
  const mesh = await bodyFromHome(page);
  const base = await touches(page);
  await toPaint(page);
  await fingerTap(page, await centre(page, 'halo-swatch-4'));
  await expect.poll(async () => (await halo(page)).noun?.kind).toBe('swatch');
  // Fill part (1) → a tap on the part (1): the whole shell, one step
  await fingerTap(page, await centre(page, 'halo-paint-fill'));
  await expect.poll(async () => (await paintSlice(page)).fill).toBe(true);
  await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
  const steps = (await call(page, 'history')).undo.length;
  await fingerTap(page, await paneCentre(page));
  await expect.poll(async () => (await call(page, 'history')).undo.length).toBe(steps + 1);
  expect((await call(page, 'lastOp'))?.id).toBe('mesh.paint.fillShell');
  const fill = (await call(page, 'lastOp'))?.args ?? {};
  await shiny(page);
  await expect.poll(async () => shaderOf(page, (await paintSlice(page)).active)).toBe('blinn');
  const halos = await share(page);
  const used = (await touches(page)) - base + IOS_SAVE;
  testInfo.annotations.push({ type: 'touches', description: `${used} (with iOS Save)` });
  expect(used).toBeLessThanOrEqual(10);
  expect(halos.name).toMatch(/\.glb$/);
  const glb = await staticGlb(page, mesh);
  await replayInPro(page, { halo: glb, slot: Number(fill['slot']), paint: fill, fill: true }, testInfo);
});

/** The static GLB of a mesh through one explicit request (the same in both layouts). */
async function staticGlb(page: Page, mesh: string): Promise<string> {
  await runOk(page, 'file.exportModel', { objects: [mesh], fileName: 'j6.glb', profile: 'local/generic' });
  await expect.poll(async () => (await lastExport(page))?.fileName).toBe('j6.glb');
  return (await lastExport(page))?.sha256 ?? '';
}

/**
 * §22 AS-ST-5: the colours Halo emitted (the stroke's or the fill's `mesh.paint*` and Finish's `palette.setSwatch`) run
 * in Studio Pro on a fresh project with the same start; the same static GLB request gives the same bytes.
 */
async function replayInPro(
  page: Page,
  run: {
    readonly halo: string;
    readonly slot: number;
    readonly paint: Record<string, unknown>;
    readonly fill: boolean;
  },
  testInfo: TestInfo,
): Promise<void> {
  await openEditor(page);
  await expectKernelStarted(page);
  await runOk(page, 'workspace.set', { workspace: 'model' });
  const made = await runOk<{ created: string[] }>(page, 'mesh.create.template', {
    template: 'humanoidBody',
    style: 'smooth',
  });
  const mesh = made.created.find((id) => id.startsWith('msh_')) ?? '';
  await expect
    .poll(async () => (await call(page, 'meshes')).find((row) => row.id === mesh)?.runtime, { timeout: 30_000 })
    .toBe('ready');
  await runOk(page, 'model.symmetry.set', { meshes: [mesh], mode: 'object-x' });
  // Pro's Assign Colour and Fill Shell outside the Paint Colour tool work in a component mode (the tool's own runs
  // need none); the mode is session state, never in the file
  await runOk(page, 'select.mode', { mode: 'face' });
  await runOk(page, run.fill ? 'mesh.paint.fillShell' : 'mesh.paint', { ...run.paint, meshes: [mesh] });
  const swatch = (await call(page, 'palettes')).flatMap((p) => p.swatches).find((s) => s.slot === run.slot)?.id;
  expect(swatch).toBeDefined();
  await runOk(page, 'palette.setSwatch', { swatch, shader: 'blinn' });
  const pro = await staticGlb(page, mesh);
  testInfo.annotations.push({ type: 'bytes', description: `${run.halo.slice(0, 12)} = ${pro.slice(0, 12)}` });
  expect(pro).toBe(run.halo);
}
