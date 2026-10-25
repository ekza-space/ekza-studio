import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { centre, makeSlice, meshIds, onCanvas, paneCentre, paneRect, runWithBytes, touches } from './helpers/halo-make';
import { halo, haloMenu, loadCubeLadInMake, openHalo, PANE, petal } from './helpers/halo';
import { call, runOk } from './helpers/test-api';
import { referenceImage } from './helpers/m6a-model-content';
import { fingerDrag, fingerTap } from './helpers/touch';
import { GEN_TOKEN, routeGateway } from './helpers/gen';

// ha-08 Make (STUDIO-TOUCH-SPEC §11, §6.2, §7.1, §4.8; T8 exit test; the owner's clean-up focus of 2026-10-24) on
// `chrome-touch`: an imported model is cleaned up by touch — the tray (selection level, Drag ▾, Cut ▾, Clean up ▾,
// New shape ▾, Create with AI), a part's Halo (Edit shape · Move · Separate · Delete · Reduce ▾ · Rig it), Select area
// (a marquee by finger), the Move ring dragged by finger, Multi-cut's session; G-a's Reduce answering with its own
// poll; *Clean up ▾ › Clean up for a game* taking a heavy AI-like model to the character budget and flat colours in
// one step; the cap handle drives the extrude session (one step per drag, Smart from the Thumb key); *Create with AI*
// shows only where a generation gateway is enabled. On `webkit-ipad` (compatibility only): Make boots with its tray
// and the sheet opens by touch.

const touchOnly = (info: TestInfo): void => test.skip(info.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');

async function tapId(page: Page, testId: string): Promise<void> {
  await fingerTap(page, await centre(page, testId));
}

test.describe('ha-08: the Make stage', () => {
  test('the tray and a part’s Halo clean up an imported model', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await openHalo(page);
    const meshes = await loadCubeLadInMake(page);
    await expect(page.getByTestId('halo-tray')).toHaveAttribute('data-stage', 'make');
    // at rest (nothing selected): within the §4.8 budget
    await runOk(page, 'select.objects', { ids: [], mode: 'replace' });
    await expect.poll(async () => (await halo(page)).visibleTargets).toBeLessThanOrEqual(22);

    // Clean up ▾: the intake leads (one row per budget); with nothing selected G-a's rows say why
    await tapId(page, 'halo-make-cleanup');
    const menu = page.getByTestId('halo-make-menu-cleanUp');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('halo-make-menu-cleanUp-intake-character')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('halo-make-menu-cleanUp-reduce')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('halo-make-menu-cleanUp-separate')).toBeVisible();
    await tapId(page, 'halo-make-cleanup');
    await expect(menu).toHaveCount(0);

    // a part: tap it, its Halo is the clean-up one
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    await fingerTap(page, await paneCentre(page));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('mesh');
    const petals = (await halo(page)).petals;
    expect(petals).toEqual(
      expect.arrayContaining([
        'view.tool:{"panel":"viewport","tool":"move"}',
        'mesh.separate',
        'scene.delete',
        'mesh.reduce',
      ]),
    );
    expect((await halo(page)).visibleTargets).toBeLessThanOrEqual(36);
    // Reduce ▾ (G-a's `mesh.reduce`): a Cube Lad part is already under every budget, so the petal is greyed and a
    // tap says why in G-a's words (§6.3)
    const reduce = petal(page, 'Reduce');
    await expect(reduce).toHaveAttribute('aria-disabled', 'true');
    const reduceBox = await reduce.boundingBox();
    if (reduceBox === null) throw new Error('no Reduce');
    await fingerTap(page, { x: reduceBox.x + reduceBox.width / 2, y: reduceBox.y + reduceBox.height / 2 });
    await expect(page.getByTestId('halo-toasts')).toContainText('Already under the budget');

    // Move: the ring comes, and a finger on its arrow moves the part (one step)
    const move = await petal(page, 'Move').boundingBox();
    if (move === null) throw new Error('no Move');
    await fingerTap(page, { x: move.x + move.width / 2, y: move.y + move.height / 2 });
    await expect.poll(async () => (await makeSlice(page)).tool).toBe('move');
    const steps = (await call(page, 'history')).undo.length;
    const pane = await paneRect(page);
    const arrow = await call(page, 'screenOfManipulator', PANE, 'tx');
    if (arrow !== null) {
      const at = { x: pane.x + arrow.x, y: pane.y + arrow.y };
      await fingerDrag(page, at, { x: at.x + 60, y: at.y }, 10);
      await expect.poll(async () => (await call(page, 'history')).undo.length).toBe(steps + 1);
    } else {
      testInfo.annotations.push({ type: 'manipulator', description: 'no tx grab point reported' });
    }

    // back to Select through the tray's Drag ▾, the move undone (the part is at the centre again)
    await tapId(page, 'halo-make-drag');
    await tapId(page, 'halo-make-menu-drag-select');
    await expect.poll(async () => (await makeSlice(page)).tool).toBe('select');
    if (arrow !== null) await runOk(page, 'edit.undo');

    // Delete the part from its Halo (one step); Undo brings it back
    await fingerTap(page, await paneCentre(page));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('mesh');
    const del = await petal(page, 'Delete').boundingBox();
    if (del === null) throw new Error('no Delete');
    const before = (await meshIds(page)).length;
    await fingerTap(page, { x: del.x + del.width / 2, y: del.y + del.height / 2 });
    await expect.poll(async () => (await meshIds(page)).length).toBe(before - 1);
    await runOk(page, 'edit.undo');
    await expect.poll(async () => (await meshIds(page)).length).toBe(before);
    expect(meshes.length).toBeGreaterThan(0);
  });

  test('Clean up ▾ › Clean up for a game takes a heavy model to the character budget and flat colours in one step', async ({
    page,
  }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(240_000);
    await openHalo(page, '&stage=make');
    await expect(page.getByTestId('halo-tray')).toHaveAttribute('data-empty', '');
    // an AI-like model (procedural, `@ekza-studio/io/testing`): 96,824 triangles, a textured atlas
    const imported = await runWithBytes(page, 'mesh.importStatic', { name: 'generated.glb' }, makeAiLikeGlb());
    expect(imported.status).toBe('finished');
    const [mesh] = (imported as { value: { meshes: string[] } }).value.meshes;
    if (mesh === undefined) throw new Error('no mesh');
    const tris = async (): Promise<number | undefined> =>
      (await call(page, 'meshes')).find((row) => row.id === mesh)?.counts?.tris;
    await expect.poll(tris, { timeout: 60_000 }).toBe(96_824);
    // the part is selected by a finger tap (its Halo opens; the tray's rows run on the selection)
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    await fingerTap(page, await paneCentre(page));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('mesh');
    const steps = (await call(page, 'history')).undo.length;
    const touched = await touches(page);

    // Clean up ▾ › Clean up for a game: Character ≤ 3k — two touches, one step
    await tapId(page, 'halo-make-cleanup');
    await expect(page.getByTestId('halo-make-menu-cleanUp-intake-character')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await tapId(page, 'halo-make-menu-cleanUp-intake-character');
    await expect.poll(async () => (await call(page, 'history')).undo.length, { timeout: 120_000 }).toBe(steps + 1);
    expect((await call(page, 'history')).undo.at(-1)).toBe('Intake');
    expect((await touches(page)) - touched).toBe(2);
    expect((await call(page, 'lastOp'))?.id).toBe('mesh.intake');
    // the character budget and at most 16 flat colours (a new palette, one swatch per face)
    const after = (await tris()) ?? 0;
    expect(after).toBeLessThanOrEqual(3000);
    expect(after).toBeGreaterThan(500);
    const row = (await call(page, 'meshes')).find((r) => r.id === mesh);
    expect(row?.palette).not.toBeNull();
    const colours = (await call(page, 'palettes')).find((p) => p.id === row?.palette)?.swatches.length ?? 0;
    expect(colours).toBeGreaterThan(1);
    expect(colours).toBeLessThanOrEqual(16);
    testInfo.annotations.push({
      type: 'intake',
      description: `96,824 → ${String(after)} triangles, ${String(colours)} colours`,
    });

    // one undo step: Undo brings the imported model back whole
    await runOk(page, 'edit.undo');
    await expect.poll(tris).toBe(96_824);
    expect((await call(page, 'history')).undo.length).toBe(steps);
  });

  test('Select area draws a marquee by finger; Cut ▾ opens Multi-cut’s session', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await openHalo(page);
    await loadCubeLadInMake(page);
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    await fingerTap(page, await paneCentre(page));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('mesh');
    await tapId(page, 'halo-pick-face');
    await expect.poll(async () => (await call(page, 'state')).mode).toBe('face');
    // Drag ▾ › Select area: a finger drag over the model selects faces instead of turning the view
    await tapId(page, 'halo-make-drag');
    await tapId(page, 'halo-make-menu-drag-selectArea');
    await expect.poll(async () => (await makeSlice(page)).selectArea).toBe(true);
    const camera0 = await call(page, 'cameraOf', PANE);
    const c = await paneCentre(page);
    // from a point on the model the Halo does not cover, up and across it
    const from = { x: c.x + 90, y: c.y + 90 };
    expect(await onCanvas(page, from)).toBe(true);
    await fingerDrag(page, from, { x: c.x - 90, y: c.y - 60 }, 12);
    await expect
      .poll(async () => Object.values((await call(page, 'model')).selected).some((s) => s.face.length > 0))
      .toBe(true);
    expect((await call(page, 'cameraOf', PANE)).position).toEqual(camera0.position);
    // Cut ▾ › Multi-cut: its session bar
    await tapId(page, 'halo-make-cut');
    await tapId(page, 'halo-make-menu-cut-multiCut');
    await expect(page.getByTestId('halo-session')).toHaveAttribute('data-session', 'multiCut');
    await tapId(page, 'halo-session-cancel');
    await expect(page.getByTestId('halo-session')).toHaveCount(0);
  });

  test('the cap handle: one step per drag, the Thumb key’s Smart starts a new extrude', async ({ page }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await openHalo(page);
    await loadCubeLadInMake(page);
    await tapId(page, 'halo-pick-face');
    await expect.poll(async () => (await call(page, 'state')).mode).toBe('face');
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    await fingerTap(page, await paneCentre(page));
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('faces');
    const pull = await petal(page, 'Pull').boundingBox();
    if (pull === null) throw new Error('no Pull');
    await fingerTap(page, { x: pull.x + pull.width / 2, y: pull.y + pull.height / 2 });
    await expect(page.getByTestId('halo-cap-handle')).toBeVisible();
    const steps = (await call(page, 'history')).undo.length;
    const drag = async (px: number): Promise<void> => {
      const cap = (await makeSlice(page)).cap;
      if (cap === null) throw new Error('no cap');
      const h = await centre(page, 'halo-cap-handle');
      await fingerDrag(page, h, { x: h.x + cap.dx * px, y: h.y + cap.dy * px }, 10);
    };
    await drag(50);
    await expect.poll(async () => Number((await call(page, 'lastOp'))?.args['localTranslateZ'])).toBeGreaterThan(0);
    const first = Number((await call(page, 'lastOp'))?.args['localTranslateZ']);
    await drag(40);
    await expect.poll(async () => Number((await call(page, 'lastOp'))?.args['localTranslateZ'])).toBeGreaterThan(first);
    // two drags: still the one extrude step (each drag is one Adjust Last)
    expect((await call(page, 'history')).undo.length).toBe(steps);
    // Smart (the Thumb key's drag meaning on the cap, Pro's Shift at drag start): a new extrude from the cap
    await expect.poll(async () => (await halo(page)).thumb.drag).toBe('smart');
    await tapId(page, 'halo-thumb');
    await drag(40);
    await expect.poll(async () => (await call(page, 'history')).undo.length).toBe(steps + 1);
    expect((await call(page, 'lastOp'))?.id).toBe('mesh.extrude');
    // ✓ Done ends the session and keeps it
    await tapId(page, 'halo-session-done');
    await expect.poll(async () => (await makeSlice(page)).extrude).toBe(false);
    await expect(page.getByTestId('halo-cap-handle')).toHaveCount(0);
    expect(haloMenu).toBeDefined();
  });

  test('a reference image: a tap in the view that shows it selects it; its Halo hides it; a scene pick lets it go', async ({
    page,
  }, testInfo) => {
    touchOnly(testInfo);
    test.setTimeout(150_000);
    await openHalo(page);
    await loadCubeLadInMake(page);
    const png = [...referenceImage('reference-front.png')];
    const { id } = await runOk<{ id: string }>(page, 'imagePlane.import', {
      camera: 'front',
      name: 'Front ref',
      bytes: png,
    });
    await runOk(page, 'view.lookThrough', { paneId: PANE, camera: { kind: 'view', preset: 'front' } });
    await runOk(page, 'view.frame', { what: 'all', paneId: PANE });
    await page.waitForTimeout(400);
    const c = await paneCentre(page);
    let found = false;
    // the reference is 2 m high with the image's aspect, behind the model: beside the legs it shows
    const candidates = [90, 120, -90, -120].flatMap((dx) => [-30, 60, 150].map((dy) => ({ x: c.x + dx, y: c.y + dy })));
    for (const at of candidates) {
      if (!(await onCanvas(page, at))) continue;
      await fingerTap(page, at);
      await page.waitForTimeout(250);
      if ((await halo(page)).noun?.kind === 'imagePlane') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    expect((await halo(page)).noun).toEqual({ kind: 'imagePlane', id });
    await expect(petal(page, 'Hide')).toBeVisible();
    // Hide (one step), then Delete from the Scene sheet's row after a tap selects it there
    const hide = await petal(page, 'Hide').boundingBox();
    if (hide === null) throw new Error('no Hide');
    await fingerTap(page, { x: hide.x + hide.width / 2, y: hide.y + hide.height / 2 });
    await expect.poll(async () => (await call(page, 'imagePlanes')).find((p) => p.id === id)?.visible).toBe(false);
    await runOk(page, 'imagePlane.set', { id, patch: { visible: true } });
    await runOk(page, 'select.imagePlane', { id });
    await expect.poll(async () => (await halo(page)).noun?.kind).toBe('imagePlane');
    await runOk(page, 'select.objects', { ids: [], mode: 'replace' });
    await expect.poll(async () => (await halo(page)).noun).toBeNull();
  });

  test('Create with AI is hidden while the build’s gateway is not enabled (404)', async ({ page }) => {
    // the e2e build is a server build: its gateway is `/api/gen`, off unless GEN_GATEWAY_ENABLED=1 (m7-gbc)
    await openHalo(page, '&stage=make');
    await expect(page.getByTestId('halo-tray')).toHaveAttribute('data-empty', '');
    await expect.poll(async () => (await makeSlice(page)).ai).toBe('hidden');
    await expect(page.getByTestId('halo-make-ai')).toHaveCount(0);
    await expect(page.getByTestId('halo-make-start-smooth')).toBeVisible();
  });

  test('a gateway that does not answer: Create with AI says it is not connected; a photo can be attached', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'chrome', 'touch projects');
    await page.route('**/api/gen/v1/providers', (route) => route.fulfill({ status: 503, body: 'Service Unavailable' }));
    await openHalo(page, '&stage=make');
    await expect(page.getByTestId('halo-tray')).toHaveAttribute('data-empty', '');
    await expect.poll(async () => (await makeSlice(page)).ai).toBe('offline');
    const ai = page.getByTestId('halo-make-ai');
    if (testInfo.project.name === 'chrome-touch') await fingerTap(page, await centre(page, 'halo-make-ai'));
    else await ai.tap();
    const sheet = page.getByTestId('halo-sheet-createAi');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('halo-ai-status')).toContainText('not connected');
    await expect(page.getByTestId('halo-ai-create')).toBeDisabled();
    await page.getByTestId('halo-ai-prompt').fill('A low-poly sword');
    await expect(page.getByTestId('halo-ai-create')).toBeDisabled();
    await sheet.locator('input[type="file"]').setInputFiles({
      name: 'ref.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0dc7d6e10000000049454e44ae426082',
        'hex',
      ),
    });
    await expect(page.getByTestId('halo-ai-photo-name')).toContainText('ref.png');
    await expect(page.getByTestId('halo-ai-budget-hero')).toBeVisible();
  });

  test('a gateway that answers (after its token): the sheet names its providers; Create waits for the plan', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome-touch', 'chrome-touch only (CDP)');
    // G-d: the real gateway against the mock providers (helpers/gen.ts); it asks for its token first
    const gateway = await routeGateway(page);
    try {
      await openHalo(page, '&stage=make');
      await expect.poll(async () => (await makeSlice(page)).ai).toBe('token');
      await fingerTap(page, await centre(page, 'halo-make-ai'));
      await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'token');
      await page.getByTestId('halo-ai-token').fill(GEN_TOKEN);
      await fingerTap(page, await centre(page, 'halo-ai-connect'));
      await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'ready');
      await expect(page.getByTestId('halo-ai-status')).toContainText('Tripo, Meshy');
      await page.getByTestId('halo-ai-prompt').fill('A low-poly sword');
      await expect(page.getByTestId('halo-ai-create')).toBeDisabled();
      await expect(page.getByTestId('halo-ai-blocked')).toContainText('Say which plan you have with');
    } finally {
      await gateway.close();
    }
  });
});
