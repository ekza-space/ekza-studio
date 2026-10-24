// The Rig stage's own UI state (STUDIO-TOUCH-SPEC §12; T9): the Rig-it card, the *Adjust dots* session and its
// Front · Side toggle, the skin spot of *Who owns this?*, the bend test, the weight display the brush tray shows, an
// open ▾ menu, the strokes of the open paint session. Session-local: never in the document or the preferences; one
// store per mounted shell (keyed by the shell's store), like the Animate stage's.
import type { MeshId } from '@ekza-studio/doc';
import { useSyncExternalStore } from 'react';
import type { HaloStore } from '../../shell/store';

/** A spot on the skin a finger held (§12.4 step 2): its mesh and point, and where it was on screen (pane px). */
export interface SkinSpot {
  readonly mesh: MeshId;
  readonly point: number;
  readonly paneId: string;
  readonly at: { readonly x: number; readonly y: number };
}

export type WeightShow = 'ramp' | 'greyscale' | 'influences' | 'off';

export interface RigUi {
  /** The Rig-it card is open (§12.2). */
  readonly card: boolean;
  /** The *Adjust dots* session is open (§12.2 step 3). */
  readonly dots: boolean;
  /** Regular and Compact containers show one dots pane at a time (§12.2: a toggle). */
  readonly dotsView: 'front' | 'side';
  /** *Who owns this?* at a skin spot (§12.4 step 2). */
  readonly spot: SkinSpot | null;
  /** The spot the open paint session started from (*This area follows*: its other bones swap in). */
  readonly follows: SkinSpot | null;
  /** The bend test: off, bending, or paused on a pose (§12.4 step 1). */
  readonly bend: 'off' | 'playing' | 'paused';
  /** The weight display in Rig (§4.7 stage lighting: the weight ramp in Skin; Show ▾ in the brush tray). */
  readonly show: WeightShow;
  /** An open ▾ of the tray (Add skeleton, Show). */
  readonly menu: string | null;
  /** Strokes painted in the open paint session (✕ asks above three, §5.7). */
  readonly strokes: number;
}

export const INITIAL_RIG_UI: RigUi = {
  card: false,
  dots: false,
  dotsView: 'front',
  spot: null,
  follows: null,
  bend: 'off',
  show: 'ramp',
  menu: null,
  strokes: 0,
};

export interface RigUiStore {
  get(): RigUi;
  set(patch: Partial<RigUi>): void;
  subscribe(listener: () => void): () => void;
}

const stores = new WeakMap<HaloStore, RigUiStore>();

/** The Rig stage's UI store of a mounted shell. */
export function rigUi(shell: HaloStore): RigUiStore {
  let store = stores.get(shell);
  if (store === undefined) {
    let state = INITIAL_RIG_UI;
    const listeners = new Set<() => void>();
    store = {
      get: () => state,
      set(patch) {
        const keys = Object.keys(patch) as (keyof RigUi)[];
        if (keys.every((key) => Object.is(state[key], patch[key]))) return;
        state = { ...state, ...patch };
        for (const listener of Array.from(listeners)) listener();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    stores.set(shell, store);
  }
  return store;
}

/** A slice of the Rig UI state. */
export function useRigUi<T>(store: RigUiStore, select: (state: RigUi) => T): T {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => select(store.get()),
    () => select(store.get()),
  );
}
