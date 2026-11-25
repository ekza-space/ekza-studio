import type { StyleDefinition } from '../types';
import { facelessFantasy } from './faceless-fantasy/catalog';
import { buildFacelessAvatar } from './faceless-fantasy/geometry';
import { facelessRig } from './faceless-fantasy/rig';

/** Keep released revisions in this list so their saved recipes can still be opened. */
export const installedStyles = [
  { catalog: facelessFantasy, rig: facelessRig, buildGeometry: buildFacelessAvatar },
] as const satisfies readonly StyleDefinition[];
