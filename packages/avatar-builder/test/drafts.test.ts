import { describe, expect, it } from 'vitest';
import { preserveLegacyDraft, restoreActiveDraft, saveDraft } from '../src/drafts';
import { createRecipe, selectPart } from '../src/style';

const legacyKey = 'ekza-avatar-builder-draft-v1';
const scopedKey = `${legacyKey}:style:faceless-fantasy`;

function deviceStorage(entries: readonly (readonly [string, string])[]) {
  const values = new Map(entries);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('style drafts', () => {
  it('retains the legacy recipe on migration and gives later edits a style-scoped key', () => {
    const original = createRecipe('warrior');
    const storage = deviceStorage([[legacyKey, JSON.stringify(original)]]);
    const { recipe, unreadable } = restoreActiveDraft(storage);
    expect(recipe).toEqual(original);
    preserveLegacyDraft(storage, recipe, unreadable);
    const edited = selectPart(recipe, 'outerwear', 'split-cape');
    saveDraft(storage, edited);
    expect(restoreActiveDraft(storage).recipe).toEqual(edited);
    expect(storage.getItem(legacyKey)).toBe(JSON.stringify(original));
  });

  it('makes an unreadable active revision downloadable and opens the latest default', () => {
    const legacy = createRecipe('healer');
    const raw = '{"styleVersion":9}';
    const storage = deviceStorage([
      [legacyKey, JSON.stringify(legacy)],
      [`${legacyKey}:active-style`, 'faceless-fantasy'],
      [scopedKey, raw],
    ]);
    expect(restoreActiveDraft(storage)).toEqual({ recipe: createRecipe(), state: 'ready', unreadable: raw });
    preserveLegacyDraft(storage, legacy, raw);
    expect(storage.getItem(scopedKey)).toBe(raw);
  });
});
