// The Next chip in Rig (STUDIO-TOUCH-SPEC §7.2: it never shows while a card or sheet is open; T9): it gives way while
// the Rig-it card, the *Adjust dots* session or a skin spot's card is open. Eager and tiny (the frame reads it); the
// stage's own parts stay in its lazy chunk.
import type { HaloStore } from '../../shell/store';
import { useHaloStore } from '../../shell/store';
import { rigUi, useRigUi } from './ui';

export function useRigHidesNext(store: HaloStore): boolean {
  const stage = useHaloStore(store, (s) => s.stage);
  const open = useRigUi(rigUi(store), (s) => s.card || s.dots || s.spot !== null);
  return stage === 'rig' && open;
}
