import { type AvatarPalette, facelessFantasy, type StylePack } from './catalog';

export type { AvatarPalette } from './catalog';

export type AvatarRecipe = {
  readonly schemaVersion: 1;
  readonly styleId: string;
  readonly styleVersion: number;
  readonly rigId: string;
  readonly rigVersion: number;
  readonly bodyId: string;
  readonly archetypeId: string;
  readonly parts: Readonly<Record<string, string | null>>;
  readonly paletteId: string;
};

const packs = [facelessFantasy];
export const ARCHETYPES = facelessFantasy.archetypes;
export const SLOTS = facelessFantasy.slots;

function packFor(recipe: AvatarRecipe) {
  const pack = packs.find(
    ({ styleId, styleVersion }) => styleId === recipe.styleId && styleVersion === recipe.styleVersion,
  );
  if (!pack) throw new Error('This style pack version is unavailable.');
  return pack;
}

function archetypeFor(recipe: AvatarRecipe) {
  const archetype = packFor(recipe).archetypes.find(({ id }) => id === recipe.archetypeId);
  if (!archetype) throw new Error('Unknown archetype.');
  return archetype;
}

export function createRecipe(archetypeId = 'warrior'): AvatarRecipe {
  const { styleId, styleVersion, rigId, rigVersion, bodyId, archetypes, slots } = facelessFantasy;
  const archetype = archetypes.find(({ id }) => id === archetypeId);
  if (!archetype) throw new Error('Unknown archetype.');
  const [paletteId] = archetype.palettes;
  if (!paletteId) throw new Error('The archetype has no palettes.');
  const parts = Object.fromEntries(
    slots.map(({ id }) => {
      const part = archetype.parts[id]?.[0];
      if (part === undefined) throw new Error(`Missing default part for ${id}.`);
      return [id, part] as const;
    }),
  );
  return {
    schemaVersion: 1,
    styleId,
    styleVersion,
    rigId,
    rigVersion,
    bodyId,
    archetypeId,
    parts,
    paletteId,
  };
}

function compatible(pack: StylePack, parts: AvatarRecipe['parts']): boolean {
  const selected = new Set(Object.values(parts));
  return pack.rules.every((rule) => {
    if (rule.kind === 'excludes') return !rule.partIds.every((id) => selected.has(id));
    const required = parts[rule.slotId];
    return !selected.has(rule.partId) || required === undefined || rule.oneOf.includes(required);
  });
}

type PartOption = { readonly id: string | null; readonly label: string };

export function getParts(recipe: AvatarRecipe, slotId: string): readonly PartOption[] {
  const pack = packFor(recipe);
  const slot = pack.slots.find(({ id }) => id === slotId);
  if (!slot) return [];
  const choices = archetypeFor(recipe).parts[slotId] ?? [];
  return choices.flatMap<PartOption>((id) => {
    if (!compatible(pack, { ...recipe.parts, [slotId]: id })) return [];
    if (id === null) return [{ id, label: 'None' }];
    const part = slot.parts.find((part) => part.id === id);
    return part ? [{ id: part.id, label: part.label }] : [];
  });
}

export function getPalettes(recipe: AvatarRecipe): readonly AvatarPalette[] {
  const allowed = archetypeFor(recipe).palettes;
  return packFor(recipe).palettes.filter(({ id }) => allowed.includes(id));
}

export function getPalette(recipe: AvatarRecipe): AvatarPalette {
  const palette = getPalettes(recipe).find(({ id }) => id === recipe.paletteId);
  if (!palette) throw new Error('Unknown palette for this archetype.');
  return palette;
}

export function selectPart(recipe: AvatarRecipe, slotId: string, id: string | null): AvatarRecipe {
  if (!getParts(recipe, slotId).some((part) => part.id === id)) throw new Error('This part is unavailable.');
  return { ...recipe, parts: { ...recipe.parts, [slotId]: id } };
}

export function selectPalette(recipe: AvatarRecipe, paletteId: string): AvatarRecipe {
  const next = { ...recipe, paletteId };
  getPalette(next);
  return next;
}

const recipeFields = [
  'schemaVersion',
  'styleId',
  'styleVersion',
  'rigId',
  'rigVersion',
  'bodyId',
  'archetypeId',
  'parts',
  'paletteId',
];
const encoder = new TextEncoder();
const maxRecipeBytes = 16_384;

function hasExactlyKeys(value: object, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRecipe(text: string): AvatarRecipe {
  if (text.length > maxRecipeBytes || encoder.encode(text).byteLength > maxRecipeBytes)
    throw new Error('The recipe is too large.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The recipe is not valid JSON.');
  }
  if (!isRecord(data) || !hasExactlyKeys(data, recipeFields) || !isRecord(data.parts))
    throw new Error('Invalid recipe structure.');
  if (data.schemaVersion !== 1) throw new Error('This recipe version is unsupported.');
  const recipe = data as AvatarRecipe;
  const pack = packFor(recipe);
  if (recipe.bodyId !== pack.bodyId || recipe.rigId !== pack.rigId || recipe.rigVersion !== pack.rigVersion) {
    throw new Error('This body or rig version is unavailable.');
  }
  const archetype = archetypeFor(recipe);
  if (
    !hasExactlyKeys(
      recipe.parts,
      pack.slots.map(({ id }) => id),
    )
  )
    throw new Error('The recipe has missing or unknown slots.');
  for (const slot of pack.slots) {
    const id = recipe.parts[slot.id];
    const known = id === null ? slot.optional : slot.parts.some((part) => part.id === id);
    if (id === undefined || !known || !archetype.parts[slot.id]?.includes(id))
      throw new Error(`Invalid part in ${slot.label.toLowerCase()}.`);
  }
  getPalette(recipe);
  if (!compatible(pack, recipe.parts)) throw new Error('These parts cannot be combined.');
  return recipe;
}

async function rankCandidates(
  values: readonly (string | null)[],
  prefix: readonly (string | number | null)[],
): Promise<readonly (string | null)[]> {
  const scored = await Promise.all(
    values.map(async (id) => {
      const input = encoder.encode(JSON.stringify([...prefix, id]));
      const digest = await crypto.subtle.digest('SHA-256', input);
      const score = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      return { id, score: score + JSON.stringify(id) };
    }),
  );
  scored.sort((a, b) => (a.score < b.score ? -1 : a.score > b.score ? 1 : 0));
  return scored.map(({ id }) => id);
}

export async function randomize(
  recipe: AvatarRecipe,
  seed: number,
  lockedSlots: readonly string[] = [],
): Promise<AvatarRecipe> {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid generation seed.');
  if (!globalThis.crypto?.subtle) throw new Error('Random generation requires a secure browser context.');
  const pack = packFor(recipe);
  const archetype = archetypeFor(recipe);
  const prefix = ['mix-v1', seed, recipe.styleId, recipe.styleVersion, recipe.archetypeId, recipe.bodyId];
  const [slotChoices, palettes] = await Promise.all([
    Promise.all(
      pack.slots.map(({ id }) => {
        const current = recipe.parts[id];
        return lockedSlots.includes(id) && current !== undefined
          ? Promise.resolve([current])
          : rankCandidates(archetype.parts[id] ?? [], [...prefix, 'part', id]);
      }),
    ),
    rankCandidates(archetype.palettes, [...prefix, 'palette', null]),
  ]);
  const selectedPalette = palettes[0];
  if (!selectedPalette) throw new Error('The archetype has no palettes.');
  const paletteId: string = selectedPalette;
  let attempts = 0;

  function find(index: number, parts: AvatarRecipe['parts']): AvatarRecipe | undefined {
    const slot = pack.slots[index];
    if (!slot) return { ...recipe, paletteId, parts };
    for (const value of slotChoices[index] ?? []) {
      attempts += 1;
      if (attempts > 10_000) throw new Error('Generation reached the search limit.');
      const next = { ...parts, [slot.id]: value };
      if (!compatible(pack, next)) continue;
      const result = find(index + 1, next);
      if (result) return result;
    }
    return undefined;
  }

  const result = find(0, {});
  if (!result) throw new Error('No compatible variation fits the locked slots.');
  return result;
}
