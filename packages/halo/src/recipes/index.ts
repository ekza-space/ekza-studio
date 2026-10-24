// The recipes of the release that search offers (STUDIO-TOUCH-SPEC §8, §9.11; T11): *Wave* and *Loop it* by phrase,
// *Add animations* and *Fix for OMOBA* by name. T9 adds *Rig it* and *Fix where it bends* (`./rigOffers`).
import { addAnimationsRecipe } from './addAnimations';
import { fixForOmobaRecipe } from './fixForOmoba';
import { loopItRecipe } from './loopIt';
import { type SearchableRecipe, searchable } from './recipe';
import { fixBendOffer, rigItOffer } from './rigOffers';
import { waveRecipe } from './wave';

export const SEARCH_RECIPES: readonly SearchableRecipe[] = [
  searchable(waveRecipe),
  searchable(loopItRecipe),
  searchable(addAnimationsRecipe),
  searchable(fixForOmobaRecipe),
  // T9 (P-T11-1): the Rig stage's hands-on recipes open their card or test
  rigItOffer,
  fixBendOffer,
];

export { matchRecipes, type Recipe, type RecipeOffer, runRecipe, type SearchableRecipe } from './recipe';
