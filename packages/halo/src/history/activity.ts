// The live AI activity line (STUDIO-TOUCH-SPEC §14; T12, P-T10-3): what a paired agent is doing now, under the search
// pill of the top bar — *AI is editing: Set Key L Hand*, *AI asks: …*. An eager, import-free slot per app: the agent
// module is a lazy chunk (Ask's), so the Ask sheet's watcher (`sheets/ask/activity.ts`) fills the slot once it has
// loaded the module, and keeps filling it after the sheet closes; the top bar only reads it.

/** The line's words, or null when the agent is idle, paused, not paired or not loaded. */
export interface AiActivity {
  readonly text: string;
}

interface Slot {
  value: AiActivity | null;
  readonly listeners: Set<() => void>;
}

const slots = new WeakMap<object, Slot>();

function slotOf(owner: object): Slot {
  let slot = slots.get(owner);
  if (slot === undefined) {
    slot = { value: null, listeners: new Set() };
    slots.set(owner, slot);
  }
  return slot;
}

/** Sets the line (null clears it); listeners hear only a change of words. */
export function setAiActivity(owner: object, value: AiActivity | null): void {
  const slot = slotOf(owner);
  if ((slot.value?.text ?? null) === (value?.text ?? null)) return;
  slot.value = value;
  for (const listener of slot.listeners) listener();
}

/** The line now, or null. */
export const aiActivity = (owner: object): AiActivity | null => slotOf(owner).value;

/** Subscribes to the line of `owner` (the app). */
export function subscribeAiActivity(owner: object, listener: () => void): () => void {
  const slot = slotOf(owner);
  slot.listeners.add(listener);
  return () => {
    slot.listeners.delete(listener);
  };
}
