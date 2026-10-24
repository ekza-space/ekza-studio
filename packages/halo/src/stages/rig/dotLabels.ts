// The names of the Quick Rig dots as the Rig stage says them (STUDIO-TOUCH-SPEC §6.2 *Rig dot*; T9). The same words as
// Pro's marker list (`QUICK_RIG_LABELS`, a test keeps them equal), kept here because the noun of a selected dot is
// resolved by the eager Halo (`verbs/nouns.ts`): a value import of editor-core's table would pull the Quick Rig
// operators, the skeleton builders and io's skeleton readers into `/app`'s initial scripts (+43 kB gzip).
import type { QuickRigState } from '@ekza-studio/editor-core';

type RigDot = NonNullable<QuickRigState['selected']>;

export const RIG_DOT_LABELS: Readonly<Record<RigDot, string>> = {
  headTop: 'Head top',
  chin: 'Chin / neck',
  pelvis: 'Pelvis',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  knee: 'Knee',
  ankle: 'Ankle',
  toe: 'Toe',
};
