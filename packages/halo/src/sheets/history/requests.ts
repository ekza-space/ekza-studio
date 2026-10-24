// What the Ask sheet remembers per project page (STUDIO-TOUCH-SPEC §14; T10): the requests sent to the AI agent (the
// History titles its group of steps with the request they answer). Session memory only, never the document. The
// project as it was before the agent's first change is the agent session's own since T12 (P-T10-4,
// `AgentSession.beforeAgentSnapshot`).
import type { AskRequest } from './model';

const requests = new WeakMap<object, AskRequest[]>();

/** Remembers a request (the newest last). */
export function recordRequest(app: object, text: string, at = Date.now()): void {
  const list = requests.get(app) ?? [];
  const clean = text.trim();
  if (clean === '') return;
  if (list.at(-1)?.text === clean) return;
  list.push({ text: clean, at });
  requests.set(app, list);
}

export function requestsOf(app: object): readonly AskRequest[] {
  return requests.get(app) ?? [];
}
