// The Generate flow (MODELING-PLAN §7.2 G-d, §7.3; ADR 0017; DECISIONS M7-GD-*): the UI-free model both shells bind —
// Studio Pro's Generate panel and Halo's *Create with AI* sheet — so they ask the same questions and run the same
// operators for the same request: inputs (a prompt, or a picture re-encoded here), a size preset (Prop ≤ 500,
// Character ≤ 3k, Hero ≤ 10k triangles) and its provider (Tripo for characters, Meshy for props; the person may pick),
// the provider's terms, the attested plan per provider (Q-GEN-9), the quote line before anything is spent, submit,
// the job tray with progress (the session's jobs), cancel and retry, then the import with the clean-up (`gen.import`
// → `mesh.intake`, live budgets and its warnings), the provenance badge, and what comes next: Auto-Rig, or the
// provider's VRM-named rig (Q-GEN-8). Every spend and every document change is an operator run through the shell's
// funnel; the flow never shows anything itself and keeps its U state (never the document's, never an undo step).
import type { CharacterId, MeshId } from '@ekza-studio/doc';
import type { GenerationClient, GenProviderInfo, GenQuote, GenRequest, TextureMode } from '@ekza-studio/gen-core';
import type { EditorApp, OperatorResult } from '../types';
import { type ReencodedImage, reencodeImage } from './image';
import { buildRequest, importedFrom, modelArtifact, newIdempotencyKey, providerInfo, trackJob } from './ops';
import { GEN_PRESETS, type GenFlowOp, type GenPresetId, providerFor } from './presets';
import {
  type GenAvailability,
  type GenJobEntry,
  type GenSession,
  type GenSessionState,
  genSessionOf,
  isTerminalState,
} from './session';
import { assetGenerator, badgeOf, type GenBadge } from './table';
import { GEN_TEXT, jobStateText, quoteLine, type TermsBadge, termsBadges } from './text';
import type { GenImportResult } from './types';

/** The lazy boundary's marker (`check:size`): only this chunk holds it. */
export const GEN_FLOW_MARKER = 'ekza-generate-flow';

/** The undo label of `gen.import` (a re-run undoes the last import when it is the top step). */
export const IMPORT_LABEL = 'Import Generated Model';

export type GenFlowRun = (op: string, args?: unknown) => Promise<OperatorResult<unknown>>;

export interface GenFlowHost {
  readonly app: EditorApp;
  /** An operator the person asked for (the shell shows its failure). */
  readonly run: GenFlowRun;
  /** Bookkeeping (a workspace switch, an undo before a re-run): no toast. Default: `run`. */
  readonly quiet?: GenFlowRun;
  /** Hands the gateway's bearer token to the client (kept in memory); absent: no token prompt. */
  readonly setToken?: (token: string | null) => void;
  /** Re-encodes a picked picture (default: the browser's, `./image`). */
  readonly reencode?: (file: Blob, name: string) => Promise<ReencodedImage>;
}

export interface GenImageState {
  readonly status: 'idle' | 'reading' | 'uploading' | 'ready' | 'error';
  readonly image: ReencodedImage | null;
  /** The gateway's upload id once uploaded. */
  readonly upload: string | null;
  readonly message: string | null;
}

export interface GenQuoteState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly quote: GenQuote | null;
  readonly message: string | null;
  /** The request the quote is for (without its idempotency key). */
  readonly key: string;
}

export interface GenPostState {
  readonly job: string;
  readonly preset: GenPresetId;
  readonly colours: number;
  readonly texture: 'palette' | 'keep';
  readonly height: number | null;
  readonly status: 'idle' | 'running' | 'done' | 'error';
  readonly result: GenImportResult | null;
  readonly message: string | null;
  /** The provider rig's quote, when the provider offers a VRM-named rig. */
  readonly rigQuote: GenQuoteState | null;
}

export interface GenFlowState {
  readonly mode: GenFlowOp;
  readonly prompt: string;
  readonly image: GenImageState;
  readonly preset: GenPresetId;
  /** The chosen provider; null = the preset's. */
  readonly provider: string | null;
  readonly texture: TextureMode;
  /** The attested plan per provider (null: not answered yet). */
  readonly tiers: Readonly<Record<string, 'paid' | 'free'>>;
  /** The picture shows a real person the person may use (true), or no person (false); null: not answered. */
  readonly realPerson: boolean | null;
  readonly keepPrompt: boolean;
  readonly maxCostUsd: number;
  readonly quote: GenQuoteState;
  readonly submitting: boolean;
  readonly message: { readonly tone: 'info' | 'error'; readonly text: string } | null;
  readonly post: GenPostState | null;
}

const IDLE_QUOTE: GenQuoteState = { status: 'idle', quote: null, message: null, key: '' };
const IDLE_IMAGE: GenImageState = { status: 'idle', image: null, upload: null, message: null };

export const DEFAULT_MAX_COST_USD = 2;

export function defaultGenFlowState(): GenFlowState {
  return {
    mode: 'image-to-model',
    prompt: '',
    image: IDLE_IMAGE,
    preset: 'character',
    provider: null,
    texture: 'color',
    tiers: {},
    realPerson: null,
    keepPrompt: false,
    maxCostUsd: DEFAULT_MAX_COST_USD,
    quote: IDLE_QUOTE,
    submitting: false,
    message: null,
    post: null,
  };
}

/** One tray row (the shells render it as they like). */
export interface GenJobView {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  readonly model: string;
  readonly state: GenJobEntry['job']['state'];
  readonly stateText: string;
  readonly progress: number | null;
  readonly active: boolean;
  readonly canCancel: boolean;
  readonly canRetry: boolean;
  readonly canImport: boolean;
  /** The live meshes and character the document holds from it. */
  readonly imported: { readonly meshes: readonly MeshId[]; readonly character: CharacterId | null };
  readonly badge: GenBadge | null;
  readonly rigOf: string | null;
  readonly costUsd: number | null;
  readonly watchError: string | null;
}

export interface GenProviderView {
  readonly info: GenProviderInfo;
  readonly tier: 'paid' | 'free' | null;
  readonly terms: readonly TermsBadge[];
}

/** Everything a shell renders, derived from the flow, the session and the document. */
export interface GenFlowView {
  readonly availability: GenAvailability;
  readonly providers: readonly GenProviderView[];
  /** The provider the request goes to (the chosen one or the preset's), or null. */
  readonly provider: GenProviderView | null;
  readonly quoteLine: string | null;
  /** Why Generate is off now (null: it may run). */
  readonly blocked: string | null;
  readonly jobs: readonly GenJobView[];
  /** Jobs still with the gateway or the provider (the help line's tray). */
  readonly activeCount: number;
}

export interface GenFlow {
  readonly host: GenFlowHost;
  readonly session: GenSession;
  getState(): GenFlowState;
  subscribe(listener: () => void): () => void;
  view(): GenFlowView;
  /** Asks the gateway what it offers (the first call also resumes this caller's open jobs). */
  check(): Promise<GenAvailability>;
  setToken(token: string): Promise<GenAvailability>;
  setMode(mode: GenFlowOp): void;
  setPrompt(prompt: string): void;
  /** Re-encodes and uploads a picture (null removes it). */
  setImage(file: Blob | null, name?: string): Promise<void>;
  setPreset(preset: GenPresetId): void;
  setProvider(provider: string | null): void;
  setTexture(texture: TextureMode): void;
  attest(provider: string, tier: 'paid' | 'free'): void;
  setRealPerson(value: boolean | null): void;
  setKeepPrompt(value: boolean): void;
  setMaxCost(usd: number): void;
  /** The quote of the current inputs (refreshed after changes; called directly by tests). */
  refreshQuote(): Promise<void>;
  /** `gen.submit` with the current inputs; returns the job id, or null when it did not run. */
  submit(): Promise<string | null>;
  cancel(job: string): Promise<boolean>;
  retry(job: string): Promise<string | null>;
  dismiss(job: string): void;
  /** Opens the clean-up for a finished job. */
  openPost(job: string): void;
  setPost(patch: Partial<Pick<GenPostState, 'preset' | 'colours' | 'texture' | 'height'>>): void;
  closePost(): void;
  /** `gen.import` with the clean-up settings (again: the last import of this job is undone first). */
  runPost(): Promise<GenImportResult | null>;
  /** What to offer once a job's model is in: Auto-Rig, the provider's VRM-named rig, or nothing. */
  rigOffers(job: string): readonly ('auto-rig' | 'provider')[];
  /** The provider rig's quote for a job (Q-GEN-8), into `post.rigQuote`. */
  quoteProviderRig(job: string): Promise<void>;
  /** `gen.submit {op: 'rig'}` for a job's model (spends money); returns the rig job's id. */
  providerRig(job: string): Promise<string | null>;
  dispose(): void;
}

const messageOf = (result: OperatorResult<unknown>): string =>
  result.status === 'failed' ? result.error.message : result.status === 'cancelled' ? result.reason : '';

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The client's 404 / 401 as availability. */
function availabilityOf(error: unknown): GenAvailability {
  const code = (error as { readonly code?: unknown }).code;
  const status = (error as { readonly status?: unknown }).status;
  if (code === 'not-found' || status === 404) return { status: 'unavailable', message: GEN_TEXT.unavailable };
  if (code === 'unauthorized' || status === 401) return { status: 'needs-token', message: GEN_TEXT.needsToken };
  return { status: 'error', message: errorText(error) };
}

const requestKey = (req: GenRequest): string => JSON.stringify({ ...req, idempotencyKey: '' });

export function createGenFlow(host: GenFlowHost, initial: GenFlowState = defaultGenFlowState()): GenFlow {
  const { app } = host;
  const quiet = host.quiet ?? host.run;
  const session = genSessionOf(app);
  const reencode = host.reencode ?? reencodeImage;
  let state = initial;
  const listeners = new Set<() => void>();
  let resumed = false;
  let quoteTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  const set = (patch: Partial<GenFlowState>): void => {
    state = { ...state, ...patch };
    emit();
  };
  const offSession = session.subscribe(emit);
  const offStore = app.store.subscribe(() => emit());
  const client = (): GenerationClient | null => app.services.generation ?? null;

  const providerList = (): readonly GenProviderInfo[] => session.getState().providers?.providers ?? [];
  const currentProvider = (): GenProviderInfo | null =>
    providerFor(providerList(), state.preset, state.mode, state.provider);

  /** The request of the current inputs (attestation as answered, 'unknown' for a quote). */
  const draft = (): GenRequest | null => {
    const provider = currentProvider();
    if (provider === null) return null;
    const prompt = state.prompt.trim();
    if (state.mode === 'text-to-model' && prompt === '') return null;
    if (state.mode === 'image-to-model' && state.image.upload === null) return null;
    return buildRequest(
      session,
      {
        provider: provider.id,
        op: state.mode,
        ...(state.mode === 'text-to-model' || prompt !== '' ? { prompt } : {}),
        preset: state.preset,
        params: { texture: state.texture },
        maxCostUsd: state.maxCostUsd,
        tier: state.tiers[provider.id] ?? 'unknown',
        ...(state.mode === 'image-to-model' && state.realPerson !== null ? { realPersonPhoto: state.realPerson } : {}),
        idempotencyKey: 'quote-0000000000000000',
      },
      state.mode === 'image-to-model' && state.image.upload !== null ? [{ upload: state.image.upload }] : undefined,
    );
  };

  const refreshQuote = async (): Promise<void> => {
    const c = client();
    const req = draft();
    if (c === null || req === null || session.getState().availability.status !== 'ready') {
      if (state.quote.status !== 'idle') set({ quote: IDLE_QUOTE });
      return;
    }
    const key = requestKey(req);
    if (state.quote.key === key && state.quote.status !== 'error') return;
    set({ quote: { status: 'loading', quote: null, message: null, key } });
    try {
      const quote = await c.quote(req);
      if (state.quote.key === key) set({ quote: { status: 'ready', quote, message: null, key } });
    } catch (error) {
      if (state.quote.key === key) set({ quote: { status: 'error', quote: null, message: errorText(error), key } });
    }
  };

  const scheduleQuote = (): void => {
    if (quoteTimer !== null) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      if (!disposed) void refreshQuote();
    }, 250);
  };

  const input = (patch: Partial<GenFlowState>): void => {
    set({ ...patch, message: null });
    scheduleQuote();
  };

  /** Resumes this caller's jobs from the gateway after a reload (the requests are not kept: no retry for them). */
  const resume = async (c: GenerationClient): Promise<void> => {
    if (resumed) return;
    resumed = true;
    let jobs: Awaited<ReturnType<GenerationClient['jobs']>>;
    try {
      jobs = await c.jobs();
    } catch {
      return;
    }
    for (const job of jobs.slice(0, 20)) {
      if (session.entry(job.id) !== undefined) continue;
      if (isTerminalState(job.state) && job.state !== 'succeeded') continue;
      session.put({
        job,
        request: null,
        preset: 'character',
        keepPrompt: false,
        prompt: null,
        title: job.op === 'rig' ? 'Rig' : 'Earlier generation',
        rigOf: null,
        imported: null,
        watchError: null,
      });
      trackJob(app, job.id);
    }
  };

  const check = async (): Promise<GenAvailability> => {
    const c = client();
    if (c === null) {
      const off: GenAvailability = { status: 'off' };
      session.setState({ availability: off });
      return off;
    }
    session.setState({ availability: { status: 'checking' } });
    try {
      const providers = await c.providers();
      const ready: GenAvailability = providers.providers.some((p) => p.configured || p.byoAllowed)
        ? { status: 'ready' }
        : { status: 'error', message: GEN_TEXT.noProvider };
      session.setState({ availability: ready, providers });
      await resume(c);
      scheduleQuote();
      return ready;
    } catch (error) {
      const availability = availabilityOf(error);
      session.setState({ availability });
      return availability;
    }
  };

  const view = (): GenFlowView => {
    const sessionState: GenSessionState = session.getState();
    const providers = providerList().map(
      (info): GenProviderView => ({
        info,
        tier: state.tiers[info.id] ?? null,
        terms: termsBadges(info.terms, state.tiers[info.id] ?? null),
      }),
    );
    const current = currentProvider();
    const provider = current === null ? null : (providers.find((p) => p.info.id === current.id) ?? null);
    const jobs = sessionState.jobs.map((entry): GenJobView => {
      const { job } = entry;
      const artifact = modelArtifact(job);
      const imported = importedFrom(app, entry);
      const generator = artifact === undefined ? null : assetGenerator(app.store, artifact.sha256 as never);
      return {
        id: job.id,
        title: entry.title,
        provider: providerInfo(session, job.provider)?.label ?? job.provider,
        model: job.model,
        state: job.state,
        stateText: jobStateText(job),
        progress: job.progress,
        active: !isTerminalState(job.state),
        canCancel: !isTerminalState(job.state) && job.state !== 'fetching',
        canRetry: isTerminalState(job.state) && job.state !== 'succeeded' && entry.request !== null,
        canImport: job.state === 'succeeded' && artifact !== undefined,
        imported,
        badge:
          generator === null
            ? null
            : badgeOf({ origin: 'generated', derivedFrom: [], redistributable: 'unknown', generator }),
        rigOf: entry.rigOf,
        costUsd: job.costUsd,
        watchError: entry.watchError,
      };
    });
    return {
      availability: sessionState.availability,
      providers,
      provider,
      quoteLine: state.quote.quote === null ? null : quoteLine(state.quote.quote),
      blocked: blockedReason(provider),
      jobs,
      activeCount: jobs.filter((job) => job.active).length,
    };
  };

  const blockedReason = (provider: GenProviderView | null): string | null => {
    const availability = session.getState().availability;
    if (availability.status !== 'ready') {
      return availability.status === 'checking' || availability.status === 'unknown'
        ? GEN_TEXT.checking
        : 'message' in availability
          ? availability.message
          : GEN_TEXT.unavailable;
    }
    if (provider === null) return GEN_TEXT.noProvider;
    if (state.mode === 'text-to-model' && state.prompt.trim() === '') return 'Describe what to make';
    if (state.mode === 'image-to-model') {
      if (state.image.status === 'reading' || state.image.status === 'uploading') return 'Reading the picture…';
      if (state.image.upload === null) return state.image.message ?? 'Add a picture';
      if (state.realPerson === null) return GEN_TEXT.realPersonQuestion;
    }
    if (provider.tier === null) return `Say which plan you have with ${provider.info.label}`;
    if (state.quote.status === 'loading' || state.quote.status === 'idle') return GEN_TEXT.quoting;
    if (state.quote.status === 'error') return state.quote.message ?? 'The price could not be checked';
    const quote = state.quote.quote;
    if (quote !== null) {
      if (quote.usd > state.maxCostUsd) return `It costs more than your limit of $${state.maxCostUsd.toFixed(2)}`;
      if (quote.usd > quote.caps.remainingDailyUsd || quote.usd > quote.caps.remainingMonthlyUsd)
        return 'It is over what this server may spend now';
    }
    if (state.submitting) return GEN_TEXT.generating;
    return null;
  };

  const submit = async (): Promise<string | null> => {
    const provider = currentProvider();
    const blocked = blockedReason(provider === null ? null : (view().provider ?? null));
    if (blocked !== null || provider === null) {
      set({ message: { tone: 'error', text: blocked ?? GEN_TEXT.noProvider } });
      return null;
    }
    const prompt = state.prompt.trim();
    const tier = state.tiers[provider.id] ?? 'unknown';
    set({ submitting: true, message: null });
    try {
      const result = await host.run('gen.submit', {
        provider: provider.id,
        op: state.mode,
        ...(prompt === '' ? {} : { prompt }),
        ...(state.mode === 'image-to-model' && state.image.upload !== null
          ? { images: [{ upload: state.image.upload }] }
          : {}),
        preset: state.preset,
        params: { texture: state.texture },
        maxCostUsd: state.maxCostUsd,
        tier,
        ...(state.mode === 'image-to-model' && state.realPerson !== null ? { realPersonPhoto: state.realPerson } : {}),
        keepPrompt: state.keepPrompt,
        idempotencyKey: newIdempotencyKey(),
        title: prompt !== '' ? undefined : state.image.image !== null ? `From ${state.image.image.name}` : undefined,
      });
      if (result.status !== 'finished') {
        set({ submitting: false, message: { tone: 'error', text: messageOf(result) } });
        return null;
      }
      const job = (result.value as { readonly job: { readonly id: string } }).job.id;
      set({ submitting: false, message: { tone: 'info', text: `Sent to ${provider.label}` } });
      return job;
    } catch (error) {
      set({ submitting: false, message: { tone: 'error', text: errorText(error) } });
      return null;
    }
  };

  const runPost = async (): Promise<GenImportResult | null> => {
    const post = state.post;
    if (post === null) return null;
    const entry = session.entry(post.job);
    if (entry === undefined) return null;
    set({ post: { ...post, status: 'running', message: null } });
    // Again with other settings: the last import of this job is undone first (when it is the top step).
    if (post.result !== null && post.status === 'done') {
      if (app.history.peekUndo()?.label === IMPORT_LABEL) await quiet('edit.undo');
    }
    if (app.session.getState().workspace !== 'model') await quiet('workspace.set', { workspace: 'model' });
    const result = await host.run('gen.import', {
      job: post.job,
      preset: post.preset,
      colours: post.colours,
      texture: post.texture,
      ...(post.height === null ? {} : { height: post.height }),
    });
    const current = state.post;
    if (current === null || current.job !== post.job) return null;
    if (result.status !== 'finished') {
      set({ post: { ...current, status: 'error', message: messageOf(result) } });
      return null;
    }
    const value = result.value as GenImportResult;
    set({ post: { ...current, status: 'done', result: value, message: null } });
    return value;
  };

  const rigOffers = (job: string): readonly ('auto-rig' | 'provider')[] => {
    const entry = session.entry(job);
    if (entry === undefined || !GEN_PRESETS[entry.preset].humanoid || entry.job.op === 'rig') return [];
    const info = providerInfo(session, entry.job.provider);
    const vrm = info?.capabilities.rig?.skeletons.includes('vrm') === true;
    return vrm ? ['auto-rig', 'provider'] : ['auto-rig'];
  };

  const rigRequest = (job: string): GenRequest | null => {
    const entry = session.entry(job);
    if (entry === undefined) return null;
    const tier = state.tiers[entry.job.provider] ?? entry.request?.attestation.tier ?? 'unknown';
    return buildRequest(
      session,
      {
        provider: entry.job.provider,
        op: 'rig',
        source: { job },
        params: { skeleton: 'vrm' },
        maxCostUsd: state.maxCostUsd,
        tier,
        idempotencyKey: newIdempotencyKey(),
      },
      undefined,
    );
  };

  const flow: GenFlow = {
    host,
    session,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view,
    check,
    async setToken(token) {
      host.setToken?.(token.trim() === '' ? null : token.trim());
      return check();
    },
    setMode: (mode) => input({ mode }),
    setPrompt: (prompt) => input({ prompt }),
    async setImage(file, name = 'picture') {
      if (file === null) {
        input({ image: IDLE_IMAGE, realPerson: null });
        return;
      }
      set({ image: { status: 'reading', image: null, upload: null, message: null }, realPerson: null, message: null });
      let image: ReencodedImage;
      try {
        image = await reencode(file, name);
      } catch (error) {
        set({ image: { status: 'error', image: null, upload: null, message: errorText(error) } });
        return;
      }
      const c = client();
      if (c === null) {
        set({ image: { status: 'error', image, upload: null, message: GEN_TEXT.unavailable } });
        return;
      }
      set({ image: { status: 'uploading', image, upload: null, message: null } });
      try {
        const upload = await c.upload(image.png, 'image/png');
        if (state.image.image !== image) return;
        input({ image: { status: 'ready', image, upload: upload.upload, message: null } });
      } catch (error) {
        if (state.image.image === image)
          set({ image: { status: 'error', image, upload: null, message: errorText(error) } });
      }
    },
    setPreset: (preset) => input({ preset }),
    setProvider: (provider) => input({ provider }),
    setTexture: (texture) => input({ texture }),
    attest: (provider, tier) => input({ tiers: { ...state.tiers, [provider]: tier } }),
    setRealPerson: (realPerson) => input({ realPerson }),
    setKeepPrompt: (keepPrompt) => set({ keepPrompt }),
    setMaxCost: (usd) => set({ maxCostUsd: Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_MAX_COST_USD }),
    refreshQuote,
    submit,
    async cancel(job) {
      const result = await host.run('gen.cancel', { job });
      return result.status === 'finished';
    },
    async retry(job) {
      const result = await host.run('gen.retry', { job });
      if (result.status !== 'finished') return null;
      return (result.value as { readonly job: { readonly id: string } }).job.id;
    },
    dismiss(job) {
      session.drop(job);
      if (state.post?.job === job) set({ post: null });
    },
    openPost(job) {
      const entry = session.entry(job);
      if (entry === undefined) return;
      set({
        post: {
          job,
          preset: entry.preset,
          colours: 16,
          texture: 'palette',
          height: null,
          status: 'idle',
          result: null,
          message: null,
          rigQuote: null,
        },
      });
    },
    setPost(patch) {
      if (state.post !== null) set({ post: { ...state.post, ...patch } });
    },
    closePost: () => set({ post: null }),
    runPost,
    rigOffers,
    async quoteProviderRig(job) {
      const c = client();
      const req = rigRequest(job);
      const post = state.post;
      if (c === null || req === null || post === null) return;
      const key = requestKey(req);
      set({ post: { ...post, rigQuote: { status: 'loading', quote: null, message: null, key } } });
      try {
        const quote = await c.quote(req);
        if (state.post !== null)
          set({ post: { ...state.post, rigQuote: { status: 'ready', quote, message: null, key } } });
      } catch (error) {
        if (state.post !== null)
          set({ post: { ...state.post, rigQuote: { status: 'error', quote: null, message: errorText(error), key } } });
      }
    },
    async providerRig(job) {
      const req = rigRequest(job);
      if (req === null) return null;
      const result = await host.run('gen.submit', {
        provider: req.provider,
        op: 'rig',
        source: { job },
        params: req.params,
        maxCostUsd: req.maxCostUsd,
        tier: req.attestation.tier,
        title: `Rig of ${session.entry(job)?.title ?? 'the model'}`,
      });
      if (result.status !== 'finished') {
        set({ message: { tone: 'error', text: messageOf(result) } });
        return null;
      }
      return (result.value as { readonly job: { readonly id: string } }).job.id;
    },
    dispose() {
      disposed = true;
      if (quoteTimer !== null) clearTimeout(quoteTimer);
      offSession();
      offStore();
      listeners.clear();
    },
  };
  return flow;
}

const flows = new WeakMap<EditorApp, Map<string, GenFlow>>();

/**
 * The flow of a shell on an app (one per `key`: 'pro', 'halo'), created on first use with that shell's host. Its inputs
 * survive the panel or the sheet closing; the jobs are the app's session (shared by every shell).
 */
export function genFlowOf(host: GenFlowHost, key: string): GenFlow {
  let byKey = flows.get(host.app);
  if (byKey === undefined) {
    byKey = new Map();
    flows.set(host.app, byKey);
  }
  let flow = byKey.get(key);
  if (flow === undefined) {
    flow = createGenFlow(host);
    byKey.set(key, flow);
  }
  return flow;
}
