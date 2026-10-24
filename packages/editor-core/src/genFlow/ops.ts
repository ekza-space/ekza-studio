// The `gen.*` operators' lazy halves (MODELING-PLAN §7.2 G-d; ADR 0017 §2, §4, §7, §10): everything that talks to the
// gateway (`EditorServices.generation`, the typed `GenerationClient` the host created) and the import. Loaded on the
// first run (`../operators/builtin/gen.ts` keeps the definitions and polls eager and small).
//
// - submit: builds the `ekza-gen/v1` request from a preset (the provider's face budget, its native low-poly model,
//   base-colour textures), uploads a re-encoded image when one is given, sends it with a fresh idempotency key, and
//   watches the job (the stream, polling as the fallback) into the session's job tray;
// - cancel: asks the gateway to stop a job (before the provider has it always; some providers while it waits);
// - retry: the same request again under a NEW idempotency key (a `timeout` that may have created a task is retried
//   only because the person asked: it is never resubmitted silently, M7-GB-4);
// - import: the finished job's model (verified against its SHA-256; untrusted bytes still) goes through the normal
//   import and clean-up in ONE undo step — `mesh.intake {bytes, name, preset, forward}` when it is registered (G-a),
//   else `mesh.importStatic`; a rigged model (the provider's VRM-named rig) through `file.importModel` — composed from
//   those operators' own `prepare` and `apply`, then the generator record on `AssetRecord.provenance` with the post
//   steps that ran (`aiMarksMayBeAltered`) and the prompt only on opt-in, and the `ekza.generations` link.
import { EkzaError } from '@ekza-studio/anim-core';
import type { AssetId, CharacterId, MeshId } from '@ekza-studio/doc';
import type {
  GenArtifact,
  GenerationClient,
  GenJob,
  GenProviderInfo,
  GenProvenance,
  GenRequest,
} from '@ekza-studio/gen-core';
import { loadModelOperators } from '../operators/builtin/modelOps';
import { runContextOf } from '../operators/builtin/define';
import { coerceRunArgs } from '../operators/runner';
import type { ApplyContext, EditorApp, OperatorContext, OperatorDef } from '../types';
import { GEN_PRESETS, type GenPresetId, isGenPreset, presetParams } from './presets';
import { generatedAssetProvenance, intakeStepOp, promptProvenance } from './provenance';
import { GEN_REASONS, type GenJobEntry, type GenSession, genSessionOf, isTerminalState } from './session';
import { ensureGenerationTable, generationRecords, liveGeneratedMeshes, putGeneration } from './table';
import type { GenImportArgs, GenImportResult, GenIntakeOutcome, GenJobResult, GenSubmitArgs } from './types';

type AnyDef = OperatorDef<unknown, unknown, unknown>;

/** The client of the app, or a refusal. */
export function clientOf(app: EditorApp): GenerationClient {
  const client = app.services.generation ?? null;
  if (client === null) throw new EkzaError('unavailable', GEN_REASONS.off);
  return client;
}

/** A fresh idempotency key: 32 hex characters (gen-core accepts 16–128 of [A-Za-z0-9_-]). */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return uuid.replace(/-/g, '');
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** The provider entry the session knows (listed by the gateway), or undefined. */
export function providerInfo(session: GenSession, id: string): GenProviderInfo | undefined {
  return session.getState().providers?.providers.find((provider) => provider.id === id);
}

/** A short plain title for the tray. */
function titleOf(args: GenSubmitArgs): string {
  if (args.title !== undefined && args.title.trim() !== '') return args.title.trim().slice(0, 60);
  if (args.op === 'rig') return 'Rig';
  if (args.op === 'retopology') return 'Clean topology';
  const prompt = args.prompt?.trim() ?? '';
  if (prompt !== '') return prompt.length > 48 ? `${prompt.slice(0, 47)}…` : prompt;
  return args.op === 'image-to-model' ? 'From a picture' : 'Generated model';
}

/** Watches a job into the session (one watch per job; it closes at a terminal state). */
export function trackJob(app: EditorApp, id: string): void {
  const session = genSessionOf(app);
  const client = app.services.generation ?? null;
  const entry = session.entry(id);
  if (client === null || entry === undefined || isTerminalState(entry.job.state)) return;
  session.setWatch(
    id,
    client.watch(
      id,
      (job) => {
        session.update(id, { job, watchError: null });
        if (isTerminalState(job.state)) session.setWatch(id, null);
      },
      (error) => session.update(id, { watchError: error.message }),
    ),
  );
}

// ---------- gen.submit ----------

export interface SubmitPrepared {
  readonly job: GenJob;
  readonly request: GenRequest;
}

/** The request of a submit (no network): the preset's parameters for the provider, the person's overrides. */
export function buildRequest(
  session: GenSession,
  args: GenSubmitArgs,
  images: readonly { readonly upload: string }[] | undefined,
): GenRequest {
  const preset: GenPresetId = isGenPreset(args.preset) ? args.preset : 'character';
  const info = providerInfo(session, args.provider) ?? null;
  const base =
    args.op === 'text-to-model' || args.op === 'image-to-model'
      ? presetParams(preset, info, args.params?.texture ?? 'color')
      : {};
  const prompt = args.prompt?.trim() ?? '';
  return {
    provider: args.provider,
    op: args.op,
    ...(prompt === '' ? {} : { prompt }),
    ...(images === undefined || images.length === 0
      ? {}
      : { images: images.map((image) => ({ upload: image.upload })) }),
    ...(args.source === undefined ? {} : { source: { job: args.source.job } }),
    params: { ...base, ...args.params },
    idempotencyKey: args.idempotencyKey ?? newIdempotencyKey(),
    maxCostUsd: args.maxCostUsd,
    attestation: {
      tier: args.tier,
      ...(args.realPersonPhoto === undefined ? {} : { realPersonPhoto: args.realPersonPhoto }),
    },
  };
}

export async function prepareSubmit(ctx: OperatorContext, args: GenSubmitArgs): Promise<SubmitPrepared> {
  const client = clientOf(ctx.app);
  const session = genSessionOf(ctx.app);
  let images = args.images;
  if (args.image instanceof Uint8Array) {
    const upload = await client.upload(args.image, 'image/png', ctx.signal ?? undefined);
    images = [...(images ?? []), { upload: upload.upload }];
  }
  const request = buildRequest(session, args, images);
  const job = await client.submit(request, ctx.signal ?? undefined);
  return { job, request };
}

export function applySubmit(app: EditorApp, args: GenSubmitArgs, prepared: SubmitPrepared): GenJobResult {
  const session = genSessionOf(app);
  const prompt = prepared.request.prompt ?? null;
  const preset: GenPresetId = isGenPreset(args.preset)
    ? args.preset
    : args.source !== undefined
      ? (session.entry(args.source.job)?.preset ?? 'character')
      : 'character';
  session.put({
    job: prepared.job,
    request: prepared.request,
    preset,
    keepPrompt: args.keepPrompt === true,
    prompt,
    title: titleOf(args),
    rigOf: args.op === 'rig' && args.source !== undefined ? args.source.job : null,
    imported: null,
    watchError: null,
  });
  trackJob(app, prepared.job.id);
  return { job: prepared.job };
}

// ---------- gen.cancel ----------

export async function prepareCancel(ctx: OperatorContext, id: string): Promise<GenJob> {
  return clientOf(ctx.app).cancel(id, ctx.signal ?? undefined);
}

export function applyJobSnapshot(app: EditorApp, job: GenJob): GenJobResult {
  genSessionOf(app).update(job.id, { job });
  return { job };
}

// ---------- gen.retry ----------

export async function prepareRetry(ctx: OperatorContext, id: string): Promise<SubmitPrepared & { from: GenJobEntry }> {
  const client = clientOf(ctx.app);
  const from = genSessionOf(ctx.app).entry(id);
  if (from === undefined) throw new EkzaError('unsupported', GEN_REASONS.unknownJob);
  if (from.request === null) throw new EkzaError('unsupported', GEN_REASONS.noRequest);
  const request: GenRequest = { ...from.request, idempotencyKey: newIdempotencyKey() };
  const job = await client.submit(request, ctx.signal ?? undefined);
  return { job, request, from };
}

export function applyRetry(app: EditorApp, prepared: SubmitPrepared & { from: GenJobEntry }): GenJobResult {
  const session = genSessionOf(app);
  session.put({ ...prepared.from, job: prepared.job, request: prepared.request, imported: null, watchError: null });
  trackJob(app, prepared.job.id);
  return { job: prepared.job };
}

// ---------- gen.import ----------

/** The model artifact of a finished job: the rigged one when there is one. */
export function modelArtifact(job: GenJob): GenArtifact | undefined {
  return job.artifacts.find((a) => a.role === 'rigged') ?? job.artifacts.find((a) => a.role === 'model');
}

/** The source facing of a provider's models for `mesh.intake`'s `forward` (Tripo exports +X, M7-GC-1). */
export function forwardOf(info: GenProviderInfo | undefined): '+x' | '+z' | '-z' {
  const forward = info?.capabilities.forward ?? '+z';
  return forward === '+x' || forward === '-z' ? forward : '+z';
}

/** True when `id` is registered and not a deferred stub (its poll does not answer "Arrives after the MVP"). */
export function liveOperator(app: EditorApp, id: string): AnyDef | null {
  const def = app.operators.get(id);
  if (def === undefined) return null;
  const probe = def.poll?.({ app, panel: null, paneId: null }, {}) ?? true;
  if (probe !== true && /arrives after the mvp|not available yet/i.test(probe.reason)) return null;
  return def;
}

interface Composed {
  readonly def: AnyDef;
  readonly args: unknown;
  readonly prepared: unknown;
  readonly kind: 'intake' | 'static' | 'character';
}

export interface ImportPrepared {
  readonly entry: GenJobEntry;
  readonly artifact: GenArtifact;
  readonly provenance: GenProvenance;
  readonly preset: GenPresetId;
  readonly inner: Composed;
}

/** Runs another operator's poll and prepare for composition (its apply runs inside `gen.import`'s transaction). */
async function compose(ctx: OperatorContext, def: AnyDef, raw: unknown, kind: Composed['kind']): Promise<Composed> {
  const args = coerceRunArgs(ctx.app, def, raw, runContextOf(ctx));
  const first = def.poll?.(ctx, args) ?? true;
  if (first !== true) throw new EkzaError('unsupported', first.reason);
  const prepared: unknown = def.prepare === undefined ? undefined : await Promise.resolve(def.prepare(ctx, args));
  const second = def.poll?.(ctx, args) ?? true;
  if (second !== true) throw new EkzaError('unsupported', second.reason);
  return { def, args, prepared, kind };
}

/** The bytes of a job's model: the session's copy, else downloaded (verified against its SHA-256) and kept. */
export async function jobBytes(app: EditorApp, entry: GenJobEntry, artifact: GenArtifact): Promise<Uint8Array> {
  const session = genSessionOf(app);
  const cached = session.bytes.get(entry.job.id);
  if (cached !== undefined) return cached;
  const bytes = await clientOf(app).artifact(artifact);
  session.bytes.set(entry.job.id, bytes);
  return bytes;
}

export async function prepareImport(ctx: OperatorContext, args: GenImportArgs): Promise<ImportPrepared> {
  const { app } = ctx;
  const session = genSessionOf(app);
  const entry = session.entry(args.job);
  if (entry === undefined) throw new EkzaError('unsupported', GEN_REASONS.unknownJob);
  const { job } = entry;
  const artifact = modelArtifact(job);
  if (job.state !== 'succeeded' || artifact === undefined || job.provenance === null) {
    throw new EkzaError('unsupported', GEN_REASONS.notSucceeded);
  }
  ensureGenerationTable();
  const keep = args.keepPrompt ?? entry.keepPrompt;
  const provenance = await promptProvenance(job.provenance, keep ? entry.prompt : null);
  const busy = 'Bringing in the generated model…';
  app.session.setState({ busy: { label: busy, progress: null } });
  try {
    const bytes = await jobBytes(app, entry, artifact);
    // The file is named after the tray's title, which also names an untitled project ("A wooden chair").
    const name = `${fileBase(entry.title) || `${job.provider}-model`}.glb`;
    const preset: GenPresetId = isGenPreset(args.preset) ? args.preset : entry.preset;
    let inner: Composed;
    if (artifact.role === 'rigged') {
      // The provider's rig (Q-GEN-8): a character through the normal model import.
      const def = app.operators.get('file.importModel');
      if (def === undefined) throw new EkzaError('unavailable', 'The model importer is not available');
      inner = await compose(ctx, def, { bytes, name }, 'character');
    } else {
      await loadModelOperators().catch(() => undefined);
      const intake = args.clean === false ? null : liveOperator(app, 'mesh.intake');
      if (intake !== null) {
        const info = providerInfo(session, job.provider);
        const raw = {
          bytes,
          name,
          preset,
          forward: forwardOf(info),
          ...(args.colours === undefined ? {} : { colours: args.colours }),
          ...(args.height === undefined ? {} : { height: args.height }),
          ...(args.texture === undefined ? {} : { texture: args.texture }),
          ...(args.quadrangulate === undefined ? {} : { quadrangulate: args.quadrangulate }),
        };
        inner = await compose(ctx, intake, raw, 'intake');
      } else {
        if (!app.rig.loaded) await app.rig.load();
        const def = app.operators.get('mesh.importStatic');
        if (def === undefined) throw new EkzaError('unavailable', 'The model importer is not available');
        inner = await compose(ctx, def, { bytes, name }, 'static');
      }
    }
    return { entry, artifact, provenance, preset, inner };
  } finally {
    if (app.session.getState().busy?.label === busy) app.session.setState({ busy: null });
  }
}

/** A file name's base from a title: letters, digits, spaces and dashes, at most 48 characters. */
function fileBase(title: string): string {
  return title
    .replace(/[^\p{L}\p{N} _-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
    .trim();
}

const isRecordValue = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function applyImport(ctx: ApplyContext, prepared: ImportPrepared): GenImportResult {
  const { tx } = ctx;
  if (tx === null) throw new EkzaError('internal', 'gen.import runs in a transaction');
  const { inner, artifact, preset } = prepared;
  const value = inner.def.apply(ctx, inner.args, inner.prepared);
  let meshes: readonly MeshId[] = [];
  let character: CharacterId | null = null;
  let outcome: GenIntakeOutcome | null = null;
  if (inner.kind === 'character') {
    character =
      isRecordValue(value) && typeof value['character'] === 'string' ? (value['character'] as CharacterId) : null;
  } else if (isRecordValue(value) && Array.isArray(value['meshes'])) {
    meshes = value['meshes'] as readonly MeshId[];
    if (inner.kind === 'intake') outcome = value as unknown as GenIntakeOutcome;
  }
  // The asset the import stored is the artifact (an asset's id is the SHA-256 of its bytes).
  const asset = artifact.sha256 as AssetId;
  const record = tx.get('assets', asset);
  if (record === undefined) throw new EkzaError('internal', 'The imported model asset is missing');
  const postSteps = outcome === null ? [] : outcome.steps.map((step) => intakeStepOp(step.kind));
  tx.patch('assets', asset, {
    provenance: generatedAssetProvenance(prepared.provenance, {
      postSteps,
      marksAltered: outcome?.aiMarksMayBeAltered === true,
    }),
  });
  putGeneration(tx, asset, meshes, character);
  tx.annotate({ label: 'Import Generated Model' });
  const humanoid = GEN_PRESETS[preset].humanoid;
  const rig: GenImportResult['rig'] = character !== null || !humanoid ? null : 'auto-rig';
  const warnings = [
    ...(outcome?.warnings ?? []),
    ...(inner.kind === 'static' ? ['Clean-up is not available in this build: the model came in as generated'] : []),
  ];
  return { asset, meshes, character, outcome, rig, warnings };
}

/** The live meshes and character the document holds from a job's model (undo-safe: read from the document). */
export function importedFrom(app: EditorApp, entry: GenJobEntry): { meshes: MeshId[]; character: CharacterId | null } {
  const artifact = modelArtifact(entry.job);
  if (artifact === undefined) return { meshes: [], character: null };
  const record = generationRecords(app.store).find((r) => r.asset === artifact.sha256);
  if (record === undefined) return { meshes: [], character: null };
  const character =
    record.character !== null && app.store.get('characters', record.character) !== undefined ? record.character : null;
  return { meshes: liveGeneratedMeshes(app.store, record), character };
}
