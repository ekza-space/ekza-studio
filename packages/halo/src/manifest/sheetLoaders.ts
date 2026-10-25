// The lazy loaders of T6b's sheets (STUDIO-TOUCH-SPEC §20.6: every sheet is its own chunk; the shell prefetches them
// at idle after boot and on `online`, S23). The frame (T6a) renders `SHEET_LOADERS[id]` for the open sheet; the other
// packages add their sheets' loaders beside these when they land.
import type { ComponentType } from 'react';
import type { HaloSheetProps, T6bSheetId } from './sheets';

export type SheetModule = { readonly default: ComponentType<HaloSheetProps> };

export const SHEET_LOADERS: Readonly<Record<T6bSheetId, () => Promise<SheetModule>>> = {
  more: () => import('../sheets/more'),
  numbers: () => import('../sheets/numbers'),
  scene: () => import('../sheets/scene'),
  view: () => import('../sheets/view'),
  settings: () => import('../sheets/settings'),
  health: () => import('../sheets/health'),
  help: () => import('../sheets/help'),
  about: () => import('../sheets/about'),
};

/**
 * The stage packages' sheets (T7: the Library, §10.6; T10: History and Ask, §6.2, §14; T9: Checks, Bones and Weights,
 * §12), beside T6b's. T9's take the Rig stage as well (their host wraps them, `stages/rig/start.ts`): here they are
 * loaded for the idle prefetch only.
 */
export const STAGE_SHEET_LOADERS: Readonly<
  Record<'library' | 'history' | 'ask' | 'checks' | 'bones' | 'weights', () => Promise<SheetModule>>
> = {
  library: () => import('../sheets/library'),
  history: () => import('../sheets/history'),
  ask: () => import('../sheets/ask'),
  checks: () => import('../sheets/checks') as unknown as Promise<SheetModule>,
  bones: () => import('../sheets/bones') as unknown as Promise<SheetModule>,
  weights: () => import('../sheets/weights') as unknown as Promise<SheetModule>,
};

/** Prefetches every sheet chunk (the shell calls it at idle and on `online`, S23); failures are retried later. */
export function prefetchSheets(): Promise<void> {
  return Promise.all(
    [...Object.values(SHEET_LOADERS), ...Object.values(STAGE_SHEET_LOADERS)].map((load) =>
      load().catch(() => undefined),
    ),
  ).then(() => undefined);
}
