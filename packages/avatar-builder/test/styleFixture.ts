import { BoxGeometry } from 'three';
import { facelessRig } from '../src/styles/faceless-fantasy/rig';
import type { StyleDefinition } from '../src/types';

export const prismStyle: StyleDefinition = {
  catalog: {
    schemaVersion: 1,
    styleId: 'test-prism',
    styleVersion: 1,
    label: 'Prism Test',
    description: 'A test pack with its own slots, colors and bind proportions.',
    defaultArchetypeId: 'sentinel',
    rigId: 'prism-humanoid',
    rigVersion: 1,
    bodyId: 'prism',
    slots: [
      {
        id: 'crest',
        label: 'Crest',
        parts: [
          { id: 'facet', label: 'Facet' },
          { id: 'spire', label: 'Spire' },
        ],
      },
    ],
    archetypes: [
      {
        id: 'sentinel',
        label: 'Sentinel',
        description: 'Simple geometric sentinel.',
        parts: { crest: ['facet', 'spire'] },
        palettes: ['jade', 'amber'],
      },
    ],
    palettes: [
      { id: 'jade', label: 'Jade', primary: '#568e7f', secondary: '#afb9ab', accent: '#ddc37c', dark: '#302d3d' },
      { id: 'amber', label: 'Amber', primary: '#b07b47', secondary: '#f3df9a', accent: '#839f93', dark: '#453239' },
    ],
    rules: [],
  },
  rig: facelessRig.map(({ name, parent, position }) => ({
    name,
    parent,
    position: [position[0], position[1] * 1.1, position[2]],
  })),
  buildGeometry: (recipe, palette) => [
    {
      name: recipe.parts.crest === 'facet' ? 'Facet' : 'Spire',
      geometry: new BoxGeometry(0.38, recipe.parts.crest === 'facet' ? 1.65 : 1.8, 0.32).translate(0, 0.85, 0),
      color: palette.primary,
      bone: 'hips',
    },
  ],
};
