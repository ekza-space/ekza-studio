import type { Metadata } from 'next';
import type { JSX } from 'react';
import { EditorEntryIsland } from './EditorEntryIsland';

export const metadata: Metadata = {
  // STUDIO-TOUCH-SPEC §1.1, ST-30 (T12, P-T3-3): the Pro layout of Ekza Studio, named as its menu bar names it.
  title: { absolute: 'Ekza Studio Pro' },
};

/** `/editor` (Studio Pro): its entry registers the host and Studio's shell with the `(studio)` layout (§4.4). */
export default function EditorPage(): JSX.Element {
  return <EditorEntryIsland />;
}
