import type { BufferGeometry } from 'three';
import type { BoneName, RigJoint } from './rig';

export type AvatarPalette = {
  readonly id: string;
  readonly label: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly dark: string;
};

export type Part = { readonly id: string; readonly label: string };

export type Slot = Part & {
  readonly optional?: boolean;
  readonly parts: readonly Part[];
};

export type Archetype = Part & {
  readonly description: string;
  readonly sigil?: 'hood' | 'hat' | 'halo' | 'trail-hood';
  /** First entry in each slot and in palettes is the authored preset. */
  readonly parts: Readonly<Record<string, readonly (string | null)[]>>;
  readonly palettes: readonly string[];
};

export type Rule =
  | {
      readonly kind: 'requires';
      readonly partId: string;
      readonly slotId: string;
      readonly oneOf: readonly (string | null)[];
    }
  | { readonly kind: 'excludes'; readonly partIds: readonly [string, string] };

export type StylePack = {
  readonly schemaVersion: 1;
  readonly styleId: string;
  readonly styleVersion: number;
  readonly label: string;
  readonly description: string;
  readonly defaultArchetypeId: string;
  readonly rigId: string;
  readonly rigVersion: number;
  readonly bodyId: string;
  readonly slots: readonly Slot[];
  readonly archetypes: readonly Archetype[];
  readonly palettes: readonly AvatarPalette[];
  readonly rules: readonly Rule[];
};

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

export type AvatarPiece = {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: string;
  readonly bone: BoneName;
  readonly previewOnly?: boolean;
  readonly previewGlow?: number;
};

export type StyleDefinition = {
  readonly catalog: StylePack;
  readonly rig: readonly RigJoint[];
  /** Return owned geometry in world bind coordinates, in metres, Y-up and +Z-facing. */
  readonly buildGeometry: (recipe: AvatarRecipe, palette: AvatarPalette) => AvatarPiece[];
};
