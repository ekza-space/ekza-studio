// M7 G-d (MODELING-PLAN §7.2; DECISIONS M7-GD-*): the `gen.*` operators and the Generate flow against an in-memory
// client (the gateway itself is tested in gen-gateway; the real gateway and mock providers run in headless-tests and
// the e2e). Polls answer plainly; the flow asks for the plan and shows the quote before Generate is on; a submit
// becomes a tray job that the client's watch moves along; the import runs `mesh.intake` (Tripo's +X facing, the
// preset's budget, ≤ 16 colours) in ONE undo step and writes `AssetRecord.provenance` (post steps that may alter AI
// marks, the prompt only on opt-in) and the `ekza.generations` link; a re-run undoes the last import first; cancel and
// retry; a static export of the generated meshes discloses the generator in `ekza_model_v1`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AssetId, MeshId } from '@ekza-studio/doc';
import { makeAiLikeGlb } from '@ekza-studio/io/testing';
import { describe, expect, it } from 'vitest';
import {
  createGenFlow,
  type EditorApp,
  type EditorServices,
  GEN_REASONS,
  type GenFlow,
  type GenImportResult,
  generationRecords,
  genSessionOf,
  promptSha256,
} from '../../src';
import { meshTestApp } from '../mesh/support';

type Client = NonNullable<EditorServices['generation']>;
type Job = Awaited<ReturnType<Client['job']>>;
type Providers = Awaited<ReturnType<Client['providers']>>;
type Request = Parameters<Client['submit']>[0];

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const TERMS = {
  outputLicense: 'LicenseRef-Provider',
  termsUrl: 'https://example.invalid/terms',
  checkedOn: '2026-10-24',
  ownership: 'user',
  freeTierOwnership: 'provider',
  trainsOnInputs: false,
  retentionDays: 30,
  attribution: null,
  territoryExcluded: [],
  restrictions: [],
} as const;

const caps = { dailyUsd: 5, monthlyUsd: 20, remainingDailyUsd: 5, remainingMonthlyUsd: 20 };

function providers(): Providers {
  const base = {
    adapterVersion: '1',
    configured: true,
    byoAllowed: false,
    terms: TERMS,
  };
  return {
    protocol: 'ekza-gen/v1',
    caps,
    providers: [
      {
        ...base,
        id: 'tripo',
        label: 'Tripo',
        models: { 'text-to-model': 'P1-20260311', 'image-to-model': 'P1-20260311', rig: 'v3.0-20260909' },
        capabilities: {
          ops: ['text-to-model', 'image-to-model', 'rig'],
          maxImages: 1,
          imageMimes: ['image/png', 'image/jpeg'],
          lowPoly: { native: true, tris: [50, 20_000], quads: [500, 10_000] },
          retopology: null,
          texture: ['none', 'color', 'pbr'],
          restPose: [],
          rig: { skeletons: ['vrm', 'native'], fromUpload: false },
          forward: '+x',
          typicalSeconds: {},
        },
      },
      {
        ...base,
        id: 'meshy',
        label: 'Meshy',
        models: { 'text-to-model': 'meshy-t2.5', 'image-to-model': 'meshy-t2.5' },
        terms: { ...TERMS, trainsOnInputs: true, restrictions: ['keep-ai-marks'] },
        capabilities: {
          ops: ['text-to-model', 'image-to-model'],
          maxImages: 1,
          imageMimes: ['image/png', 'image/jpeg', 'image/webp'],
          lowPoly: { native: true, tris: [100, 30_000], quads: null },
          retopology: null,
          texture: ['none', 'color'],
          restPose: [],
          rig: null,
          forward: '+z',
          typicalSeconds: {},
        },
      },
    ],
  };
}

/** An in-memory client: jobs advance when the test says so; watches get every snapshot. */
function fakeClient(model: Uint8Array, rigged: Uint8Array | null = null) {
  const jobs = new Map<string, Job>();
  const watchers = new Map<string, (job: Job) => void>();
  const requests: Request[] = [];
  let seq = 0;
  const modelSha = sha(model);
  const riggedSha = rigged === null ? '' : sha(rigged);
  const client: Client = {
    protocol: 'ekza-gen/v1',
    baseUrl: '/api/gen',
    providers: () => Promise.resolve(providers()),
    upload: (bytes, mime) =>
      Promise.resolve({
        upload: `up_${sha(bytes).slice(0, 8)}`,
        sha256: sha(bytes),
        mime,
        size: bytes.length,
        width: 64,
        height: 64,
      }),
    quote: (req) =>
      Promise.resolve({
        provider: req.provider,
        op: req.op,
        model: req.provider === 'tripo' ? 'P1-20260311' : 'meshy-t2.5',
        credits: req.op === 'rig' ? 25 : 50,
        usd: req.op === 'rig' ? 0.25 : 0.5,
        exact: true,
        items: [],
        caps,
      }),
    async submit(req) {
      requests.push(req);
      seq += 1;
      const job: Job = {
        id: `job_${seq}`,
        revision: 1,
        provider: req.provider,
        op: req.op,
        model: req.provider === 'tripo' ? 'P1-20260311' : 'meshy-t2.5',
        state: 'queued',
        submitted: false,
        progress: null,
        typicalSeconds: null,
        createdAt: '2026-10-25T00:00:00Z',
        updatedAt: '2026-10-25T00:00:00Z',
        quoteUsd: 0.5,
        costUsd: null,
        error: null,
        artifacts: [],
        provenance: null,
        idempotencyKey: req.idempotencyKey,
      };
      jobs.set(job.id, job);
      return job;
    },
    job: (id) => Promise.resolve(jobs.get(id) as Job),
    jobs: () => Promise.resolve([...jobs.values()]),
    async cancel(id) {
      const job = jobs.get(id) as Job;
      return set(id, { state: 'canceled', revision: job.revision + 1 });
    },
    watch(id, onJob) {
      watchers.set(id, onJob);
      return { close: () => watchers.delete(id) };
    },
    async artifact(a) {
      const hash = typeof a === 'string' ? a : a.sha256;
      if (rigged !== null && hash === riggedSha) return rigged;
      if (hash !== modelSha) throw new Error('unknown artifact');
      return model;
    },
  };
  const set = (id: string, patch: Partial<Job>): Job => {
    const job = { ...(jobs.get(id) as Job), ...patch };
    jobs.set(id, job);
    watchers.get(id)?.(job);
    return job;
  };
  /** Moves a job: running with progress, then succeeded with the model and its provenance. */
  const finish = async (id: string): Promise<Job> => {
    const job = jobs.get(id) as Job;
    const req = requests[Number(id.slice(4)) - 1] as Request;
    set(id, { state: 'running', submitted: true, progress: 40, revision: job.revision + 1 });
    const rig = req.op === 'rig' && rigged !== null;
    const bytes = rig ? rigged : model;
    const hash = rig ? riggedSha : modelSha;
    return set(id, {
      state: 'succeeded',
      progress: 100,
      revision: job.revision + 2,
      costUsd: 0.5,
      artifacts: [
        {
          role: rig ? 'rigged' : 'model',
          sha256: hash,
          size: bytes.length,
          mime: 'model/gltf-binary',
          fileName: rig ? 'model-rigged.vrm' : 'model.glb',
        },
      ],
      provenance: {
        kind: 'ai',
        digitalSourceType: 'trainedAlgorithmicMedia',
        service: req.provider,
        model: job.model,
        op: req.op,
        params: { face_limit: req.params.faceLimit ?? 0 },
        inputSha256: [],
        termsSnapshot: { ...TERMS, termsUrl: TERMS.termsUrl },
        rawSha256: hash,
        postSteps: [],
        promptSha256: req.prompt === undefined ? null : await promptSha256(req.prompt),
        prompt: null,
        tier: req.attestation.tier,
        taskId: 'task_1',
      },
    });
  };
  const fail = (id: string): Job =>
    set(id, {
      state: 'failed',
      revision: (jobs.get(id) as Job).revision + 1,
      error: { code: 'provider-failed', message: 'The provider could not make it', retryable: true },
    });
  return { client, requests, finish, fail, modelSha, riggedSha };
}

async function genApp(model: Uint8Array, rigged: Uint8Array | null = null) {
  const fake = fakeClient(model, rigged);
  const t = await meshTestApp();
  const app: EditorApp = t.app;
  (app.services as { generation?: Client | null }).generation = fake.client;
  const flow = createGenFlow({ app, run: (op, args) => app.runUntyped(op, args) });
  return { ...t, app, fake, flow };
}

const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

/** Words → a Character from Tripo, attested paid, quoted, submitted; returns the job id. */
async function submitText(flow: GenFlow, prompt = 'a low-poly knight'): Promise<string> {
  await flow.check();
  flow.setMode('text-to-model');
  flow.setPrompt(prompt);
  flow.attest('tripo', 'paid');
  await flow.refreshQuote();
  const job = await flow.submit();
  if (job === null) throw new Error(JSON.stringify(flow.getState().message));
  return job;
}

describe('the gen.* operators (M7 G-d)', () => {
  it('poll-fail with plain reasons: no gateway, unknown jobs, missing inputs', async () => {
    const t = await meshTestApp();
    for (const id of ['gen.submit', 'gen.cancel', 'gen.retry', 'gen.import']) {
      const result = await t.app.runUntyped(id, { job: 'job_1' });
      expect([id, result.status === 'cancelled' ? result.reason : result.status]).toEqual([id, GEN_REASONS.off]);
    }
    const { app } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }));
    const reason = async (id: string, args: unknown): Promise<string> => {
      const result = await app.runUntyped(id, args);
      return result.status === 'cancelled' ? result.reason : result.status;
    };
    expect(await reason('gen.import', { job: 'job_9' })).toBe(GEN_REASONS.unknownJob);
    expect(await reason('gen.cancel', { job: 'job_9' })).toBe(GEN_REASONS.unknownJob);
    const base = { provider: 'tripo', maxCostUsd: 1, tier: 'paid' };
    expect(await reason('gen.submit', { ...base, op: 'text-to-model' })).toBe('Describe what to make');
    expect(await reason('gen.submit', { ...base, op: 'image-to-model' })).toBe('Add a picture');
    expect(await reason('gen.submit', { ...base, op: 'text-to-model', prompt: 'x', tier: 'maybe' })).toMatch(/plan/);
    expect(await reason('gen.submit', { ...base, op: 'text-to-model', prompt: 'x', maxCostUsd: 0 })).toMatch(/cost/);
    expect(await reason('gen.submit', 7)).toMatch(/^expects/);
    expect(app.history.canUndo()).toBe(false);
  });
});

describe('the Generate flow (M7 G-d)', () => {
  it('presets choose the provider (Tripo for characters, Meshy for props); terms and plan before the quote', async () => {
    const { flow } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }));
    expect(flow.view().blocked).toMatch(/Connecting/);
    expect((await flow.check()).status).toBe('ready');
    flow.setMode('text-to-model');
    flow.setPrompt('a wooden chair');
    flow.setPreset('prop');
    expect(flow.view().provider?.info.id).toBe('meshy');
    expect(flow.view().provider?.terms.map((b) => b.text)).toEqual(
      expect.arrayContaining(['May train on your inputs', 'AI marks must stay']),
    );
    expect(flow.view().blocked).toBe('Say which plan you have with Meshy');
    flow.attest('meshy', 'free');
    expect(flow.view().provider?.terms[0]?.text).toBe('The provider owns the result');
    flow.setPreset('character');
    expect(flow.view().provider?.info.id).toBe('tripo');
    flow.setProvider('meshy');
    expect(flow.view().provider?.info.id).toBe('meshy');
    await flow.refreshQuote();
    expect(flow.view().quoteLine).toMatch(/^\$0\.50 \(50 credits\) · meshy-t2\.5 · \$5\.00 left today/);
    expect(flow.view().blocked).toBeNull();
    flow.setMaxCost(0.25);
    expect(flow.view().blocked).toBe('It costs more than your limit of $0.25');
    flow.dispose();
  });

  it('submit → tray → import: mesh.intake in one undo step, provenance on the asset, the link, the badge', async () => {
    const model = makeAiLikeGlb({ subdivisions: 4, textureSize: 128 });
    const { app, flow, fake } = await genApp(model);
    const id = await submitText(flow);
    const sent = fake.requests[0] as Request;
    expect(sent).toMatchObject({
      provider: 'tripo',
      op: 'text-to-model',
      prompt: 'a low-poly knight',
      params: { faceLimit: 3000, lowPoly: true, texture: 'color' },
      maxCostUsd: 2,
      attestation: { tier: 'paid' },
    });
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect(flow.view().jobs.map((job) => [job.id, job.state, job.canCancel])).toEqual([[id, 'queued', true]]);
    await fake.finish(id);
    await until(() => flow.view().jobs[0]?.canImport === true);
    expect(flow.view().jobs[0]?.stateText).toBe('Ready');
    expect(flow.rigOffers(id)).toEqual(['auto-rig', 'provider']);

    flow.openPost(id);
    const result = (await flow.runPost()) as GenImportResult;
    expect(result.outcome?.steps.map((step) => step.kind)).toEqual([
      'normalize',
      'reduce',
      'quadrangulate',
      'paletteBake',
    ]);
    expect(result.outcome?.triangles.after).toBeLessThanOrEqual(3000);
    expect(result.outcome?.colours).toBeLessThanOrEqual(16);
    expect(result.rig).toBe('auto-rig');
    expect(app.history.peekUndo()?.label).toBe('Import Generated Model');
    // Tripo's +X facing became +Z: the model is taller than wide and its depth axis is Z.
    const asset = app.store.get('assets', fake.modelSha as AssetId);
    expect(asset?.provenance).toMatchObject({
      origin: 'generated',
      redistributable: 'yes',
      generator: {
        kind: 'ai',
        service: 'tripo',
        model: 'P1-20260311',
        rawSha256: fake.modelSha,
        prompt: null,
        promptSha256: await promptSha256('a low-poly knight'),
        tier: 'paid',
        taskId: 'task_1',
        postSteps: [
          { op: 'mesh.normalize', aiMarksMayBeAltered: false },
          { op: 'mesh.reduce', aiMarksMayBeAltered: true },
          { op: 'mesh.quadrangulate', aiMarksMayBeAltered: false },
          { op: 'mesh.paletteBake', aiMarksMayBeAltered: true },
        ],
      },
    });
    expect(generationRecords(app.store)).toEqual([
      { id: `gen:${fake.modelSha}`, asset: fake.modelSha, meshes: result.meshes, character: null, deleted: null },
    ]);
    expect(flow.view().jobs[0]?.badge).toMatchObject({ service: 'tripo', tier: 'paid', aiMarksMayBeAltered: true });
    expect(flow.view().jobs[0]?.imported.meshes).toEqual(result.meshes);

    // Undo takes the whole import away (and the badge with it).
    app.history.undo();
    expect(app.store.get('meshes', result.meshes[0] as MeshId)).toBeUndefined();
    expect(flow.view().jobs[0]?.imported.meshes).toEqual([]);
    app.history.redo();

    // Again with 8 colours: the last import is undone first, so one import stays.
    flow.setPost({ colours: 8 });
    const again = (await flow.runPost()) as GenImportResult;
    expect(again.outcome?.colours).toBeLessThanOrEqual(8);
    expect(app.store.list('meshes').filter((mesh) => 'scene' in mesh.owner)).toHaveLength(again.meshes.length);
    flow.dispose();
  });

  it('keeps the prompt text only on opt-in, checked against the generation', async () => {
    const { app, flow, fake } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }));
    flow.setKeepPrompt(true);
    const id = await submitText(flow, 'a green dragon');
    await fake.finish(id);
    await until(() => flow.view().jobs[0]?.canImport === true);
    flow.openPost(id);
    await flow.runPost();
    expect(app.store.get('assets', fake.modelSha as AssetId)?.provenance?.generator?.prompt).toBe('a green dragon');
    flow.dispose();
  });

  it('cancel stops a waiting job; retry sends the same request under a new idempotency key', async () => {
    const { flow, fake, app } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }));
    const first = await submitText(flow);
    expect(await flow.cancel(first)).toBe(true);
    expect(flow.view().jobs[0]?.state).toBe('canceled');
    // Stopping a stopped job again changes nothing (the stream may report it before the answer does).
    expect((await app.runUntyped('gen.cancel', { job: first })).status).toBe('finished');
    expect(flow.view().jobs[0]?.state).toBe('canceled');
    const second = await flow.retry(first);
    expect(second).not.toBeNull();
    const [a, b] = fake.requests;
    expect(b?.prompt).toBe(a?.prompt);
    expect(b?.idempotencyKey).not.toBe(a?.idempotencyKey);
    fake.fail(second as string);
    await until(() => flow.view().jobs[0]?.state === 'failed');
    expect(flow.view().jobs[0]?.stateText).toBe('Failed: The provider could not make it');
    expect(flow.view().jobs[0]?.canRetry).toBe(true);
    expect(genSessionOf(app).getState().jobs).toHaveLength(2);
    flow.dismiss(first);
    expect(genSessionOf(app).getState().jobs).toHaveLength(1);
    flow.dispose();
  });

  it("the provider's VRM-named rig: a quoted rig job of the model, imported as a character with its provenance", async () => {
    const vrm = new Uint8Array(readFileSync(new URL('../../../../fixtures/models/polybot.vrm', import.meta.url)));
    const { app, flow, fake } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }), vrm);
    const id = await submitText(flow);
    await fake.finish(id);
    await until(() => flow.view().jobs[0]?.canImport === true);
    flow.openPost(id);
    await flow.quoteProviderRig(id);
    expect(flow.getState().post?.rigQuote?.quote?.usd).toBe(0.25);
    const rigJob = await flow.providerRig(id);
    expect(rigJob).not.toBeNull();
    expect(fake.requests[1]).toMatchObject({
      provider: 'tripo',
      op: 'rig',
      source: { job: id },
      params: { skeleton: 'vrm' },
      attestation: { tier: 'paid' },
    });
    expect(flow.rigOffers(rigJob as string)).toEqual([]);
    await fake.finish(rigJob as string);
    await until(() => flow.view().jobs[0]?.canImport === true);
    flow.openPost(rigJob as string);
    const result = (await flow.runPost()) as GenImportResult;
    expect(result.character).not.toBeNull();
    expect(result.outcome).toBeNull();
    expect(result.rig).toBeNull();
    expect(app.store.get('characters', result.character as never)).toBeDefined();
    expect(app.store.get('assets', fake.riggedSha as AssetId)?.provenance?.generator).toMatchObject({
      service: 'tripo',
      op: 'rig',
      rawSha256: fake.riggedSha,
    });
    expect(generationRecords(app.store).find((r) => r.asset === fake.riggedSha)?.character).toBe(result.character);
    expect(flow.view().jobs[0]?.imported.character).toBe(result.character);
    flow.dispose();
  });

  it('a static export of the generated meshes discloses the generator in ekza_model_v1 (no undisclosed lint)', async () => {
    const { app, flow, fake } = await genApp(makeAiLikeGlb({ subdivisions: 2, textureSize: 64 }));
    const id = await submitText(flow);
    await fake.finish(id);
    await until(() => flow.view().jobs[0]?.canImport === true);
    flow.openPost(id);
    const result = (await flow.runPost()) as GenImportResult;
    const exported = await app.runUntyped('file.exportModel', {
      objects: result.meshes,
      fileName: 'knight.glb',
      profile: 'local/generic',
      validate: false,
    });
    expect(exported.status).toBe('finished');
    const artifact = (exported as { value: readonly { bytes: Uint8Array; lints: readonly { code: string }[] }[] })
      .value[0];
    const length = new DataView(
      artifact?.bytes.buffer as ArrayBuffer,
      (artifact?.bytes.byteOffset ?? 0) + 12,
      4,
    ).getUint32(0, true);
    const json = JSON.parse(new TextDecoder().decode(artifact?.bytes.subarray(20, 20 + length))) as {
      asset: { extras: { ekza_model_v1: { provenance: { generator: Record<string, unknown> } } } };
    };
    const generator = json.asset.extras.ekza_model_v1.provenance.generator;
    expect(generator).toMatchObject({ kind: 'ai', service: 'tripo', model: 'P1-20260311', tier: 'paid' });
    expect(generator).not.toHaveProperty('taskId');
    expect(generator).not.toHaveProperty('prompt');
    expect(artifact?.lints.map((lint) => lint.code)).not.toContain('ekza.provenance-ai-undisclosed');
    flow.dispose();
  });
});
