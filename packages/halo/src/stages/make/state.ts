// The Make stage's own UI state (STUDIO-TOUCH-SPEC §11; T8): which tray menu is open and *Select area* (drags on the
// canvas draw a marquee, the twin of the Thumb key's Select more on empty space, §5.2.1). Per app, never in the document or Pro's preferences; read by React through `useMakeState`.
import type { EditorApp } from '@ekza-studio/editor-core';
import { useSyncExternalStore } from 'react';

export type MakeMenu = 'drag' | 'cut' | 'cleanUp' | 'newShape' | 'reduce' | 'pick' | null;

export interface MakeUi {
  readonly menu: MakeMenu;
  /** Drags on the canvas select an area (the select tool's marquee) instead of turning the view. */
  readonly selectArea: boolean;
}

const INITIAL: MakeUi = { menu: null, selectArea: false };

export interface MakeStore {
  get(): MakeUi;
  set(patch: Partial<MakeUi>): void;
  subscribe(listener: () => void): () => void;
}

const stores = new WeakMap<EditorApp, MakeStore>();

export function makeStore(app: EditorApp): MakeStore {
  let store = stores.get(app);
  if (store !== undefined) return store;
  let state = INITIAL;
  const listeners = new Set<() => void>();
  store = {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if ((Object.keys(patch) as (keyof MakeUi)[]).every((key) => Object.is(state[key], next[key]))) return;
      state = next;
      for (const listener of Array.from(listeners)) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  stores.set(app, store);
  return store;
}

export function useMakeState<T>(app: EditorApp, select: (state: MakeUi) => T): T {
  const store = makeStore(app);
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => select(store.get()),
    () => select(store.get()),
  );
}
