// The `gen.*` operators' contract (MODELING-PLAN §7.2 G-d; DECISIONS M7-GD-*): arguments and results. Eager-safe:
// plain types (the operators' `OperatorMap` rows read them).
import type { AssetId, CharacterId, MeshId, PaletteId } from '@ekza-studio/doc';
import type { GenJob, GenOp, GenParams } from '@ekza-studio/gen-core';
import type { GenPresetId } from './presets';

/** `gen.submit`: one generation request. Spends money: agents need the person's confirmation (agent policy). */
export interface GenSubmitArgs {
  readonly provider: string;
  readonly op: GenOp;
  readonly prompt?: string;
  /** Images already uploaded to the gateway (`GenerationClient.upload`). */
  readonly images?: readonly { readonly upload: string }[];
  /** An image re-encoded in the browser (PNG, no EXIF or GPS): the operator uploads it first. */
  readonly image?: Uint8Array;
  /** `rig` / `retopology`: an earlier job of this session (its model). */
  readonly source?: { readonly job: string };
  /** The size preset (default 'character'): the face budget and the clean-up after the import. */
  readonly preset?: GenPresetId;
  /** Overrides of the preset's parameters (the provider's ranges apply). */
  readonly params?: GenParams;
  /** The most this job may cost (the gateway refuses a quote above it; its server caps apply too). */
  readonly maxCostUsd: number;
  /** The person's statement of their plan at this provider (Q-GEN-9). */
  readonly tier: 'paid' | 'free' | 'unknown';
  /** The photo shows a real person and the person may use it (required by some providers' terms). */
  readonly realPersonPhoto?: boolean;
  /** Keep the prompt text in the model's provenance (Q-GEN-5; default: its hash only). */
  readonly keepPrompt?: boolean;
  /** 16–128 of [A-Za-z0-9_-]; default a fresh one (a resubmit with the same key returns the same job). */
  readonly idempotencyKey?: string;
  /** A short plain title for the job tray (default from the prompt or the image). */
  readonly title?: string;
}

export interface GenJobArgs {
  readonly job: string;
}

export interface GenJobResult {
  readonly job: GenJob;
}

/** The outcome of `mesh.intake` (DECISIONS M7-GA-CONTRACT-6), as `gen.import` reads it. */
export interface GenIntakeOutcome {
  readonly meshes: readonly MeshId[];
  readonly palette: PaletteId | null;
  readonly triangles: { readonly before: number; readonly after: number };
  readonly colours: number | null;
  readonly steps: readonly {
    readonly kind: string;
    readonly ms: number;
    readonly trianglesBefore: number;
    readonly trianglesAfter: number;
    readonly facts: Readonly<Record<string, number | string | boolean>>;
  }[];
  readonly warnings: readonly string[];
  readonly aiMarksMayBeAltered: boolean;
  readonly worker: boolean;
  readonly ms: number;
}

/** `gen.import`: the finished job's model into the document, cleaned up by `mesh.intake` (one undo step). */
export interface GenImportArgs {
  readonly job: string;
  /** The clean-up preset (default: the job's own). */
  readonly preset?: GenPresetId;
  /** Palette size of the palette bake (≤ 16 by default). */
  readonly colours?: number;
  /** Target height in metres (null: 1.70 m for characters, the model's own size for props). */
  readonly height?: number | null;
  /** 'palette' bakes flat colours; 'keep' keeps the texture (downsized). */
  readonly texture?: 'palette' | 'keep';
  readonly quadrangulate?: boolean;
  /** false: import without the clean-up (default true when `mesh.intake` is available). */
  readonly clean?: boolean;
  /** Keep the prompt text in the provenance (default: the job's opt-in). */
  readonly keepPrompt?: boolean;
}

export interface GenImportResult {
  readonly asset: AssetId;
  readonly meshes: readonly MeshId[];
  /** The character a rigged model became, else null. */
  readonly character: CharacterId | null;
  /** The clean-up's outcome, null when it did not run. */
  readonly outcome: GenIntakeOutcome | null;
  /** What to offer next: the provider's VRM-named rig, Auto-Rig, or nothing (a prop, a rigged character). */
  readonly rig: 'provider' | 'auto-rig' | null;
  readonly warnings: readonly string[];
}
