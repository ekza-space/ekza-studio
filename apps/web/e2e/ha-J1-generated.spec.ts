// ha-J1 from a generated model (STUDIO-TOUCH-SPEC §9 J1, §12.2; MODELING-PLAN §7.2 G-d; T9), `chrome-touch` against
// the real gateway and the mock providers (`helpers/gen.ts`): words → a Tripo character, *Bring it in* cleans it up in
// Make, Create with AI's *Rig it* hands the cleaned meshes to Halo's flow host and goes to Rig — and the Rig-it card
// picks that subject up: the tray's *Rig it for me* opens it on those meshes (Quick Rig with the guess), *For:
// OMOBA*, *Rig it*.
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { expect, type Page, test } from '@playwright/test';
import { GEN_TOKEN, routeGateway } from './helpers/gen';
import { halo, openHalo } from './helpers/halo';
import { centre, makeSlice } from './helpers/halo-make';
import { rig, tapId, touchLog } from './helpers/halo-rig';
import { call } from './helpers/test-api';
import { fingerTap } from './helpers/touch';

async function tap(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId).first()).toBeVisible();
  await page.getByTestId(testId).first().scrollIntoViewIfNeeded();
  await fingerTap(page, await centre(page, testId));
}

test('ha-J1 (generated): Create with AI → Bring it in → Rig it → the Rig-it card rigs that model', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chrome-touch', 'chrome-touch (CDP fingers)');
  test.setTimeout(300_000);
  const model = makeAiLikeGlb();
  const gateway = await routeGateway(page, { mock: { modelBytes: () => model, pollsToFinish: 4 }, timeScale: 0.2 });
  try {
    await openHalo(page, '&stage=make');
    await expect.poll(async () => (await makeSlice(page)).ai, { timeout: 30_000 }).toBe('token');
    await tap(page, 'halo-make-ai');
    await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'token', { timeout: 30_000 });
    await page.getByTestId('halo-ai-token').fill(GEN_TOKEN);
    await tap(page, 'halo-ai-connect');
    await expect(page.getByTestId('halo-ai-status')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await page.getByTestId('halo-ai-prompt').fill('A low-poly knight with a round shield');
    await tap(page, 'halo-ai-plan-paid');
    await expect(page.getByTestId('halo-ai-plan-paid')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('halo-ai-quote')).toHaveText(/ · P1-20260311 · /);
    await expect(page.getByTestId('halo-ai-create')).toBeEnabled();
    await tap(page, 'halo-ai-create');
    await expect(page.getByTestId('halo-ai-job')).toHaveAttribute('data-state', 'succeeded', { timeout: 120_000 });
    await tap(page, 'halo-ai-job-bring');
    await expect(page.getByTestId('halo-ai-result')).toHaveAttribute('data-state', 'done', { timeout: 180_000 });
    const generated = (await call(page, 'meshes')).filter((mesh) => mesh.owner === 'scene').map((mesh) => mesh.id);
    expect(generated.length).toBeGreaterThan(0);

    // from here, J1's rig steps (counted): Rig it (the sheet) → the Next chip → For: OMOBA → Rig it
    const log = touchLog();
    await tap(page, 'halo-ai-rig');
    log.count('create with AI: rig it');
    await expect.poll(async () => (await halo(page)).stage, { timeout: 30_000 }).toBe('rig');
    // the hand-over is the flow's subject (the cleaned meshes), with the report's start pose
    expect([...(await rig(page)).subject.meshes].sort()).toEqual([...generated].sort());
    // the sheet stays open on its result (G-d): the tray's *Rig it for me* opens the card and closes the sheet
    await tapId(page, 'halo-rig-it', info, log);
    await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');
    // the card rigs that subject: Quick Rig opened on the generated meshes (not a second guess at the document)
    expect([...(await rig(page)).subject.meshes].sort()).toEqual([...generated].sort());
    await tapId(page, 'halo-rig-destination-omoba', info, log);
    await tapId(page, 'halo-rig-go', info, log);
    await expect.poll(async () => (await rig(page)).card.phase, { timeout: 180_000 }).toMatch(/^(done|failed)$/);
    const card = (await rig(page)).card;
    expect(card, JSON.stringify(card)).toMatchObject({ phase: 'done' });
    expect((await call(page, 'history')).undo).toEqual(
      expect.arrayContaining(['Import Generated Model', 'Create Skeleton', 'Bind Skin']),
    );
    info.annotations.push({
      type: 'touches',
      description: `rig steps: ${log.steps.length} — ${log.steps.join(' · ')}`,
    });
    expect(log.steps.length).toBeLessThanOrEqual(4);
  } finally {
    await gateway.close();
  }
});
