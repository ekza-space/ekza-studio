import { describe, expect, it } from 'vitest';
import { createStyleRegistry } from '../src/styleRegistry';
import { installedStyles } from '../src/styles';
import { prismStyle } from './styleFixture';

describe('style registry', () => {
  it('registers a style with a different archetype, slot, palette and rig through its definition', async () => {
    const registry = createStyleRegistry([...installedStyles, prismStyle]);
    const recipe = registry.createRecipe(undefined, 'test-prism');
    expect(registry.listStyles().map(({ styleId }) => styleId)).toEqual(['faceless-fantasy', 'test-prism']);
    expect(registry.getArchetypes(recipe).map(({ id }) => id)).toEqual(['sentinel']);
    expect(registry.getSlots(recipe).map(({ id }) => id)).toEqual(['crest']);
    expect(registry.getRig(recipe)).toBe(prismStyle.rig);
    expect(registry.getParts(recipe, 'headwear')).toEqual([]);
    const selected = registry.selectPart(recipe, 'crest', 'spire');
    const generated = await registry.randomize(selected, 837, ['crest']);
    expect(generated.parts).toEqual({ crest: 'spire' });
    expect(registry.parseRecipe(JSON.stringify(generated))).toEqual(generated);
    const pieces = registry.buildAvatar(generated);
    try {
      expect(pieces.map(({ name, color }) => [name, color])).toEqual([
        ['Spire', registry.getPalette(generated).primary],
      ]);
    } finally {
      for (const { geometry } of pieces) geometry.dispose();
    }
  });

  it('opens the exact saved revision while offering the latest version to new users', () => {
    const updated = { ...prismStyle, catalog: { ...prismStyle.catalog, styleVersion: 2, label: 'Prism Revised' } };
    const registry = createStyleRegistry([updated, prismStyle]);
    expect(registry.listStyles().map(({ styleVersion }) => styleVersion)).toEqual([2]);
    const original = registry.createRecipe(undefined, 'test-prism', 1);
    expect(registry.getStyle(registry.parseRecipe(JSON.stringify(original))).label).toBe('Prism Test');
    expect(registry.createRecipe().styleVersion).toBe(2);
    expect(() => createStyleRegistry([updated]).parseRecipe(JSON.stringify(original))).toThrow(
      'version is unavailable',
    );
  });

  it('rejects duplicate revisions, incompatible shared bind rigs and malformed presets', () => {
    expect(() => createStyleRegistry([prismStyle, prismStyle])).toThrow('Duplicate style revision');
    const [faceless] = installedStyles;
    const invalidRig = {
      ...prismStyle,
      catalog: { ...prismStyle.catalog, rigId: faceless.catalog.rigId, rigVersion: faceless.catalog.rigVersion },
    };
    expect(() => createStyleRegistry([faceless, invalidRig])).toThrow('Conflicting bind rigs');
    const invalidPreset = { ...prismStyle, catalog: { ...prismStyle.catalog, defaultArchetypeId: 'unknown' } };
    expect(() => createStyleRegistry([invalidPreset])).toThrow('unknown default archetype');
  });
});
