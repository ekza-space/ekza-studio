// Headless fixtures of the Rig stage's tests (T9): an app on the production kernel (the mesh kernel attached, as T5b's
// journey tests build it), the web app's static files served to `fetch` (`/samples/`, `/library/`), and a Cube Lad
// rigged and bound through Auto-Rig's flow.
import { existsSync, readFileSync } from 'node:fs';
import { type CharacterId, seededIdSource } from '@ekza-studio/doc';
import {
  autoRigFlowHost,
  createEditorApp,
  createMemoryBlobStore,
  type EditorApp,
  intakeModel,
  intakeSampleArgs,
  type KernelMeshRuntimes,
  loadMeshKernel,
  openMarkers,
  runRig,
} from '@ekza-studio/editor-core';
import { createFakeServices } from '@ekza-studio/editor-core/testing';

export const ROOT = new URL('../../../', import.meta.url);

function servedFile(url: string): Uint8Array | null {
  const path = url.startsWith('/samples/')
    ? `fixtures/models/${url.slice('/samples/'.length)}`
    : url.startsWith('/library/')
      ? `apps/web/public/library/${url.slice('/library/'.length)}`
      : null;
  if (path === null) return null;
  const file = new URL(path, ROOT);
  return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
}

/** `fetch` over the web app's static files (stub it in `beforeEach`). */
export function staticFetch(url: string | URL): Promise<Response> {
  const bytes = servedFile(String(url));
  return Promise.resolve(
    bytes === null ? new Response(null, { status: 404 }) : new Response(bytes.slice().buffer, { status: 200 }),
  );
}

/** An app on the production kernel (the same ids on every run). */
export async function kernelApp(): Promise<EditorApp> {
  await loadMeshKernel();
  const app = createEditorApp({
    services: { ...createFakeServices(), blobs: createMemoryBlobStore() },
    idSource: seededIdSource(7),
    builtins: true,
  });
  app.prefs.setState({ firstRunDone: true });
  (app.meshes as KernelMeshRuntimes).attach(app);
  return app;
}

/** The Cube Lad rigged and bound through Auto-Rig's flow (needs `fetch` stubbed). */
export async function riggedCubeLad(): Promise<{ readonly app: EditorApp; readonly character: CharacterId }> {
  const app = await kernelApp();
  const host = autoRigFlowHost(app);
  await intakeModel(host, 'autorig.sample', intakeSampleArgs('cube-lad'));
  await openMarkers(host);
  const rigged = await runRig(host);
  if (rigged.status !== 'finished') throw new Error(`rig: ${rigged.status}`);
  return { app, character: rigged.character };
}
