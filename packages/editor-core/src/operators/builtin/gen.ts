// The generation operators (MODELING-PLAN §7.2 G-d; ADR 0017 §2, §10; DECISIONS M7-GD-*): `gen.submit` (a request
// to the configured gateway: spends money), `gen.cancel`, `gen.retry` (the same request under a new idempotency key)
// and `gen.import` (the finished model into the document, cleaned up by `mesh.intake`, provenance written; one undo
// step). The definitions and polls are eager and small; the bodies (`../../genFlow/ops`) load on the first run, and
// `prepare` hands the loaded module to the synchronous `apply` (the intake operators' pattern). The polls answer
// plainly (§3 P12). They are internal: the Generate panel (Pro) and *Create with AI* (Halo) run them; agents may
// submit or retry only with the person's confirmation (agent policy: spending needs an explicit grant).
import type { GenOp } from '@ekza-studio/gen-core';
import { isGenPreset } from '../../genFlow/presets';
import { GEN_REASONS, type GenJobEntry, isTerminalState, peekGenSession } from '../../genFlow/session';
import type { GenImportArgs, GenSubmitArgs } from '../../genFlow/types';
import { GLOBAL_SCOPE, type EditorApp, type PollResult } from '../../types';
import { type AnyOperator, defineOperator, fail, isFiniteNumber, isRecord, OK } from './define';
import { pollEditable } from './polls';

type Ops = typeof import('../../genFlow/ops');
const loadOps = (): Promise<Ops> => import('../../genFlow/ops');

/** What `prepare` hands to `apply`: the loaded body module and its prepared value. */
interface Prepared<P> {
  readonly ops: Ops;
  readonly prepared: P;
}

const OPS: readonly GenOp[] = ['text-to-model', 'image-to-model', 'multiview-to-model', 'retopology', 'rig'];
const TIERS: readonly unknown[] = ['paid', 'free', 'unknown'];

/** The gateway is configured and not known to be off. */
function pollGateway(app: EditorApp): PollResult {
  if ((app.services.generation ?? null) === null) return fail(GEN_REASONS.off);
  const availability = peekGenSession(app)?.getState().availability.status;
  return availability === 'unavailable' || availability === 'off' ? fail(GEN_REASONS.unavailable) : OK;
}

/** The session's entry of `args.job`, or a failed poll. */
function jobOf(app: EditorApp, args: unknown): GenJobEntry | { readonly ok: false; readonly reason: string } {
  if (!isRecord(args) || typeof args['job'] !== 'string') return { ok: false, reason: 'expects { job }' };
  const entry = peekGenSession(app)?.entry(args['job']);
  return entry === undefined ? { ok: false, reason: GEN_REASONS.unknownJob } : entry;
}

function pollSubmit(app: EditorApp, args: unknown): PollResult {
  const gateway = pollGateway(app);
  if (gateway !== true) return gateway;
  if (!isRecord(args)) return fail('expects { provider, op, maxCostUsd, tier, … }');
  if (typeof args['provider'] !== 'string' || args['provider'] === '') return fail('Choose a provider');
  const op = args['op'];
  if (!OPS.includes(op as GenOp)) return fail(`expects op ${OPS.join(' | ')}`);
  if (!isFiniteNumber(args['maxCostUsd']) || args['maxCostUsd'] <= 0) return fail('Set the most it may cost');
  if (!TIERS.includes(args['tier'])) return fail('Say which plan you have with this provider (paid or free)');
  if (args['preset'] !== undefined && !isGenPreset(args['preset'])) return fail('expects preset prop | character | hero');
  const prompt = typeof args['prompt'] === 'string' ? args['prompt'].trim() : '';
  const images = Array.isArray(args['images']) ? args['images'].length : 0;
  const image = args['image'] instanceof Uint8Array ? 1 : 0;
  if (op === 'text-to-model' && prompt === '') return fail('Describe what to make');
  if (op === 'image-to-model' && images + image === 0) return fail('Add a picture');
  if (op === 'rig' || op === 'retopology') {
    const source = args['source'];
    if (!isRecord(source) || typeof source['job'] !== 'string') return fail('expects { source: { job } }');
    const entry = peekGenSession(app)?.entry(source['job']);
    if (entry === undefined) return fail(GEN_REASONS.unknownJob);
    if (entry.job.state !== 'succeeded') return fail(GEN_REASONS.notFinished);
  }
  return OK;
}

function pollCancel(app: EditorApp, args: unknown): PollResult {
  const gateway = pollGateway(app);
  if (gateway !== true) return gateway;
  const entry = jobOf(app, args);
  if ('ok' in entry) return entry;
  if (isTerminalState(entry.job.state)) return fail(GEN_REASONS.finished);
  if (entry.job.state === 'fetching') return fail(GEN_REASONS.fetching);
  return OK;
}

function pollRetry(app: EditorApp, args: unknown): PollResult {
  const gateway = pollGateway(app);
  if (gateway !== true) return gateway;
  const entry = jobOf(app, args);
  if ('ok' in entry) return entry;
  if (!isTerminalState(entry.job.state) || entry.job.state === 'succeeded') return fail(GEN_REASONS.notRetryable);
  if (entry.request === null) return fail(GEN_REASONS.noRequest);
  return OK;
}

function pollImport(app: EditorApp, args: unknown): PollResult {
  if ((app.services.generation ?? null) === null) return fail(GEN_REASONS.off);
  const editable = pollEditable(app);
  if (editable !== true) return editable;
  const entry = jobOf(app, args);
  if ('ok' in entry) return entry;
  if (!isTerminalState(entry.job.state)) return fail(GEN_REASONS.notFinished);
  if (entry.job.state !== 'succeeded' || !entry.job.artifacts.some((a) => a.role === 'model' || a.role === 'rigged'))
    return fail(GEN_REASONS.notSucceeded);
  const preset = (args as Readonly<Record<string, unknown>>)['preset'];
  if (preset !== undefined && !isGenPreset(preset)) return fail('expects preset prop | character | hero');
  return OK;
}

type SubmitPrepared = Awaited<ReturnType<Ops['prepareSubmit']>>;
type RetryPrepared = Awaited<ReturnType<Ops['prepareRetry']>>;
type ImportPrepared = Awaited<ReturnType<Ops['prepareImport']>>;
type JobSnapshot = Awaited<ReturnType<Ops['prepareCancel']>>;

const submit = defineOperator<'gen.submit', Prepared<SubmitPrepared>>({
  id: 'gen.submit',
  label: 'Generate 3D Model',
  description: 'Sends a prompt or a picture to the configured generation service (a paid request) and tracks the job.',
  category: 'gen',
  scope: GLOBAL_SCOPE,
  flags: { internal: true },
  poll: ({ app }, args) => pollSubmit(app, args),
  async prepare(ctx, args) {
    const ops = await loadOps();
    return { ops, prepared: await ops.prepareSubmit(ctx, args as GenSubmitArgs) };
  },
  apply: ({ app }, args, { ops, prepared }) => ops.applySubmit(app, args as GenSubmitArgs, prepared),
});

const cancel = defineOperator<'gen.cancel', Prepared<JobSnapshot>>({
  id: 'gen.cancel',
  label: 'Stop Generation',
  description: 'Asks the generation service to stop a job the provider has not taken up yet.',
  category: 'gen',
  scope: GLOBAL_SCOPE,
  flags: { internal: true },
  poll: ({ app }, args) => pollCancel(app, args),
  async prepare(ctx, args) {
    const ops = await loadOps();
    return { ops, prepared: await ops.prepareCancel(ctx, args.job) };
  },
  apply: ({ app }, _args, { ops, prepared }) => ops.applyJobSnapshot(app, prepared),
});

const retry = defineOperator<'gen.retry', Prepared<RetryPrepared>>({
  id: 'gen.retry',
  label: 'Try Generation Again',
  description: 'Sends a failed, stopped or expired generation again as a new request (a paid request).',
  category: 'gen',
  scope: GLOBAL_SCOPE,
  flags: { internal: true },
  poll: ({ app }, args) => pollRetry(app, args),
  async prepare(ctx, args) {
    const ops = await loadOps();
    return { ops, prepared: await ops.prepareRetry(ctx, args.job) };
  },
  apply: ({ app }, _args, { ops, prepared }) => ops.applyRetry(app, prepared),
});

const importJob = defineOperator<'gen.import', Prepared<ImportPrepared>>({
  id: 'gen.import',
  label: 'Import Generated Model',
  description:
    'Brings a finished generation into the scene and cleans it up (stand up, triangle budget, flat colours), recording where it came from.',
  category: 'gen',
  scope: GLOBAL_SCOPE,
  flags: { internal: true, undo: true },
  undoLabel: () => 'Import Generated Model',
  poll: ({ app }, args) => pollImport(app, args),
  async prepare(ctx, args) {
    const ops = await loadOps();
    return { ops, prepared: await ops.prepareImport(ctx, args as GenImportArgs) };
  },
  apply: (ctx, _args, { ops, prepared }) => ops.applyImport(ctx, prepared),
});

/** M7 G-d: the generation operators (registered with the built-ins; their bodies are a lazy chunk). */
export const GEN_OPERATORS: readonly AnyOperator[] = [submit, cancel, retry, importJob];
