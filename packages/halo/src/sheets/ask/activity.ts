// The agent's live activity for the top bar (STUDIO-TOUCH-SPEC §14; T12, P-T10-3), in the Ask sheet's lazy chunk: once
// the sheet has loaded the agent module, a watcher per app follows the page's agent runtime and its session and puts
// the pill's words into the eager slot (`history/activity.ts`) while the agent works — after the sheet closes too.
import type * as AgentApi from '@ekza-studio/editor/agent';
import { setAiActivity } from '../../history/activity';

type AgentModule = typeof AgentApi;
type State = AgentApi.AgentSessionState;

interface AppLike {
  readonly session: { getState(): { readonly activeClip: unknown } };
  readonly store: { get(table: 'clips', id: never): { readonly name: string } | undefined };
}

/** The pill's words for a session state, as Ask's activity line shows them (`AI is editing: …`). */
export function activityView(app: AppLike, module: AgentModule, state: State): ReturnType<AgentModule['pillView']> {
  return module.pillView(state, {
    activeClipOf: (character) =>
      (app.session.getState().activeClip as Record<string, string | undefined>)[character] ?? null,
    clipName: (clip) => app.store.get('clips', clip as never)?.name ?? null,
    userRedoSteps: 0,
  });
}

/** The top bar's line for a state: the agent at work or asking (paired), or asking for access; else nothing. */
export function topBarActivity(app: AppLike, module: AgentModule, state: State | null): { text: string } | null {
  if (state === null) return null;
  if (state.status !== 'paired' && state.status !== 'claimed') return null;
  const view = activityView(app, module, state);
  return view.tone === 'busy' ? { text: view.text } : null;
}

const watched = new WeakSet<object>();

/** Follows the app's agent for the page's life (once per app): the runtime's session, then that session's state. */
export function watchAgentActivity(app: AppLike & object, module: AgentModule): void {
  if (watched.has(app)) return;
  watched.add(app);
  const runtime = module.agentRuntimeOf(app as never);
  let session: AgentApi.AgentSessionHandle | null = null;
  let offSession: (() => void) | null = null;
  const update = (): void => {
    const next = runtime.store.getState().session;
    if (next !== session) {
      offSession?.();
      session = next;
      offSession = next === null ? null : next.store.subscribe(update);
    }
    setAiActivity(app, topBarActivity(app, module, session?.store.getState() ?? null));
  };
  runtime.store.subscribe(update);
  update();
}
