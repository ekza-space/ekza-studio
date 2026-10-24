// M7 G-d acceptance, headless (MODELING-PLAN §7.3; DECISIONS M7-GD-*): from one reference image to a rigged,
// ≤ 3,000-triangle, ≤ 16-colour humanoid that animates idle and walk and exports a VRM 1.0 for `ekza/space-avatar-v1`
// with `ekza_model_v1.provenance.generator` — through the REAL gateway (`@ekza-studio/gen-gateway`, in this process,
// a bearer token, spend caps) and the mock provider server (`@ekza-studio/gen-gateway/testing`: Tripo-like, serving
// the procedural AI-like model, 96,824 triangles facing +X). Never a real provider. The editor side is the production
// kernel: the Generate flow (`createGenFlow`), `gen.submit` → the gateway's job → `gen.import` (`mesh.intake` with
// Tripo's +X facing, one undo step, provenance on the asset), then Auto-Rig's flow functions (the Rig it hand-over),
// the starter pack's idle and walk, and the Ekza VRM download, checked with vrm-validator. Also: gen-core's own
// provenance helpers agree with editor-core's mirrors (editor-core may hold gen-core types only, M7-GB-14).
import { parseGlb } from '@ekza-studio/io';
import { existsSync, readFileSync } from 'node:fs';
import type { CharacterId } from '@ekza-studio/doc';
import {
  addLibraryClip,
  applyFix,
  attachMeshes,
  autoRigFlowHost,
  createGenFlow,
  downloadExport,
  GEN_MARK_ALTERING_STEPS,
  type GenImportResult,
  loadMeshKernel,
  nextFix,
  openMarkers,
  prepareExport,
  promptSha256 as editorPromptSha256,
  runRig,
  takeHandedSubject,
  withPostSteps,
} from '@ekza-studio/editor-core';
import {
  createGenerationClient,
  type GenProvenance,
  MARK_ALTERING_STEPS,
  promptSha256,
  withPostStep,
} from '@ekza-studio/gen-core';
import {
  createGateway,
  createRedactingLogger,
  defaultAdapters,
  loadGatewayConfig,
  providerEnvs,
} from '@ekza-studio/gen-gateway';
import { makePng, startMockProviders } from '@ekza-studio/gen-gateway/testing';
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { settled, vrmErrors } from './m6b.writer.support';
import { realApp, runOk } from './ops.support';

const ROOT = new URL('../../../', import.meta.url);
const TOKEN = 'm7-gd-headless-token-0123456789abcdef';

/** The web app's starter pack (`/library/`); every other request goes to the real fetch (the gateway's providers). */
const realFetch = globalThis.fetch;
function libraryFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('/library/')) {
    const file = new URL(`apps/web/public/library/${url.slice('/library/'.length)}`, ROOT);
    if (!existsSync(file)) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response(new Uint8Array(readFileSync(file)).buffer, { status: 200 }));
  }
  return realFetch(input, init);
}

beforeAll(async () => {
  await loadMeshKernel();
});
beforeEach(() => {
  vi.stubGlobal('fetch', libraryFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function until(check: () => boolean, ms = 60_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The real gateway in this process against the mock providers; its client as the host would create it. */
async function gatewayFor(model: Uint8Array) {
  const mock = await startMockProviders({ modelBytes: () => model });
  const env = {
    GEN_GATEWAY_ENABLED: '1',
    GEN_GATEWAY_TOKEN: TOKEN,
    GEN_CAP_DAILY_USD: '5',
    GEN_CAP_MONTHLY_USD: '20',
    TRIPO_API_KEY: mock.keys.tripo,
    MESHY_API_KEY: mock.keys.meshy,
    GEN_TRIPO_BASE_URL: mock.tripoBase,
    GEN_MESHY_BASE_URL: mock.meshyBase,
  };
  const adapters = defaultAdapters();
  const config = loadGatewayConfig(env, 'next', providerEnvs(adapters));
  const lines: string[] = [];
  const gw = createGateway({
    config,
    adapters,
    log: createRedactingLogger((line) => lines.push(line), [], 'debug'),
    timeScale: 0.01,
    requestTimeoutScale: 0.2,
    basePath: '/api/gen',
    heartbeatMs: 50,
  });
  await gw.start();
  let token: string | null = null;
  const client = createGenerationClient({
    baseUrl: '/api/gen',
    token: () => token,
    pollMs: 20,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return gw.handle(new Request(new URL(url, 'http://localhost'), init), { remoteAddress: '127.0.0.1' });
    },
  });
  return {
    mock,
    client,
    lines,
    setToken: (value: string | null) => {
      token = value;
    },
    async close() {
      await gw.close();
      await mock.close();
    },
  };
}

describe('M7 G-d: one picture → a rigged, low-poly, palette humanoid in a VRM 1.0 (headless, mock providers)', () => {
  it('gen-core and editor-core agree on the provenance helpers', async () => {
    expect([...GEN_MARK_ALTERING_STEPS]).toEqual([...MARK_ALTERING_STEPS]);
    expect(await editorPromptSha256('a knight in blue')).toBe(await promptSha256('a knight in blue'));
    const p: GenProvenance = {
      kind: 'ai',
      digitalSourceType: 'trainedAlgorithmicMedia',
      service: 'tripo',
      model: 'P1-20260311',
      op: 'image-to-model',
      params: {},
      inputSha256: [],
      termsSnapshot: {},
      rawSha256: 'a'.repeat(64),
      postSteps: [],
      promptSha256: null,
      prompt: null,
      tier: 'paid',
      taskId: null,
    };
    const ops = ['mesh.normalize', 'mesh.reduce', 'mesh.paletteBake'];
    let viaCore = p;
    for (const op of ops) viaCore = withPostStep(viaCore, op, MARK_ALTERING_STEPS.includes(op));
    expect(withPostSteps(p, ops)).toEqual(viaCore);
  });

  it('E2E-GEN acceptance (§7.3): picture → Tripo P1 → clean-up → Auto-Rig → idle, walk → Ekza VRM', {
    timeout: 600_000,
  }, async () => {
    const model = makeAiLikeGlb();
    const g = await gatewayFor(model);
    try {
      const { app, services } = realApp();
      attachMeshes(app);
      (app.services as { generation?: unknown }).generation = g.client;
      const flow = createGenFlow({
        app,
        run: (op, args) => app.runUntyped(op, args),
        setToken: g.setToken,
        reencode: (_file, name) => Promise.resolve({ name, png: makePng(256, 256), width: 256, height: 256 }),
      });

      // The gateway wants its token first (a 401 → the token prompt).
      expect((await flow.check()).status).toBe('needs-token');
      expect((await flow.setToken(TOKEN)).status).toBe('ready');
      expect(
        flow
          .view()
          .providers.map((p) => p.info.id)
          .sort(),
      ).toEqual(['meshy', 'tripo']);

      // One reference picture, a Character from Tripo, attested paid, quoted before anything is spent.
      await flow.setImage(new Blob([makePng(256, 256)]), 'knight.png');
      expect(flow.getState().image.status).toBe('ready');
      expect(flow.view().blocked).toBe('Does the picture show a real person?');
      flow.setRealPerson(false);
      expect(flow.view().provider?.info.id).toBe('tripo');
      expect(flow.view().blocked).toBe('Say which plan you have with Tripo');
      flow.attest('tripo', 'paid');
      await flow.refreshQuote();
      expect(flow.view().quoteLine).toMatch(/^\$0\.50 \(50 credits\) · P1-20260311 · /);
      expect(flow.view().blocked).toBeNull();
      const id = await flow.submit();
      expect(id).not.toBeNull();

      // The tray follows the job to the end (the stream, polling as the fallback).
      const states = new Set<string>();
      const off = flow.subscribe(() => {
        const job = flow.view().jobs[0];
        if (job !== undefined) states.add(job.state);
      });
      await until(() => flow.view().jobs[0]?.canImport === true);
      off();
      expect(states.has('succeeded')).toBe(true);
      // The provider saw the pinned low-poly model, the preset's face budget and a file token, never a URL.
      const create = g.mock.requests.find((r) => r.path.endsWith('/generation/image-to-model'));
      expect(create?.json).toMatchObject({ model: 'P1-20260311', face_limit: 3000 });

      // Bring it in: mesh.intake (Tripo's +X facing → +Z, 1.70 m, ≤ 3k triangles, ≤ 16 colours) in one undo step.
      flow.openPost(id as string);
      const result = (await flow.runPost()) as GenImportResult;
      expect(result.outcome?.triangles.before).toBe(96_824);
      expect(result.outcome?.triangles.after).toBeLessThanOrEqual(3000);
      expect(result.outcome?.colours).toBeLessThanOrEqual(16);
      expect(result.rig).toBe('auto-rig');
      expect(app.history.peekUndo()?.label).toBe('Import Generated Model');
      const asset = app.store.list('assets').find((record) => record.provenance?.origin === 'generated');
      expect(asset?.provenance?.generator).toMatchObject({
        kind: 'ai',
        service: 'tripo',
        model: 'P1-20260311',
        op: 'image-to-model',
        tier: 'paid',
        prompt: null,
      });
      expect(asset?.provenance?.generator?.inputSha256).toHaveLength(1);
      expect(
        asset?.provenance?.generator?.postSteps.some((s) => s.op === 'mesh.paletteBake' && s.aiMarksMayBeAltered),
      ).toBe(true);

      // Rig it: Auto-Rig's flow with the generated meshes handed over (the Pro panel's Rig it, Halo's Rig stage).
      const host = autoRigFlowHost(app);
      await takeHandedSubject(host, { character: null, meshes: result.meshes });
      const fixes: string[] = [];
      for (let fix = nextFix(host); fix !== null && fixes.length < 5; fix = nextFix(host)) {
        fixes.push(fix);
        expect((await applyFix(host, fix)).status).not.toBe('failed');
      }
      const markers = await openMarkers(host);
      expect(markers.status).not.toBe('failed');
      let rigged = await runRig(host);
      if (rigged.status === 'confirm-required') rigged = await runRig(host, { confirm: true });
      expect(rigged.status).toBe('finished');
      const character = (rigged as { character: CharacterId }).character;
      await settled(app);

      // Idle and walk from the starter pack.
      for (const clip of ['idle', 'walk']) {
        const added = await addLibraryClip(host, character, clip);
        expect([clip, added.status]).toEqual([clip, 'finished']);
      }
      expect(app.store.query.clipsOfCharacter(character).length).toBeGreaterThanOrEqual(2);

      // The Ekza avatar (VRM 1.0, ekza/space-avatar-v1): no error lint, vrm-validator clean, the generator disclosed.
      const record = app.store.get('characters', character);
      if (record === undefined) throw new Error('no character');
      await prepareExport(host, record, 'Tester');
      await runOk(app, 'char.setVrmMeta', { character, patch: { licensePreset: 'cc0' } });
      await settled(app);
      const exported = await downloadExport(host, character, 'ekza-vrm');
      expect(exported?.saved).toBe(true);
      const errors = exported?.result.lints.filter((lint) => lint.severity === 'error') ?? [];
      expect(errors).toEqual([]);
      const bytes = exported?.result.artifacts[0]?.bytes as Uint8Array;
      expect(await vrmErrors(bytes)).toEqual([]);
      const json = (await parseGlb(bytes)).json as unknown as {
        asset: { extras: { ekza_model_v1: { provenance: { generator: Record<string, unknown> } } } };
        extensionsUsed?: string[];
        meshes: { primitives: unknown[] }[];
      };
      expect(json.extensionsUsed).toContain('VRMC_vrm');
      const generator = json.asset.extras.ekza_model_v1.provenance.generator;
      expect(generator).toMatchObject({ kind: 'ai', service: 'tripo', model: 'P1-20260311', tier: 'paid' });
      expect(generator).not.toHaveProperty('taskId');
      expect(JSON.stringify(json.asset.extras)).not.toMatch(/"uri"/);
      expect(services.downloads.map((d) => d.fileName)[0]).toMatch(/\.vrm$/);
      // The gateway's logs never held the token or the provider keys.
      for (const secret of [TOKEN, g.mock.keys.tripo, g.mock.keys.meshy])
        expect(g.lines.join('\n')).not.toContain(secret);
      flow.dispose();
    } finally {
      await g.close();
    }
  });
});
