// The generation session of an app (MODELING-PLAN §7.2 G-d; ADR 0017 §2): what the gateway said about itself (the
// availability and its providers), the jobs of this page with the request each was made from (in memory only: prompt
// text never reaches a row, a log or the document, M7-GB-5, Q-GEN-5), their live snapshots and the bytes of the
// models already downloaded (for a re-run of the clean-up). Shared by the `gen.*` operators, the flow model and both
// shells' views, so the Pro panel, the help line's job tray and Halo's *Create with AI* sheet see the same jobs. Small
// and eager: the operators' polls read it; everything that talks to the gateway is in `./ops` and `./flow` (lazy).
import type { AssetId, CharacterId, MeshId } from '@ekza-studio/doc';
import type { GenJob, GenProvidersResponse, GenRequest, GenWatch, JobState } from '@ekza-studio/gen-core';
import type { EditorApp } from '../types';
import type { GenPresetId } from './presets';

/**
 * Whether this build can generate (ADR 0017 §2: null `services.generation` hides the feature; a 404 from the gateway
 * means it is not enabled; a 401 means it wants the operator's token).
 */
export type GenAvailability =
  | { readonly status: 'off' }
  | { readonly status: 'unknown' }
  | { readonly status: 'checking' }
  | { readonly status: 'ready' }
  | { readonly status: 'needs-token'; readonly message: string }
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'error'; readonly message: string };

/** What a job brought into the document (`gen.import`). */
export interface GenImported {
  readonly asset: AssetId;
  readonly meshes: readonly MeshId[];
  readonly character: CharacterId | null;
}

export interface GenJobEntry {
  readonly job: GenJob;
  /** The request it was made from; null for a job listed after a reload (the prompt is not kept). */
  readonly request: GenRequest | null;
  readonly preset: GenPresetId;
  /** The person opted in to keep the prompt text in the provenance (Q-GEN-5). */
  readonly keepPrompt: boolean;
  /** The prompt in memory, for the opt-in (null without one, or after a reload). */
  readonly prompt: string | null;
  /** A short plain description for the tray ("A wooden chair", "From photo.png"). */
  readonly title: string;
  /** The job a rig job rigs (provider rig, Q-GEN-8), else null. */
  readonly rigOf: string | null;
  readonly imported: GenImported | null;
  /** The last watch error (the stream and the polling both failed), else null. */
  readonly watchError: string | null;
}

export interface GenSessionState {
  readonly availability: GenAvailability;
  readonly providers: GenProvidersResponse | null;
  /** Newest first. */
  readonly jobs: readonly GenJobEntry[];
}

export interface GenSession {
  getState(): GenSessionState;
  setState(patch: Partial<GenSessionState>): void;
  subscribe(listener: (state: GenSessionState) => void): () => void;
  /** The entry of a job, or undefined. */
  entry(id: string): GenJobEntry | undefined;
  /** Adds an entry (newest first) or replaces the one with its id. */
  put(entry: GenJobEntry): void;
  /** Patches an entry's fields. */
  update(id: string, patch: Partial<Omit<GenJobEntry, 'job'>> & { readonly job?: GenJob }): void;
  /** Removes an entry from the tray (its watch closes, its bytes go). */
  drop(id: string): void;
  /** The watch of a job (one at a time). */
  setWatch(id: string, watch: GenWatch | null): void;
  /** The downloaded model bytes of a job (verified against their SHA-256), kept for a re-run of the clean-up. */
  readonly bytes: Map<string, Uint8Array>;
  /** Closes every watch. */
  dispose(): void;
}

/** States after which nothing changes (gen-core's `TERMINAL_STATES`, mirrored: editor-core imports gen-core types). */
export const GEN_TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed', 'blocked', 'canceled', 'expired'];
export const isTerminalState = (state: JobState): boolean => GEN_TERMINAL_STATES.includes(state);

/** A job is still with the gateway or the provider. */
export const isActiveJob = (job: GenJob): boolean => !isTerminalState(job.state);

const sessions = new WeakMap<EditorApp, GenSession>();

function createSession(app: EditorApp): GenSession {
  let state: GenSessionState = {
    availability: app.services.generation ? { status: 'unknown' } : { status: 'off' },
    providers: null,
    jobs: [],
  };
  const listeners = new Set<(state: GenSessionState) => void>();
  const watches = new Map<string, GenWatch>();
  const bytes = new Map<string, Uint8Array>();
  const emit = (): void => {
    for (const listener of [...listeners]) listener(state);
  };
  const set = (patch: Partial<GenSessionState>): void => {
    state = { ...state, ...patch };
    emit();
  };
  return {
    getState: () => state,
    setState: set,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    entry: (id) => state.jobs.find((entry) => entry.job.id === id),
    put(entry) {
      const others = state.jobs.filter((other) => other.job.id !== entry.job.id);
      const existing = state.jobs.findIndex((other) => other.job.id === entry.job.id);
      if (existing < 0) set({ jobs: [entry, ...others] });
      else set({ jobs: state.jobs.map((other) => (other.job.id === entry.job.id ? entry : other)) });
    },
    update(id, patch) {
      const entry = state.jobs.find((other) => other.job.id === id);
      if (entry === undefined) return;
      // A stale snapshot (an older revision from a slower channel) never replaces a newer one.
      const job = patch.job !== undefined && patch.job.revision >= entry.job.revision ? patch.job : entry.job;
      const next: GenJobEntry = { ...entry, ...patch, job };
      set({ jobs: state.jobs.map((other) => (other.job.id === id ? next : other)) });
    },
    drop(id) {
      watches.get(id)?.close();
      watches.delete(id);
      bytes.delete(id);
      set({ jobs: state.jobs.filter((entry) => entry.job.id !== id) });
    },
    setWatch(id, watch) {
      watches.get(id)?.close();
      if (watch === null) watches.delete(id);
      else watches.set(id, watch);
    },
    bytes,
    dispose() {
      for (const watch of watches.values()) watch.close();
      watches.clear();
      listeners.clear();
    },
  };
}

/** The app's generation session (created on first use). */
export function genSessionOf(app: EditorApp): GenSession {
  let session = sessions.get(app);
  if (session === undefined) {
    session = createSession(app);
    sessions.set(app, session);
  }
  return session;
}

/** The session when one exists (polls never create one). */
export const peekGenSession = (app: EditorApp): GenSession | undefined => sessions.get(app);

/** Plain reasons the `gen.*` polls and the flow share (§3 P12: what happened and what to do). */
export const GEN_REASONS = {
  off: 'AI generation is not set up on this server',
  unavailable: 'AI generation is not set up on this server',
  unknownJob: 'There is no such generation in this session',
  finished: 'This generation has already finished',
  notFinished: 'The model is not ready yet',
  notSucceeded: 'This generation did not produce a model',
  fetching: 'The model is being downloaded; it can no longer be stopped',
  notRetryable: 'Only a generation that failed, was stopped or expired can be tried again',
  noRequest: 'Start it again from the Generate panel: requests are not kept after a reload',
  readOnly: 'The project is read-only (written by a newer version)',
} as const;
