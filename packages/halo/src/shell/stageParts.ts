// Stage parts (STUDIO-TOUCH-SPEC §7.1, §20.2, §20.6; T8 seam, shared by T7 and T9): the stage packages
// (`stages/<stage>/`) own each stage's tray, its canvas layer (the handles and chips it draws beside the work, such as
// Make's cap handle) and the setup it needs while the shell is mounted (pane claims, sessions, noun bindings, test-API
// slices). The shell hosts them through this one seam: the tray slot renders the stage's `Tray` (a stage without one
// keeps the stand-in tray), the frame renders the current stage's `Layer` over the canvas, the controller installs
// every stage module once at start (a lazy chunk each, never in `/app`'s initial scripts) and registers the stage
// packages' sheets with the sheet host. A stage package adds one line to `STAGE_MODULES` (and to `STAGE_SHEETS` for
// its sheets); nothing else in the shell changes.
import type { HaloStage } from '@ekza-studio/editor-core';
import { type ComponentType, lazy } from 'react';
import type { SheetModule } from '../manifest/sheetLoaders';
import type { HaloController } from './controller';
import type { SizeClass } from './hooks';
import { registerHaloSheet } from './Sheets';

export interface StageTrayProps {
  readonly controller: HaloController;
  /** A Compact container (§4.4): the tray folds its lowest-priority items into its pinned ⋯. */
  readonly compact: boolean;
}

export interface StageLayerProps {
  readonly controller: HaloController;
  /** The frame (= the single pane) in CSS px. */
  readonly width: number;
  readonly height: number;
  readonly size: SizeClass;
  /** Below the top bar (px from the frame's top). */
  readonly insetTop: number;
  /** Above the tray (px from the frame's bottom). */
  readonly insetBottom: number;
}

/** What a stage package's entry module (`stages/<stage>/index.ts`) exports. */
export interface StageModule {
  readonly Tray?: ComponentType<StageTrayProps>;
  readonly Layer?: ComponentType<StageLayerProps>;
  /** Runs once per mounted shell (claims, sessions, noun bindings, test slices); the disposer undoes it. */
  readonly install?: (controller: HaloController) => () => void;
}

/** One lazy entry module per stage package (T8: Make and Paint; T7 adds Animate, T9 Rig). */
export const STAGE_MODULES: Readonly<Partial<Record<HaloStage, () => Promise<StageModule>>>> = {
  make: () => import('../stages/make'),
  paint: () => import('../stages/paint'),
};

/** The stage packages' sheets (`registerHaloSheet` ids), each its own lazy chunk. */
export const STAGE_SHEETS: Readonly<Record<string, () => Promise<SheetModule>>> = {
  palette: () => import('../sheets/palette'),
  makeEditableReport: () => import('../stages/make/report'),
  createAi: () => import('../stages/make/ai'),
};

const Nothing = (): null => null;
const trays = new Map<HaloStage, ComponentType<StageTrayProps>>();
const layers = new Map<HaloStage, ComponentType<StageLayerProps>>();

/** The stage's own tray (lazy), or null: the stand-in tray stays. */
export function stageTray(stage: HaloStage): ComponentType<StageTrayProps> | null {
  const load = STAGE_MODULES[stage];
  if (load === undefined) return null;
  let tray = trays.get(stage);
  if (tray === undefined) {
    tray = lazy(() => load().then((module) => ({ default: module.Tray ?? Nothing })));
    trays.set(stage, tray);
  }
  return tray;
}

/** The stage's canvas layer (lazy), or null. */
export function stageLayer(stage: HaloStage): ComponentType<StageLayerProps> | null {
  const load = STAGE_MODULES[stage];
  if (load === undefined) return null;
  let layer = layers.get(stage);
  if (layer === undefined) {
    layer = lazy(() => load().then((module) => ({ default: module.Layer ?? Nothing })));
    layers.set(stage, layer);
  }
  return layer;
}

/**
 * Installs every stage module and registers the stage packages' sheets (the controller's start); the disposer
 * removes all of it. A module that fails to load is retried by the next mount (the idle prefetch tries it again too).
 */
export function installStageParts(controller: HaloController): () => void {
  let disposed = false;
  const disposers: (() => void)[] = [];
  for (const [id, load] of Object.entries(STAGE_SHEETS)) disposers.push(registerHaloSheet(id, lazy(load)));
  for (const load of Object.values(STAGE_MODULES)) {
    void load().then(
      (module) => {
        if (disposed || module.install === undefined) return;
        disposers.push(module.install(controller));
      },
      () => {},
    );
  }
  return () => {
    disposed = true;
    for (const dispose of disposers.splice(0).reverse()) dispose();
  };
}

/** Prefetches the stage modules and their sheets (S23: at idle and on `online`). */
export function prefetchStageParts(): Promise<void> {
  const loads = [...Object.values(STAGE_MODULES), ...Object.values(STAGE_SHEETS)];
  return Promise.all(loads.map((load) => load().catch(() => undefined))).then(() => undefined);
}

// ---------- the test API's halo() slices (§20.7: "a marker-free test-API slice") ----------

const slices = new Map<string, () => unknown>();

/** A stage package's slice of `halo().slices` (e.g. `t8`); the disposer removes it. */
export function registerHaloSlice(name: string, read: () => unknown): () => void {
  slices.set(name, read);
  return () => {
    if (slices.get(name) === read) slices.delete(name);
  };
}

/** Every registered slice, read now. */
export function readHaloSlices(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, read] of slices) {
    try {
      out[name] = read();
    } catch {
      out[name] = null;
    }
  }
  return out;
}
