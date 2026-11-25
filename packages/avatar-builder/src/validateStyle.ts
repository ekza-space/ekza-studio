import { type BoneName, VRM_BONES } from './rig';
import type { Archetype, AvatarRecipe, StyleDefinition, StylePack } from './types';

const identifier = /^[a-z][a-z0-9-]*$/;
export const hexColor = /^#[0-9a-f]{6}$/i;
const expectedParents = new Map<BoneName, BoneName | null>(VRM_BONES.map(({ name, parent }) => [name, parent]));

function fail(pack: StylePack, message: string): never {
  throw new Error(`Style ${pack.styleId}@${pack.styleVersion}: ${message}`);
}

export function compatible(pack: StylePack, parts: AvatarRecipe['parts']): boolean {
  const selected = new Set(Object.values(parts));
  return pack.rules.every((rule) => {
    if (rule.kind === 'excludes') return !rule.partIds.every((id) => selected.has(id));
    const required = Object.hasOwn(parts, rule.slotId) ? parts[rule.slotId] : undefined;
    return !selected.has(rule.partId) || required === undefined || rule.oneOf.includes(required);
  });
}

export function recipeFromDefaults(pack: StylePack, archetype: Archetype): AvatarRecipe {
  const [paletteId] = archetype.palettes;
  if (!paletteId) fail(pack, `archetype ${archetype.id} has no palette.`);
  const parts = Object.fromEntries(
    pack.slots.map(({ id }) => {
      const part = archetype.parts[id]?.[0];
      if (part === undefined) fail(pack, `archetype ${archetype.id} has no default for ${id}.`);
      return [id, part] as const;
    }),
  );
  return {
    schemaVersion: 1,
    styleId: pack.styleId,
    styleVersion: pack.styleVersion,
    rigId: pack.rigId,
    rigVersion: pack.rigVersion,
    bodyId: pack.bodyId,
    archetypeId: archetype.id,
    parts,
    paletteId,
  };
}

function checkIds(pack: StylePack, name: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length || ids.some((id) => !identifier.test(id))) {
    fail(pack, `invalid or duplicate ${name} ID.`);
  }
}

export function validateStyle({ catalog: pack, rig }: StyleDefinition): void {
  if (pack.schemaVersion !== 1) fail(pack, 'unsupported catalog schema.');
  for (const value of [pack.styleId, pack.rigId, pack.bodyId]) {
    if (!identifier.test(value)) fail(pack, `invalid catalog ID ${value}.`);
  }
  for (const version of [pack.styleVersion, pack.rigVersion]) {
    if (!Number.isSafeInteger(version) || version < 1) fail(pack, 'revisions must be positive integers.');
  }
  checkIds(
    pack,
    'slot',
    pack.slots.map(({ id }) => id),
  );
  checkIds(
    pack,
    'part',
    pack.slots.flatMap(({ parts }) => parts.map(({ id }) => id)),
  );
  checkIds(
    pack,
    'palette',
    pack.palettes.map(({ id }) => id),
  );
  checkIds(
    pack,
    'archetype',
    pack.archetypes.map(({ id }) => id),
  );
  if (!pack.archetypes.some(({ id }) => id === pack.defaultArchetypeId)) fail(pack, 'unknown default archetype.');
  for (const { id, primary, secondary, accent, dark } of pack.palettes) {
    if (![primary, secondary, accent, dark].every((color) => hexColor.test(color))) {
      fail(pack, `invalid color in palette ${id}.`);
    }
  }
  const partsById = new Map(pack.slots.flatMap((slot) => slot.parts.map(({ id }) => [id, slot.id] as const)));
  for (const rule of pack.rules) {
    if (rule.kind === 'excludes') {
      const [first, second] = rule.partIds;
      if (first === second || !partsById.has(first) || !partsById.has(second)) fail(pack, 'invalid part conflict.');
      continue;
    }
    const slot = pack.slots.find(({ id }) => id === rule.slotId);
    if (
      !slot ||
      !partsById.has(rule.partId) ||
      rule.oneOf.length === 0 ||
      rule.oneOf.some((id) => (id === null ? !slot.optional : partsById.get(id) !== slot.id))
    ) {
      fail(pack, `invalid requirement for ${rule.partId}.`);
    }
  }
  for (const archetype of pack.archetypes) {
    if (Object.keys(archetype.parts).length !== pack.slots.length) fail(pack, `incorrect slots for ${archetype.id}.`);
    for (const slot of pack.slots) {
      const choices = Object.hasOwn(archetype.parts, slot.id) ? archetype.parts[slot.id] : undefined;
      if (
        !choices?.length ||
        new Set(choices).size !== choices.length ||
        choices.some((id) => (id === null ? !slot.optional : partsById.get(id) !== slot.id))
      ) {
        fail(pack, `invalid choices for ${archetype.id}/${slot.id}.`);
      }
    }
    if (
      new Set(archetype.palettes).size !== archetype.palettes.length ||
      archetype.palettes.some((id) => !pack.palettes.some((palette) => palette.id === id))
    ) {
      fail(pack, `invalid palettes for ${archetype.id}.`);
    }
    if (!compatible(pack, recipeFromDefaults(pack, archetype).parts)) {
      fail(pack, `incompatible preset for ${archetype.id}.`);
    }
  }
  const seen = new Set<BoneName>();
  for (const joint of rig) {
    const parentIsValid =
      expectedParents.get(joint.name) === joint.parent && (joint.parent === null || seen.has(joint.parent));
    if (seen.has(joint.name) || !parentIsValid || !joint.position.every(Number.isFinite)) {
      fail(pack, `invalid bind joint ${joint.name}.`);
    }
    seen.add(joint.name);
  }
  if (VRM_BONES.some(({ name }) => !seen.has(name))) fail(pack, 'rig is missing a required humanoid joint.');
}
