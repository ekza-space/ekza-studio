// Animation layer names (ANIM-LAYERS-SPEC §1): the clip-name alphabet (≤ 64 characters of `[A-Za-z0-9 _.-]`),
// unique among a clip's layers ignoring case.
import type { ClipId, LayerId, LayerRecord, ReadView } from '@ekza-studio/doc';
import { CLIP_NAME_MAX, nameKey } from './names';

const LAYER_NAME = /^[A-Za-z0-9 _.-]+$/;

/** Why `name` cannot name a layer of `clip` (other than `except`), or null. */
export function layerNameProblem(view: ReadView, clip: ClipId, name: unknown, except?: LayerId): string | null {
  if (typeof name !== 'string') return 'A layer name must be a string';
  const trimmed = name.trim();
  if (trimmed === '') return 'A layer name must not be empty';
  if (name !== trimmed) return 'A layer name must not start or end with a space';
  if (name.length > CLIP_NAME_MAX) return `A layer name has at most ${CLIP_NAME_MAX} characters`;
  if (!LAYER_NAME.test(name)) return 'A layer name may use only letters, digits, spaces and . _ -';
  const key = nameKey(name);
  if (view.query.layersOfClip(clip).some((layer) => layer.id !== except && nameKey(layer.name) === key)) {
    return 'A layer with that name exists in this animation';
  }
  return null;
}

/**
 * The first free name `prefix` (when `bare`), then `prefix 1`, `prefix 2`… — *Layer 1*, *Fixes*, *Fixes 2*.
 */
export function uniqueLayerName(layers: readonly LayerRecord[], prefix: string, bare = false): string {
  const used = new Set(layers.map((layer) => nameKey(layer.name)));
  if (bare && !used.has(nameKey(prefix))) return prefix;
  for (let n = bare ? 2 : 1; ; n++) {
    const candidate = `${prefix} ${n}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}
