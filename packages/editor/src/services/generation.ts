// The host's generation client (ADR 0017 §1–§3; MODELING-PLAN §7.2 G-d; DECISIONS M7-GB-12, M7-GD-*): the typed
// `GenerationClient` of gen-core against the build's gateway base (`NEXT_PUBLIC_EKZA_GEN_GATEWAY`: '/api/gen' in server
// builds, the build-time URL of a static export, '' = no gateway and the feature hidden). It is created lazily: the
// gen-core client loads with the first call (the Generate panel or *Create with AI* opening), so no route's first
// visit grows and nothing is requested before the person asks — a server build without the gateway enabled answers
// 404, and an eager probe would log that on every page load. The operator's bearer token lives in memory only (the
// panel asks for it on a 401); a bring-your-own provider key is not offered in G1 (Q-GEN-4).
import type { GenerationClient, GenWatch } from '@ekza-studio/gen-core';

export interface GenerationClientOptions {
  /** The gateway base ('' = none). */
  readonly baseUrl: string;
  /** Polling interval when the event stream is unavailable (default 3,000 ms). */
  readonly pollMs?: number;
}

const tokens = new WeakMap<GenerationClient, { value: string | null }>();

/** Sets (or clears) the gateway token of a client this module created; false for any other client. */
export function setGenerationToken(client: GenerationClient | null | undefined, token: string | null): boolean {
  const slot = client === null || client === undefined ? undefined : tokens.get(client);
  if (slot === undefined) return false;
  slot.value = token === null || token.trim() === '' ? null : token.trim();
  return true;
}

/** The client of a gateway base, or null without one (the feature is hidden). */
export function createLazyGenerationClient(opts: GenerationClientOptions): GenerationClient | null {
  const baseUrl = opts.baseUrl.trim();
  if (baseUrl === '') return null;
  const slot: { value: string | null } = { value: null };
  let real: Promise<GenerationClient> | null = null;
  const load = (): Promise<GenerationClient> => {
    real ??= import('@ekza-studio/gen-core').then((core) =>
      core.createGenerationClient({
        baseUrl,
        token: () => slot.value,
        ...(opts.pollMs === undefined ? {} : { pollMs: opts.pollMs }),
      }),
    );
    return real;
  };
  const client: GenerationClient = {
    protocol: 'ekza-gen/v1',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    providers: async (signal) => (await load()).providers(signal),
    upload: async (bytes, mime, signal) => (await load()).upload(bytes, mime, signal),
    quote: async (req, signal) => (await load()).quote(req, signal),
    submit: async (req, signal) => (await load()).submit(req, signal),
    job: async (id, signal) => (await load()).job(id, signal),
    jobs: async (signal) => (await load()).jobs(signal),
    cancel: async (id, signal) => (await load()).cancel(id, signal),
    artifact: async (artifact, signal) => (await load()).artifact(artifact, signal),
    watch(id, onJob, onError): GenWatch {
      let inner: GenWatch | null = null;
      let closed = false;
      void load().then(
        (c) => {
          if (!closed) inner = c.watch(id, onJob, onError);
        },
        (error: unknown) => {
          if (!closed) onError?.(error as Parameters<NonNullable<typeof onError>>[0]);
        },
      );
      return {
        close() {
          closed = true;
          inner?.close();
        },
      };
    },
  };
  tokens.set(client, slot);
  return client;
}
