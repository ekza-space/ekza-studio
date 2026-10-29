import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { exportOne, readGlb, sampleBytes } from './helpers/g4-export';
import { call, expectKernelStarted, loadFile, openEditor, runOk } from './helpers/test-api';

test('Hub model → five editable clips → saved project → exported VRM returned only on request', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const studioOrigin = new URL(baseURL!).origin;
  const session = '12345678-1234-4234-8234-123456789abc';
  const source = sampleBytes('polybot.vrm');
  const sha256 = createHash('sha256').update(source).digest('hex');
  await page.route('http://localhost:7103/__handoff-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<button id="open">Open Studio</button><script>
    window.messages=[]; window.peer=null; window.source=null;
    document.getElementById('open').onclick=()=>{window.peer=window.open('${studioOrigin}/editor?e2e=1&ws=animate&hub=http%3A%2F%2Flocalhost%3A7103&session=${session}');};
    addEventListener('message',event=>{if(event.source!==peer||event.origin!=='${studioOrigin}')return;
    messages.push(event.data.type);if(event.data.type==='ready'&&source){
      const bytes=Uint8Array.from(atob(source),c=>c.charCodeAt(0)).buffer;
      peer.postMessage({channel:'ekza-studio-embed/v1',session:'${session}',type:'open',name:'Polybot',sha256:'${sha256}',bytes},event.origin,[bytes]);
    }if(event.data.type==='exported'){window.received=event.data;peer.postMessage({channel:'ekza-studio-embed/v1',session:'${session}',type:'saved'},event.origin);}}
    );</script>`,
    }),
  );
  await page.goto('http://localhost:7103/__handoff-probe');
  await page.evaluate((base64) => {
    (window as unknown as { source: string }).source = base64;
  }, Buffer.from(source).toString('base64'));
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open').click();
  const editor = await popupPromise;
  await expectKernelStarted(editor);
  await expect(editor.getByTestId('import-file-name')).toHaveText('Polybot.vrm');
  await editor.getByRole('button', { name: 'Import', exact: true }).click();
  await expect.poll(async () => (await call(editor, 'characters')).length).toBe(1);
  const character = (await call(editor, 'characters'))[0]!.id;
  const originalClips = (await call(editor, 'clips', character)).map((clip) => clip.id);
  for (const clip of ['idle', 'walk', 'sword-attack', 'cast', 'death'])
    await runOk(editor, 'library.useClip', { character, clip });
  const clips = (await call(editor, 'clips', character))
    .map((clip) => clip.id)
    .filter((id) => !originalClips.includes(id));
  expect(clips.length).toBe(5);
  const projectDownload = editor.waitForEvent('download');
  await runOk(editor, 'file.save');
  const project = await projectDownload;
  expect(project.suggestedFilename()).toMatch(/\.ekzanim$/);
  const reopened = await context.newPage();
  await openEditor(reopened);
  const stream = await project.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await loadFile(reopened, project.suggestedFilename(), Buffer.concat(chunks), { auto: true });
  const restored = (await call(reopened, 'characters'))[0]!.id;
  expect((await call(reopened, 'clips', restored)).length).toBe(5 + originalClips.length);
  const output = await exportOne(editor, {
    kind: 'bake-into-model',
    character,
    clips,
    profile: 'ekza/omoba-humanoid-v1',
  });
  expect(
    readGlb(output.bytes)
      .json.animations?.map((clip) => clip.name)
      .sort(),
  ).toEqual(['attack', 'cast', 'death', 'idle', 'walk']);
  expect(await page.evaluate(() => (window as unknown as { received?: unknown }).received)).toBeUndefined();
  await editor.getByRole('button', { name: 'Send exported VRM to Hub' }).click();
  await expect(editor.getByRole('button', { name: 'Saved in Hub' })).toBeVisible();
  const returned = await page.evaluate(async () => {
    const data = (window as unknown as { received: { bytes: ArrayBuffer; sha256: string } }).received;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data.bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    return { declared: data.sha256, hash, bytes: data.bytes.byteLength };
  });
  expect(returned).toEqual({
    declared: output.artifact.sha256,
    hash: output.artifact.sha256,
    bytes: output.bytes.length,
  });
  mkdirSync('test-results/hub-pipeline', { recursive: true });
  writeFileSync('test-results/hub-pipeline/animated.vrm', output.bytes);
  writeFileSync('test-results/hub-pipeline/project.ekzanim', Buffer.concat(chunks));
  await reopened.close();
  await editor.close();
});
