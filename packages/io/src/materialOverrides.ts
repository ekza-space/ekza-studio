// Imported-material MVP (Hub platform MAT-01). Only standard glTF PBR/unlit base RGB is editable.
// Identity includes the exact source bytes and the complete material JSON; names are display labels only.
import { EkzaError } from '@ekza-studio/anim-core';
import { parseGlb, parseGlbSync } from './glb/parse';
import { assembleGlb } from './glb/write';
import { canonicalJson } from './gltf/json';
import { isRecord } from './gltf/schema';
import { sha256HexSync } from './hash/sha256';
import type { GlbContainer } from './types';

export type MaterialColor = readonly [number, number, number, number];
export interface ImportedMaterialOverride {
  readonly baseSha256: string;
  readonly material: number;
  readonly materialSha256: string;
  /** Linear glTF RGB, multiplied with any existing texture. Alpha is retained from the source. */
  readonly baseColorFactor: MaterialColor;
}
export interface ImportedMaterialTarget extends ImportedMaterialOverride {
  readonly name: string;
  readonly supported: boolean;
  readonly reason: string | null;
}

export function materialColor(value: unknown): value is MaterialColor {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
  );
}

const targetCache = new WeakMap<GlbContainer, readonly ImportedMaterialTarget[]>();

export function importedMaterialTargets(source: GlbContainer): readonly ImportedMaterialTarget[] {
  const cached = targetCache.get(source);
  if (cached !== undefined) return cached;
  const materials = source.json['materials'];
  if (!Array.isArray(materials)) return [];
  const extensions = source.json['extensions'];
  const vrm = isRecord(extensions) ? extensions['VRM'] : null;
  const legacy: readonly unknown[] =
    isRecord(vrm) && Array.isArray(vrm['materialProperties']) ? vrm['materialProperties'] : [];
  const targets = (materials as unknown[]).map((value, material): ImportedMaterialTarget => {
    const json = isRecord(value) ? value : {};
    const ext = isRecord(json['extensions']) ? json['extensions'] : {};
    const pbr = isRecord(json['pbrMetallicRoughness']) ? json['pbrMetallicRoughness'] : {};
    const factor = pbr['baseColorFactor'] ?? [1, 1, 1, 1];
    const property = legacy[material];
    const shader = isRecord(property) ? property['shader'] : undefined;
    const unsupported =
      !isRecord(value) || !materialColor(factor)
        ? 'This material has an invalid base colour.'
        : Object.keys(ext).some((key) => key !== 'KHR_materials_unlit') ||
            (typeof shader === 'string' && shader !== 'VRM_USE_GLTFSHADER')
          ? 'Only standard glTF PBR and unlit materials support colour overrides. MToon and other shaders keep their source materials.'
          : null;
    return {
      baseSha256: source.sha256,
      material,
      materialSha256: sha256HexSync(new TextEncoder().encode(canonicalJson(value))),
      name: typeof json['name'] === 'string' ? json['name'] : `Material ${material + 1}`,
      baseColorFactor: materialColor(factor) ? factor : [1, 1, 1, 1],
      supported: unsupported === null,
      reason: unsupported,
    };
  });
  targetCache.set(source, targets);
  return targets;
}

/** Validate against the immutable source before modifying a separate output JSON (never the source). */
export function applyImportedMaterialOverrides(
  source: GlbContainer,
  json: Record<string, unknown>,
  overrides: readonly ImportedMaterialOverride[],
): void {
  if (overrides.length === 0) return;
  const targets = importedMaterialTargets(source);
  const materials = json['materials'];
  const seen = new Set<number>();
  for (const edit of [...overrides].sort((a, b) => a.material - b.material)) {
    const target = targets[edit.material];
    if (
      seen.has(edit.material) ||
      edit.baseSha256 !== source.sha256 ||
      target === undefined ||
      !target.supported ||
      edit.materialSha256 !== target.materialSha256 ||
      !materialColor(edit.baseColorFactor) ||
      edit.baseColorFactor[3] !== target.baseColorFactor[3]
    ) {
      throw new EkzaError('invalid-input', 'Material override does not match its supported source material');
    }
    seen.add(edit.material);
    const material = Array.isArray(materials) ? (materials as unknown[])[edit.material] : undefined;
    if (!isRecord(material)) throw new EkzaError('invalid-input', 'Material no longer exists in this export');
    const pbr = isRecord(material['pbrMetallicRoughness']) ? material['pbrMetallicRoughness'] : {};
    (material as Record<string, unknown>)['pbrMetallicRoughness'] = {
      ...pbr,
      baseColorFactor: [...edit.baseColorFactor],
    };
  }
}

/** Preview loads the same patched glTF values the exporter writes. Geometry and the BIN remain unchanged. */
export async function materialOverrideContainer(
  source: GlbContainer,
  overrides: readonly ImportedMaterialOverride[],
  container: GlbContainer = source,
): Promise<GlbContainer> {
  const json = structuredClone(container.json) as unknown as Record<string, unknown>;
  applyImportedMaterialOverrides(source, json, overrides);
  return parseGlb(assembleGlb(JSON.stringify(json), container.bin === null ? null : [container.bin]));
}

/** Material read-back is independent of animation sampling and blocks a download on mismatch. */
export function assertMaterialOverridesReadBack(
  bytes: Uint8Array,
  overrides: readonly ImportedMaterialOverride[],
): void {
  if (overrides.length === 0) return;
  const json = parseGlbSync(bytes).json;
  const materials = json['materials'];
  for (const edit of overrides) {
    const material = Array.isArray(materials) ? (materials as unknown[])[edit.material] : undefined;
    const pbr = isRecord(material) ? material['pbrMetallicRoughness'] : undefined;
    if (!isRecord(pbr) || canonicalJson(pbr['baseColorFactor']) !== canonicalJson(edit.baseColorFactor)) {
      throw new EkzaError('invalid-input', 'Exported material colour failed read-back');
    }
  }
}
