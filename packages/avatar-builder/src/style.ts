import { createStyleRegistry } from './styleRegistry';
import { installedStyles } from './styles';

export type { AvatarPalette, AvatarRecipe, StylePack } from './types';

export const avatarStyles = createStyleRegistry(installedStyles);

export const {
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
} = avatarStyles;
