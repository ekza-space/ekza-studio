// The size presets of the Generate flow (MODELING-PLAN §7.2 G-d; DECISIONS M7-GA-CONTRACT-1, Q-GEN-2): one preset
// sets the provider's face budget, the default provider (Tripo for characters, Meshy for props) and the clean-up
// preset `mesh.intake` runs after the import (Prop ≤ 500, Character ≤ 3,000, Hero ≤ 10,000 triangles). Types only from
// gen-core (editor-core holds no generation code of its own: ADR 0017 §2, M7-GB-14).
import type { GenOp, GenParams, GenProviderInfo, TextureMode } from '@ekza-studio/gen-core';

export type GenPresetId = 'prop' | 'character' | 'hero';

export interface GenPreset {
  readonly id: GenPresetId;
  /** The triangle budget: the provider's face limit and `mesh.intake`'s target. */
  readonly triangles: number;
  /** The provider the preset starts with (Q-GEN-2); the person may pick another. */
  readonly provider: string;
  /** A humanoid preset: the result is offered to a rig (the provider's VRM-named rig, else Auto-Rig). */
  readonly humanoid: boolean;
}

export const GEN_PRESETS: Readonly<Record<GenPresetId, GenPreset>> = {
  prop: { id: 'prop', triangles: 500, provider: 'meshy', humanoid: false },
  character: { id: 'character', triangles: 3000, provider: 'tripo', humanoid: true },
  hero: { id: 'hero', triangles: 10_000, provider: 'tripo', humanoid: true },
};

export const GEN_PRESET_IDS: readonly GenPresetId[] = ['prop', 'character', 'hero'];

export const isGenPreset = (value: unknown): value is GenPresetId =>
  value === 'prop' || value === 'character' || value === 'hero';

/** The generation ops the Generate flow offers (multiview is not offered in G1, M7-GC-6). */
export type GenFlowOp = Extract<GenOp, 'text-to-model' | 'image-to-model'>;

/**
 * The provider a preset uses among the listed ones: the chosen one when it offers `op`, else the preset's default,
 * else the first configured provider that offers `op` (null when none does).
 */
export function providerFor(
  providers: readonly GenProviderInfo[],
  preset: GenPresetId,
  op: GenOp,
  chosen: string | null,
): GenProviderInfo | null {
  const offers = (p: GenProviderInfo): boolean => p.capabilities.ops.includes(op);
  const usable = (p: GenProviderInfo): boolean => offers(p) && (p.configured || p.byoAllowed);
  const pick = (id: string | null): GenProviderInfo | undefined =>
    id === null ? undefined : providers.find((p) => p.id === id && usable(p));
  return pick(chosen) ?? pick(GEN_PRESETS[preset].provider) ?? providers.find(usable) ?? null;
}

/**
 * The request parameters of a preset for a provider: the face limit clamped to the provider's low-poly range, its
 * native low-poly model, and textures as base colour (the palette bake reads them; PBR quotes are inexact).
 */
export function presetParams(preset: GenPresetId, provider: GenProviderInfo | null, texture: TextureMode): GenParams {
  const budget = GEN_PRESETS[preset].triangles;
  const range = provider?.capabilities.lowPoly?.tris ?? null;
  const faceLimit = range === null ? budget : Math.min(Math.max(budget, range[0]), range[1]);
  const textures = provider?.capabilities.texture ?? ['none', 'color'];
  return {
    faceLimit,
    lowPoly: true,
    texture: textures.includes(texture) ? texture : (textures[0] ?? 'none'),
  };
}
