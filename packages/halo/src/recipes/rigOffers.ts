// The Rig stage's recipes in search (STUDIO-TOUCH-SPEC §8, §9.11; T9, P-T11-1): *Rig it for me* and *Fix where it bends
// badly*. Both are hands-on flows over the free canvas, not a fixed plan of runs: the offer opens them (the Rig-it card;
// the Test pose with the bend test) through the Rig stage of the mounted shell, which provides the openers. Light on
// purpose: search's chunk imports it, the recipes' code loads with the Rig stage.
import { rigWords } from '../i18n/rig';
import { rigOpenersOf } from '../stages/rig/openers';
import type { SearchableRecipe } from './recipe';

const offer =
  (id: 'rigIt' | 'fixBend', title: string, detail: string, match: (query: string) => boolean): SearchableRecipe =>
  (query) =>
    match(query)
      ? {
          id,
          title,
          detail,
          run: async (host) => {
            const open = rigOpenersOf(host.app);
            if (open === undefined) return { status: 'stopped', reason: rigWords.recipes.noStage, steps: [] };
            await (id === 'rigIt' ? open.rigIt() : open.fixBend());
            return { status: 'done', steps: [], results: [] };
          },
        }
      : null;

export const rigItOffer = offer(
  'rigIt',
  rigWords.recipes.rigIt,
  rigWords.recipes.rigItDetail,
  (q) => /\b(rig|auto-?rig|skeleton|skin it)\b/.test(q) && !/\bbend|weights?\b/.test(q),
);

export const fixBendOffer = offer('fixBend', rigWords.recipes.fixBend, rigWords.recipes.fixBendDetail, (q) =>
  /\b(bends?|bending|pinch(es)?|elbow|knee|weights?)\b/.test(q),
);
