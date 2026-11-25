export type AvatarPalette = {
  readonly id: string;
  readonly label: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly dark: string;
};

type Part = { readonly id: string; readonly label: string };
type Slot = Part & {
  readonly optional?: boolean;
  readonly parts: readonly Part[];
};
type Archetype = Part & {
  readonly description: string;
  readonly parts: Readonly<Record<string, readonly (string | null)[]>>;
  readonly palettes: readonly string[];
};
type Rule =
  | {
      readonly kind: 'requires';
      readonly partId: string;
      readonly slotId: string;
      readonly oneOf: readonly (string | null)[];
    }
  | { readonly kind: 'excludes'; readonly partIds: readonly [string, string] };

export type StylePack = {
  readonly styleId: string;
  readonly styleVersion: number;
  readonly rigId: string;
  readonly rigVersion: number;
  readonly bodyId: string;
  readonly slots: readonly Slot[];
  readonly archetypes: readonly Archetype[];
  readonly palettes: readonly AvatarPalette[];
  readonly rules: readonly Rule[];
};

export const facelessFantasy: StylePack = {
  styleId: 'faceless-fantasy',
  styleVersion: 1,
  rigId: 'faceless-humanoid',
  rigVersion: 1,
  bodyId: 'base',
  slots: [
    {
      id: 'headwear',
      label: 'Headwear',
      parts: [
        { id: 'angular-hood', label: 'Angular hood' },
        { id: 'wide-brim-hat', label: 'Wide-brim hat' },
        { id: 'soft-hood', label: 'Soft hood' },
        { id: 'olive-hood', label: 'Trail hood' },
        { id: 'scout-hood', label: 'Scout hood' },
      ],
    },
    {
      id: 'torso',
      label: 'Tunic',
      parts: [
        { id: 'layered-combat-tunic', label: 'Combat tunic' },
        { id: 'layered-robe', label: 'Layered robe' },
        { id: 'ceremonial-tunic', label: 'Ceremonial tunic' },
        { id: 'wide-hem-tunic', label: 'Wide-hem tunic' },
        { id: 'short-adventure-tunic', label: 'Trail tunic' },
      ],
    },
    {
      id: 'outerwear',
      label: 'Cape',
      parts: [
        { id: 'asymmetric-long-cape', label: 'Long cape' },
        { id: 'split-cape', label: 'Split cape' },
        { id: 'triangular-mantle', label: 'Triangular mantle' },
        { id: 'faceted-mantle', label: 'Faceted mantle' },
        { id: 'flared-white-mantle', label: 'Flared mantle' },
        { id: 'short-poncho', label: 'Short poncho' },
      ],
    },
    {
      id: 'head-accessory',
      label: 'Head accessory',
      optional: true,
      parts: [{ id: 'floating-halo', label: 'Golden halo' }],
    },
    { id: 'back-accessory', label: 'Back accessory', optional: true, parts: [{ id: 'quiver', label: 'Quiver' }] },
  ],
  archetypes: [
    {
      id: 'warrior',
      label: 'Warrior',
      description: 'Angular hood and a sweeping cape.',
      parts: {
        headwear: ['angular-hood'],
        torso: ['layered-combat-tunic'],
        outerwear: ['asymmetric-long-cape', 'split-cape'],
        'head-accessory': [null],
        'back-accessory': [null],
      },
      palettes: ['warrior-red', 'warrior-rust'],
    },
    {
      id: 'mage',
      label: 'Mage',
      description: 'Wide brim and a tapered mantle.',
      parts: {
        headwear: ['wide-brim-hat'],
        torso: ['layered-robe'],
        outerwear: ['triangular-mantle', 'faceted-mantle'],
        'head-accessory': [null],
        'back-accessory': [null],
      },
      palettes: ['mage-violet', 'mage-indigo'],
    },
    {
      id: 'healer',
      label: 'Healer',
      description: 'A flared mantle and a floating halo.',
      parts: {
        headwear: ['soft-hood'],
        torso: ['ceremonial-tunic', 'wide-hem-tunic'],
        outerwear: ['flared-white-mantle'],
        'head-accessory': ['floating-halo', null],
        'back-accessory': [null],
      },
      palettes: ['healer-ivory', 'healer-rose'],
    },
    {
      id: 'ranger',
      label: 'Ranger',
      description: 'A short poncho and a quiver.',
      parts: {
        headwear: ['olive-hood', 'scout-hood'],
        torso: ['short-adventure-tunic'],
        outerwear: ['short-poncho'],
        'head-accessory': [null],
        'back-accessory': ['quiver', null],
      },
      palettes: ['ranger-olive', 'ranger-pine'],
    },
  ],
  palettes: [
    {
      id: 'warrior-red',
      label: 'Crimson',
      primary: '#a94149',
      secondary: '#e4d9db',
      accent: '#c89569',
      dark: '#302a31',
    },
    {
      id: 'warrior-rust',
      label: 'Ember',
      primary: '#ae563f',
      secondary: '#dbcbba',
      accent: '#dfad75',
      dark: '#3a2b30',
    },
    {
      id: 'mage-violet',
      label: 'Amethyst',
      primary: '#64558a',
      secondary: '#52416e',
      accent: '#d6a569',
      dark: '#2c2639',
    },
    {
      id: 'mage-indigo',
      label: 'Midnight',
      primary: '#435a89',
      secondary: '#3d476a',
      accent: '#acc7cd',
      dark: '#272a40',
    },
    {
      id: 'healer-ivory',
      label: 'Ivory',
      primary: '#e8e0e4',
      secondary: '#e0d1ca',
      accent: '#eab16b',
      dark: '#3b303d',
    },
    { id: 'healer-rose', label: 'Dawn', primary: '#e6cad3', secondary: '#f0dadd', accent: '#e1a191', dark: '#473342' },
    {
      id: 'ranger-olive',
      label: 'Olive',
      primary: '#74815a',
      secondary: '#ded6c4',
      accent: '#c9ae73',
      dark: '#38342f',
    },
    { id: 'ranger-pine', label: 'Pine', primary: '#486862', secondary: '#cbd2c5', accent: '#d1aa77', dark: '#293536' },
  ],
  rules: [
    { kind: 'requires', partId: 'quiver', slotId: 'outerwear', oneOf: ['short-poncho'] },
    { kind: 'excludes', partIds: ['floating-halo', 'wide-brim-hat'] },
  ],
};
