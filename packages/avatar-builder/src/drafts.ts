import { type AvatarRecipe, createRecipe, listStyles, parseRecipe } from './style';

const LEGACY_DRAFT_KEY = 'ekza-avatar-builder-draft-v1';
const ACTIVE_STYLE_KEY = `${LEGACY_DRAFT_KEY}:active-style`;

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type SavedDraft = {
  readonly recipe: AvatarRecipe;
  readonly state: 'ready' | 'saved';
  readonly unreadable: string | null;
};

function styleDraftKey(styleId: string): string {
  return `${LEGACY_DRAFT_KEY}:style:${styleId}`;
}

function readDraft(storage: DraftStorage, key: string, fallback: AvatarRecipe, styleId?: string): SavedDraft {
  const raw = storage.getItem(key);
  if (raw === null) return { recipe: fallback, state: 'ready', unreadable: null };
  try {
    const recipe = parseRecipe(raw);
    if (styleId !== undefined && recipe.styleId !== styleId) throw new Error('Draft style mismatch.');
    return { recipe, state: 'saved', unreadable: null };
  } catch {
    return { recipe: fallback, state: 'ready', unreadable: raw };
  }
}

export function loadStyleDraft(storage: DraftStorage, styleId: string): SavedDraft {
  return readDraft(storage, styleDraftKey(styleId), createRecipe(undefined, styleId), styleId);
}

export function restoreActiveDraft(storage: DraftStorage): SavedDraft {
  const styleId = storage.getItem(ACTIVE_STYLE_KEY);
  const legacy = readDraft(storage, LEGACY_DRAFT_KEY, createRecipe());
  if (styleId === null || !listStyles().some((style) => style.styleId === styleId)) return legacy;
  const scoped = loadStyleDraft(storage, styleId);
  if (scoped.state === 'saved' || scoped.unreadable !== null) return scoped;
  return legacy.state === 'saved' && legacy.recipe.styleId === styleId ? legacy : scoped;
}

export function preserveLegacyDraft(storage: DraftStorage, recipe: AvatarRecipe, unreadable: string | null): void {
  const key = styleDraftKey(recipe.styleId);
  if (storage.getItem(key) === null) storage.setItem(key, unreadable ?? JSON.stringify(recipe));
}

export function selectActiveStyle(storage: DraftStorage, styleId: string): void {
  storage.setItem(ACTIVE_STYLE_KEY, styleId);
}

export function saveDraft(storage: DraftStorage, recipe: AvatarRecipe): void {
  storage.setItem(styleDraftKey(recipe.styleId), JSON.stringify(recipe));
  selectActiveStyle(storage, recipe.styleId);
}
