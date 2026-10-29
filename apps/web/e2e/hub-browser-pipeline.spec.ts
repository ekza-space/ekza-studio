import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { exportOne, sampleBytes } from './helpers/g4-export';
import { call, expectKernelStarted, runOk } from './helpers/test-api';

const hubUrl = process.env['EKZA_HUB_E2E_URL'];

// Frontend integration with explicit API fixtures. The companion Registry test exercises real local Supabase.
test('Hub navigation, Studio return, sign-in, private draft and explicit OMOBA submission', async ({
  page,
  context,
}) => {
  test.skip(hubUrl === undefined, 'Opt in with EKZA_HUB_E2E_URL=http://localhost:7203 and run Hub separately');
  test.setTimeout(180_000);
  const key = '100avatars-r1:e77c6b30-8cd4-45cc-ba6f-ae4bfb52511e';
  const cid = 'QmWBtXeAwimYQLeZPvnMVH8M45MLMee8GyQpVkoKUDi93y';
  let signedIn = false;
  let asset: any = null;
  let rendition: any = null;
  const writes: string[] = [];
  const uuid = '11111111-1111-4111-8111-111111111111';
  const revision = '22222222-2222-4222-8222-222222222222';
  // This scenario checks navigation and handoff, not live gateway availability or thumbnail rendering.
  await context.route('https://ekza.mypinata.cloud/ipfs/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  await context.route(`https://ekza.mypinata.cloud/ipfs/${cid}`, (route) =>
    route.fulfill({ body: Buffer.from(sampleBytes('polybot.vrm')), headers: { 'access-control-allow-origin': '*' } }),
  );
  await context.route('http://localhost:3100/editor?*', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('e2e')) return route.continue();
    url.searchParams.set('e2e', '1');
    return route.fulfill({ status: 302, headers: { location: url.href } });
  });
  await context.route('**/api/studio/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/studio/', '');
    const method = request.method();
    if (method !== 'GET') writes.push(`${method} ${path}`);
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === 'status') return reply({ enabled: true });
    if (path === 'session')
      return signedIn
        ? reply({ user: { id: uuid, username: 'Pipeline creator', email: 'pipeline@example.test', role: 'creator' } })
        : reply({ error: { message: 'Sign in' } }, 401);
    if (path === 'sessions') {
      signedIn = true;
      return reply({});
    }
    if (path === 'projects')
      return reply({
        items: [
          {
            projectId: 'omoba',
            name: 'OMOBA',
            owner: false,
            accepts: [{ assetKind: 'avatar', platform: 'desktop', profile: 'humanoid-glb-v1' }],
          },
        ],
      });
    if (path === 'profiles') return reply({ items: [] });
    if (path === 'assets/catalog' || path === 'assets/library') return reply({ items: [] });
    if (path === 'assets' && method === 'GET') return reply({ items: asset ? [asset] : [] });
    if (path === 'assets' && method === 'POST') {
      asset = {
        ...request.postDataJSON(),
        avatarId: uuid,
        creator: { id: uuid, username: 'Pipeline creator' },
        currentRevisionId: null,
        revision: {
          revisionId: revision,
          status: 'draft',
          sourceSha256: null,
          sourceSizeBytes: null,
          sourceUrl: null,
          thumbnailUrl: null,
          iosUrl: null,
          iosSha256: null,
          iosSizeBytes: null,
          error: null,
          reviewNote: null,
          updatedAt: new Date().toISOString(),
        },
      };
      return reply(asset, 201);
    }
    if (path === `revisions/${revision}/source`) {
      const bytes = request.postDataBuffer()!;
      asset.revision.sourceSha256 = createHash('sha256').update(bytes).digest('hex');
      asset.revision.sourceSizeBytes = bytes.length;
      return reply(asset);
    }
    if (path === `revisions/${revision}/submit`) {
      asset.revision.status = 'review';
      return reply(asset);
    }
    if (path === `revisions/${revision}/renditions`) {
      if (method === 'POST') {
        rendition = {
          renditionId: uuid,
          revisionId: revision,
          platform: 'desktop',
          profile: 'humanoid-glb-v1',
          status: 'ready',
          format: 'glb',
          origin: 'built',
          sha256: 'a'.repeat(64),
          sizeBytes: 123,
          error: null,
          submissions: [],
        };
        return reply(rendition, 202);
      }
      return reply({ items: rendition ? [rendition] : [] });
    }
    if (path === `renditions/${uuid}/submissions`) {
      expect(request.postDataJSON()).toEqual({ projectId: 'omoba' });
      rendition.submissions = [{ submissionId: revision, renditionId: uuid, projectId: 'omoba', status: 'pending' }];
      return reply(rendition.submissions[0]);
    }
    return reply({ items: [] });
  });
  await page.goto(`${hubUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Avatar Library', exact: true }).click();
  await expect(page).toHaveURL(/\/library\//);
  await page.goto(`${hubUrl}/library/#${encodeURIComponent(key)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#open-studio').click();
  await expect(page.getByRole('heading', { name: 'Animate Polybot' })).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Studio →' }).click();
  const editor = await popupPromise;
  await expectKernelStarted(editor);
  await expect(editor.getByTestId('import-file-name')).toHaveText('Polybot.vrm');
  await editor.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(async () => (await call(editor, 'characters')).length).toBe(1);
  const character = (await call(editor, 'characters'))[0]!.id;
  const before = (await call(editor, 'clips', character)).map((c) => c.id);
  for (const clip of ['idle', 'walk', 'sword-attack', 'cast', 'death'])
    await runOk(editor, 'library.useClip', { character, clip });
  const clips = (await call(editor, 'clips', character)).filter((c) => !before.includes(c.id)).map((c) => c.id);
  const exported = await exportOne(editor, {
    kind: 'bake-into-model',
    character,
    clips,
    profile: 'ekza/omoba-humanoid-v1',
  });
  await editor.getByRole('button', { name: 'Send exported VRM to Hub' }).click();
  await expect(page).toHaveURL(/view=new.*draft=/);
  await expect(page.getByText('Sign in to continue', { exact: true })).toBeVisible();
  await page.reload(); // the exported bytes survive the auth boundary and a real page reload
  await page.getByLabel('Email', { exact: true }).fill('pipeline@example.test');
  await page.getByLabel('Password', { exact: true }).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Avatar name', { exact: true })).toHaveValue('Polybot — animated');
  await expect(page.getByLabel('Attribution', { exact: false })).toHaveValue(/Polygonal-Mind/);
  await page.getByRole('button', { name: 'Save private draft' }).click();
  await expect(page).toHaveURL(/view=uploads/);
  expect(asset.revision.sourceSha256).toBe(exported.artifact.sha256);
  expect(writes).toEqual(['POST sessions', 'POST assets', `PUT revisions/${revision}/source`]);
  await page.getByRole('button', { name: 'Submit this version' }).click();
  await expect(page.getByText('In review', { exact: true })).toBeVisible();
  // A curator approval is separate; this fixture represents its eventual API result, never auto-approves it.
  asset.revision.status = 'published';
  asset.currentRevisionId = revision;
  await page.reload();
  await page.getByRole('button', { name: 'Prepare for OMOBA' }).click();
  await page.getByRole('button', { name: 'Submit to OMOBA', exact: true }).click();
  await expect(page.getByText('Waiting for the game', { exact: true })).toBeVisible();
  expect(writes.at(-1)).toBe(`POST renditions/${uuid}/submissions`);
  await page.screenshot({ path: 'test-results/hub-pipeline/submission.png', fullPage: true });
  await editor.close();
});
