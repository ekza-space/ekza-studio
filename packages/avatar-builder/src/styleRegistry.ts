import type { AvatarPalette, AvatarRecipe, StyleDefinition, StylePack } from './types';
import { compatible, hexColor, recipeFromDefaults, validateStyle } from './validateStyle';

const styleKey = (id: string, version: number) => `${id}@${version}`;

export function createStyleRegistry(definitions: readonly StyleDefinition[]) {
  const byRevision = new Map<string, StyleDefinition>();
  const latest = new Map<string, StyleDefinition>();
  const rigs = new Map<string, string>();
  const [firstStyle] = definitions;
  if (!firstStyle) throw new Error('The avatar builder requires an installed style.');
  const firstStyleId = firstStyle.catalog.styleId;

  for (const definition of definitions) {
    validateStyle(definition);
    const { catalog, rig } = definition;
    const key = styleKey(catalog.styleId, catalog.styleVersion);
    if (byRevision.has(key)) throw new Error(`Duplicate style revision: ${key}.`);
    byRevision.set(key, definition);
    const current = latest.get(catalog.styleId);
    if (!current || current.catalog.styleVersion < catalog.styleVersion) {
      latest.set(catalog.styleId, definition);
    }
    const rigKey = styleKey(catalog.rigId, catalog.rigVersion);
    const rigData = JSON.stringify(rig.map(({ name, parent, position }) => [name, parent, position]));
    const existing = rigs.get(rigKey);
    if (existing !== undefined && existing !== rigData) throw new Error(`Conflicting bind rigs: ${rigKey}.`);
    rigs.set(rigKey, rigData);
  }

  function resolveStyle(id: string, version: number | undefined): StyleDefinition {
    const definition = version === undefined ? latest.get(id) : byRevision.get(styleKey(id, version));
    if (
      !definition ||
      definition.catalog.styleId !== id ||
      (version !== undefined && definition.catalog.styleVersion !== version)
    ) {
      throw new Error('This style pack version is unavailable.');
    }
    return definition;
  }

  function getStyle(recipe: AvatarRecipe): StylePack {
    if (!Number.isSafeInteger(recipe.styleVersion)) throw new Error('This style pack version is unavailable.');
    return resolveStyle(recipe.styleId, recipe.styleVersion).catalog;
  }

  function listStyles(): readonly StylePack[] {
    return Array.from(latest.values(), ({ catalog }) => catalog);
  }

  function getRig(recipe: AvatarRecipe) {
    return resolveStyle(recipe.styleId, recipe.styleVersion).rig;
  }

  function getArchetypes(recipe: AvatarRecipe) {
    return getStyle(recipe).archetypes;
  }

  function getSlots(recipe: AvatarRecipe) {
    return getStyle(recipe).slots;
  }

  function buildAvatar(recipe: AvatarRecipe) {
    validateRecipe(recipe);
    const exact = resolveStyle(recipe.styleId, recipe.styleVersion);
    const pieces = exact.buildGeometry(recipe, getPalette(recipe));
    const joints = new Set(exact.rig.map(({ name }) => name));
    if (
      !pieces.some(({ previewOnly }) => !previewOnly) ||
      pieces.some(({ bone, color }) => !joints.has(bone) || !hexColor.test(color))
    ) {
      for (const { geometry } of pieces) geometry.dispose();
      throw new Error(`Style ${exact.catalog.label} produced invalid avatar geometry.`);
    }
    return pieces;
  }

  function archetypeFor(recipe: AvatarRecipe) {
    const archetype = getStyle(recipe).archetypes.find(({ id }) => id === recipe.archetypeId);
    if (!archetype) throw new Error('Unknown archetype.');
    return archetype;
  }

  function createRecipe(archetypeId?: string, styleId = firstStyleId, styleVersion?: number): AvatarRecipe {
    const pack = resolveStyle(styleId, styleVersion).catalog;
    const archetype = pack.archetypes.find(({ id }) => id === (archetypeId ?? pack.defaultArchetypeId));
    if (!archetype) throw new Error('Unknown archetype.');
    return recipeFromDefaults(pack, archetype);
  }

  type PartOption = { readonly id: string | null; readonly label: string };

  function getParts(recipe: AvatarRecipe, slotId: string): readonly PartOption[] {
    const pack = getStyle(recipe);
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

  function getPalettes(recipe: AvatarRecipe): readonly AvatarPalette[] {
    const allowed = archetypeFor(recipe).palettes;
    return getStyle(recipe).palettes.filter(({ id }) => allowed.includes(id));
  }

  function getPalette(recipe: AvatarRecipe): AvatarPalette {
    const palette = getPalettes(recipe).find(({ id }) => id === recipe.paletteId);
    if (!palette) throw new Error('Unknown palette for this archetype.');
    return palette;
  }

  function selectPart(recipe: AvatarRecipe, slotId: string, id: string | null): AvatarRecipe {
    if (!getParts(recipe, slotId).some((part) => part.id === id)) throw new Error('This part is unavailable.');
    return { ...recipe, parts: { ...recipe.parts, [slotId]: id } };
  }

  function selectPalette(recipe: AvatarRecipe, paletteId: string): AvatarRecipe {
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

  function parseRecipe(text: string): AvatarRecipe {
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
    return validateRecipe(data as AvatarRecipe);
  }

  function validateRecipe(recipe: AvatarRecipe): AvatarRecipe {
    const pack = getStyle(recipe);
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

  async function randomize(
    recipe: AvatarRecipe,
    seed: number,
    lockedSlots: readonly string[] = [],
  ): Promise<AvatarRecipe> {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid generation seed.');
    if (!globalThis.crypto?.subtle) throw new Error('Random generation requires a secure browser context.');
    const pack = getStyle(recipe);
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

  return {
    buildAvatar,
    createRecipe,
    getArchetypes,
    getPalette,
    getPalettes,
    getParts,
    getRig,
    getSlots,
    getStyle,
    listStyles,
    parseRecipe,
    randomize,
    selectPalette,
    selectPart,
  };
}
