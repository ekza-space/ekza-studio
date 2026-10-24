// Whether *Create with AI* shows (M7 G-b/G-c, ADR 0017 §2, `docs/wp-notes/m7-gbc.md` "Availability"; T8, ST-T8-18).
// The client is the host's `EditorServices.generation` when it sets one (null hides the feature), else one made with
// gen-core's `createGenerationClient` over the build's gateway URL (`NEXT_PUBLIC_EKZA_GEN_GATEWAY`, handed over by
// `/app`'s entry through `setGenerationGateway`). No URL, or a gateway that answers `providers()` with 404 (not enabled),
// hides every entry. A gateway that is configured but does not answer (network, 5xx, a token it wants) keeps the
// entries and the sheet's "not connected" state; one that answers lists its providers. The Generate flow itself is G-d's.
// T12 (ST-T8-18, ST-INT-4): nothing is asked while `/app` loads. A server build's base is its own `/api/gen` even when
// the gateway is not enabled (404, the default of every deployment), so Home asks only once *Make a character* opens
// its starts, and the Make tray when the stage shows — as Studio Pro asks when its Generate panel opens (gen-05).
import type { EditorApp, EditorServices } from '@ekza-studio/editor-core';
import { useCallback, useSyncExternalStore } from 'react';
import { CREATE_WITH_AI_ENTRY } from './open';

type GenerationClient = NonNullable<EditorServices['generation']>;

export type AiAvailability =
  /** The first `providers()` call has not answered yet: the entries wait (hidden). */
  | { readonly state: 'checking' }
  /** No gateway on this build, the host's null, or a gateway that is not enabled (404). */
  | { readonly state: 'hidden' }
  /** A gateway is configured but did not answer (network, 5xx, protocol): "not connected". */
  | { readonly state: 'offline' }
  /** The gateway wants its bearer token (401): "not connected" until G-d asks for it. */
  | { readonly state: 'token' }
  /** The gateway answers: its providers' names. */
  | { readonly state: 'ready'; readonly providers: readonly string[] };

const CHECKING: AiAvailability = { state: 'checking' };
const HIDDEN: AiAvailability = { state: 'hidden' };

let gatewayUrl = '';

/** `/app`'s entry hands over the build's gateway base ('' or absent: no gateway). Call before the shell mounts. */
export function setGenerationGateway(url: string | undefined): void {
  gatewayUrl = (url ?? '').trim();
}

interface Probe {
  value: AiAvailability;
  promise: Promise<AiAvailability> | null;
  readonly listeners: Set<() => void>;
}

const probes = new WeakMap<EditorApp, Probe>();

function probeOf(app: EditorApp): Probe {
  let probe = probes.get(app);
  if (probe === undefined) {
    probe = { value: CHECKING, promise: null, listeners: new Set() };
    probes.set(app, probe);
  }
  return probe;
}

async function clientOf(app: EditorApp): Promise<GenerationClient | null> {
  const given = app.services.generation;
  if (given !== undefined) return given;
  if (gatewayUrl === '') return null;
  const { createGenerationClient } = await import('@ekza-studio/gen-core');
  return createGenerationClient({ baseUrl: gatewayUrl });
}

async function resolve(app: EditorApp): Promise<AiAvailability> {
  if (!CREATE_WITH_AI_ENTRY) return HIDDEN;
  const client = await clientOf(app);
  if (client === null) return HIDDEN;
  try {
    const answer = await client.providers();
    return { state: 'ready', providers: answer.providers.map((p) => p.label) };
  } catch (error) {
    const e = (typeof error === 'object' && error !== null ? error : {}) as {
      readonly code?: unknown;
      readonly status?: unknown;
    };
    if (e.status === 404 || e.code === 'not-found') return HIDDEN;
    if (e.status === 401 || e.code === 'unauthorized') return { state: 'token' };
    return { state: 'offline' };
  }
}

/** Asks the gateway once per app; later calls return the same answer. */
export function checkAi(app: EditorApp): Promise<AiAvailability> {
  const probe = probeOf(app);
  probe.promise ??= resolve(app).then((value) => {
    probe.value = value;
    for (const listener of probe.listeners) listener();
    return value;
  });
  return probe.promise;
}

/** The answer so far (`checking` until the gateway answers). */
export const aiAvailability = (app: EditorApp): AiAvailability => probeOf(app).value;

/** True when the entries show: a gateway is configured and enabled, connected or not. */
export const aiShown = (availability: AiAvailability): boolean =>
  availability.state === 'offline' || availability.state === 'token' || availability.state === 'ready';

/**
 * The answer, asked of the gateway once a surface that offers *Create with AI* shows (`ask`): with `ask` false it
 * subscribes without asking (`checking` until another surface asks), so a page load requests nothing (ST-INT-4).
 */
export function useAiAvailability(app: EditorApp, ask = true): AiAvailability {
  const probe = probeOf(app);
  const subscribe = useCallback(
    (listener: () => void) => {
      probe.listeners.add(listener);
      if (ask) void checkAi(app);
      return () => {
        probe.listeners.delete(listener);
      };
    },
    [app, probe, ask],
  );
  return useSyncExternalStore(
    subscribe,
    () => probe.value,
    () => probe.value,
  );
}
