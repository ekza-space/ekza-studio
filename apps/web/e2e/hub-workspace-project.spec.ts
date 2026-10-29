import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { sampleBytes } from './helpers/g4-export';
import { call, expectKernelStarted, runOk } from './helpers/test-api';
const hubUrl = process.env['EKZA_HUB_E2E_URL'];

// Real editor/Hub UI; explicit account/storage fixtures. Real Supabase validation is a separate backend gate.
test('save editable project to account, close both tabs, restore through Workspace', async ({ page, context }) => {
  test.skip(hubUrl === undefined, 'Opt in with paired local Hub');
  test.setTimeout(120000);
  const key = '100avatars-r1:e77c6b30-8cd4-45cc-ba6f-ae4bfb52511e';
  const source = sampleBytes('polybot.vrm');
  let project: any = null;
  let snapshot: Buffer | null = null;
  await context.route('https://ekza.mypinata.cloud/ipfs/QmWBtXeAwimYQLeZPvnMVH8M45MLMee8GyQpVkoKUDi93y', (r) =>
    r.fulfill({ body: Buffer.from(source), headers: { 'access-control-allow-origin': '*' } }),
  );
  await context.route('http://localhost:3100/editor?*', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('e2e')) return route.continue();
    url.searchParams.set('e2e', '1');
    return route.fulfill({ status: 302, headers: { location: url.href } });
  });
  await context.route('**/api/studio/authoring/projects**', async (route) => {
    const request = route.request(),
      method = request.method(),
      path = new URL(request.url()).pathname;
    if (method === 'POST') {
      const body = request.postDataJSON();
      project = {
        ...body,
        base: {
          libraryKey: key,
          name: 'Polybot',
          author: 'toxsam',
          license: 'CC0',
          bytes: source.length,
          sha256: createHash('sha256').update(source).digest('hex'),
          model: 'unused',
          source: 'Open Source Avatars',
        },
        headSha: null,
        headVersion: 0,
        updated: new Date().toISOString(),
      };
      return route.fulfill({ status: 201, json: project });
    }
    if (path.endsWith('/snapshot')) {
      if (method === 'PUT') {
        expect(request.headers()['if-match']).toBe(project.headSha || 'none');
        snapshot = request.postDataBuffer()!;
        expect(snapshot.subarray(0, 4).toString('hex')).toBe('504b0304');
        project.headSha = createHash('sha256').update(snapshot).digest('hex');
        project.headVersion++;
        return route.fulfill({ json: project });
      }
      return route.fulfill({ body: snapshot!, contentType: 'application/octet-stream' });
    }
    return route.fulfill({ json: path.endsWith('/projects') ? { items: project ? [project] : [] } : project });
  });
  await page.goto(`${hubUrl}/studio-edit?libraryAsset=${encodeURIComponent(key)}`);
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in Studio →' }).click();
  const editor = await opened;
  await expectKernelStarted(editor);
  await expect(editor.getByTestId('import-file-name')).toHaveText('Polybot.vrm');
  await editor.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(async () => (await call(editor, 'characters')).length).toBe(1);
  const character = (await call(editor, 'characters'))[0]!.id;
  await runOk(editor, 'library.useClip', { character, clip: 'idle' });
  const count = (await call(editor, 'clips', character)).length;
  const download = editor.waitForEvent('download');
  await runOk(editor, 'file.save');
  await download;
  await expect(editor.getByRole('button', { name: 'Save project to Hub', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Save project to Hub', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Project saved in Hub' })).toBeVisible();
  expect(snapshot).not.toBeNull();
  expect(project.headVersion).toBe(1);
  await editor.close();
  await page.close();
  const resumed = await context.newPage();
  await resumed.goto(`${hubUrl}/workspace`);
  await expect(resumed.getByRole('heading', { name: 'Polybot', exact: true })).toBeVisible();
  await resumed.getByRole('link', { name: 'Open in Studio →' }).click();
  await expect(resumed.getByRole('button', { name: 'Open in Studio →' })).toBeVisible();
  const secondOpened = resumed.waitForEvent('popup');
  await resumed.getByRole('button', { name: 'Open in Studio →' }).click();
  const second = await secondOpened;
  await expectKernelStarted(second);
  await expect
    .poll(async () => {
      try {
        return (await call(second, 'characters')).length;
      } catch {
        return 0;
      }
    })
    .toBe(1);
  const restored = (await call(second, 'characters'))[0]!.id;
  await expect.poll(async () => (await call(second, 'clips', restored)).length).toBe(count);
  const again = second.waitForEvent('download');
  await runOk(second, 'file.save');
  await again;
  await expect(second.getByRole('button', { name: 'Save project to Hub', exact: true })).toBeEnabled();
  await second.getByRole('button', { name: 'Save project to Hub', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Project saved in Hub' })).toBeVisible();
  await resumed.screenshot({ path: 'test-results/hub-workspace-restored.png', fullPage: true });
});
