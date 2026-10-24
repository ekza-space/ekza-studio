import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { centre, meshIds, paintSlice, paneCentre } from './helpers/halo-make';
import { halo, haloMenu, loadCubeLadInMake, openHalo, PANE } from './helpers/halo';
import { call, runOk } from './helpers/test-api';
import { fingerHold, fingerTap } from './helpers/touch';

// ha-09 Paint (STUDIO-TOUCH-SPEC §13.1, §5.5, §6.2 "Swatch", §4.8; T8 exit test) on `chrome-touch`: the swatch row (the
// first tap makes a swatch active and docks its Halo above the tray; a long-press opens the Halo and leaves the active
// one), *Pick* (the next tap on the model picks its colour), *Fill part* is the Thumb key's lock (one state), the
// palette sheet edits a swatch (hex, Finish) and adds one, and an imported model says plainly that painting it arrives
// later. On `webkit-ipad` (compatibility only): Paint boots with its swatches and a tapped swatch opens its Halo.

const touchOnly = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');

/** A character body made in Make (an authored mesh Paint can colour), then Paint. */
async function bodyInPaint(page: Page): Promise<string> {
  await openHalo(page, '&stage=make');
  await runOk(page, 'mesh.create.template', { template: 'humanoidBody', style: 'smooth' });
  await expect.poll(async () => (await meshIds(page)).length).toBe(1);
  const [mesh] = await meshIds(page);
  await page
    .getByTestId('halo-path')
    .getByRole('tab', { name: /^Paint/ })
    .click();
  await expect.poll(async () => (await halo(page)).stage).toBe('paint');
  await expect(page.locator('[data-testid="halo-tray"][data-stage="paint"]')).toBeVisible();
  return mesh ?? '';
}

const swatches = async (page: Page) => (await call(page, 'palettes')).flatMap((p) => p.swatches);

test.describe('ha-09: the Paint stage', () => {
  test('swatches, their Halo, Pick and Fill part (one state with the Thumb key)', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await bodyInPaint(page);
    // at rest: within the §4.8 budget, the row shows at most six swatches and +n
    await runOk(page, 'select.objects', { ids: [], mode: 'replace' });
    await expect.poll(async () => (await halo(page)).visibleTargets).toBeLessThanOrEqual(22);
    await expect(page.getByTestId('halo-swatches').locator('[data-swatch]')).toHaveCount(5);
    await expect(page.getByTestId('halo-swatches-more')).toHaveText('+11');
    expect((await paintSlice(page)).tool).toBe('paint');

    // a long-press opens the Halo without making the swatch active
    const before = (await paintSlice(page)).active;
    await fingerHold(page, await centre(page, 'halo-swatch-1'), 650);
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('swatch');
    expect((await paintSlice(page)).active).toBe(before);
    // the first tap makes it active and keeps its Halo docked over the tray
    await fingerTap(page, await centre(page, 'halo-swatch-2'));
    await expect.poll(async () => (await paintSlice(page)).active).not.toBe(before);
    const active = (await paintSlice(page)).active;
    expect((await halo(page)).noun).toEqual({ kind: 'swatch', id: active });
    await expect(haloMenu(page).getByRole('menuitem', { name: /^Finish/ })).toBeVisible();

    // Fill part is the Thumb key's lock (§5.5 one state): both light together
    await fingerTap(page, await centre(page, 'halo-paint-fill'));
    await expect.poll(async () => (await paintSlice(page)).fill).toBe(true);
    expect((await halo(page)).thumb).toMatchObject({ mode: 'locked', tap: 'fillPart' });
    await expect(page.getByTestId('halo-paint-fill')).toHaveAttribute('aria-pressed', 'true');
    await fingerTap(page, await centre(page, 'halo-paint-fill'));
    await expect.poll(async () => (await paintSlice(page)).fill).toBe(false);
    expect((await halo(page)).thumb.mode).toBe('off');

    // paint a face with the active swatch, then Pick another swatch and pick the painted face back
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    const c = await paneCentre(page);
    await fingerTap(page, c);
    await expect.poll(async () => (await call(page, 'lastOp'))?.id).toBe('mesh.paint');
    await fingerTap(page, await centre(page, 'halo-swatch-3'));
    await expect.poll(async () => (await paintSlice(page)).active).not.toBe(active);
    await fingerTap(page, await centre(page, 'halo-paint-pick'));
    await expect.poll(async () => (await paintSlice(page)).pick).toBe(true);
    // a second tap on the same spot within the multi-tap window would be a double-tap (it frames, §5.2)
    await page.waitForTimeout(500);
    await fingerTap(page, c);
    await expect.poll(async () => (await paintSlice(page)).active).toBe(active);
    // the spent Pick gives the Thumb key its Fill part back
    await expect.poll(async () => (await paintSlice(page)).pick).toBe(false);
  });

  test('the palette sheet edits a swatch and adds one', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await bodyInPaint(page);
    await fingerTap(page, await centre(page, 'halo-swatch-3'));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('swatch');
    const id = (await paintSlice(page)).active;
    // Edit colour opens the palette sheet at the swatch
    const edit = haloMenu(page).getByRole('menuitem', { name: /^Edit colour/ });
    const box = await edit.boundingBox();
    if (box === null) throw new Error('no Edit colour');
    await fingerTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(page.getByTestId('halo-sheet-palette')).toBeVisible();
    await expect(page.getByTestId('halo-palette-swatch')).toBeVisible();
    await page.getByTestId('halo-palette-hex').fill('#12ab34');
    await page.getByTestId('halo-palette-hex').blur();
    await expect.poll(async () => (await swatches(page)).find((s) => s.id === id)?.srgb).toEqual([0x12, 0xab, 0x34]);
    await page.getByTestId('halo-palette-finish').getByRole('radio', { name: 'Shiny' }).click();
    await expect.poll(async () => (await swatches(page)).find((s) => s.id === id)?.shader).toBe('blinn');
    const count = (await swatches(page)).length;
    await page.getByTestId('halo-palette-swatches').getByRole('button', { name: 'New swatch' }).click();
    await expect.poll(async () => (await swatches(page)).length).toBe(count + 1);
  });

  test('an imported model: painting it arrives later, and the tray says so', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    await openHalo(page);
    await loadCubeLadInMake(page);
    await page
      .getByTestId('halo-path')
      .getByRole('tab', { name: /^Paint/ })
      .click();
    await expect(page.getByTestId('halo-paint-imported')).toContainText('arrives later');
  });

  test('WebKit: Paint boots with its swatches; a tapped swatch opens its Halo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-ipad', 'webkit-ipad only');
    test.setTimeout(150_000);
    await bodyInPaint(page);
    await page.getByTestId('halo-swatch-3').tap();
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('swatch');
    await expect(haloMenu(page)).toBeVisible();
  });
});
