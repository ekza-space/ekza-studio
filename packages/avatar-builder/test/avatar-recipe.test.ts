import { describe, expect, it } from 'vitest';
import { createRecipe, getArchetypes, getPalettes, parseRecipe, randomize, selectPart } from '../src/style';

describe('avatar recipe', () => {
  it.each(getArchetypes(createRecipe()))('round-trips $id and its palette choices', ({ id }) => {
    const recipe = createRecipe(id);
    expect(parseRecipe(JSON.stringify(recipe))).toEqual(recipe);
    expect(getPalettes(recipe)).toHaveLength(2);
  });

  it('preserves an explicitly empty accessory', () => {
    const recipe = selectPart(createRecipe('healer'), 'head-accessory', null);
    expect(parseRecipe(JSON.stringify(recipe)).parts['head-accessory']).toBeNull();
  });

  it('rejects imported cross-archetype parts, versions, and external asset fields', () => {
    const recipe = createRecipe('ranger');
    expect(() => parseRecipe(JSON.stringify({ ...recipe, styleVersion: 2 }))).toThrow('version is unavailable');
    expect(() => parseRecipe(JSON.stringify({ ...recipe, url: 'data:some-asset' }))).toThrow('structure');
    expect(() =>
      parseRecipe(
        JSON.stringify({
          ...recipe,
          parts: { ...recipe.parts, outerwear: 'split-cape' },
        }),
      ),
    ).toThrow('Invalid part');
  });

  it('resolves the same seed to the same recipe and keeps locked slots', async () => {
    const recipe = selectPart(createRecipe('ranger'), 'headwear', 'scout-hood');
    const generated = await randomize(recipe, 2_984_103, ['headwear']);
    expect(await randomize(recipe, 2_984_103, ['headwear'])).toEqual(generated);
    expect(generated.parts.headwear).toBe('scout-hood');
    expect(parseRecipe(JSON.stringify(generated))).toEqual(generated);
  });
});
