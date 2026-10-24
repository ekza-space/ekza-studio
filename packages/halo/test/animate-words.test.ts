// The Animate stage's words (STUDIO-TOUCH-SPEC §1.3, ST-32; T7): what the stage promises by name. The vocabulary lint
// over `i18n/animate.ts` and `i18n/channels.ts` (one word, one kind of thing; no DCC jargon at L0 or L1) is
// `rules.test.ts`'s, with every other catalogue, since T12 (P-T7-3).
import { describe, expect, it } from 'vitest';
import { animateWords } from '../src/i18n/animate';
import { CHANNEL_LABELS } from '../src/i18n/channels';

describe('the Animate stage’s words (§1.3)', () => {
  it('the Library’s kind that walks and runs is not called “Moves” (Move is translation)', () => {
    expect(animateWords.library.categories['move']).not.toMatch(/\bmoves?\b/i);
  });

  it('plain channel labels are names only; the Pro names are Pro’s Channels (§10.1)', () => {
    expect(CHANNEL_LABELS.rx).toEqual({ plain: 'Bend', pro: 'Rotate X', unit: '°' });
    expect(CHANNEL_LABELS.ry.plain).toBe('Twist');
    expect(CHANNEL_LABELS.rz).toEqual({ plain: 'Side', pro: 'Rotate Z', unit: '°' });
    expect(CHANNEL_LABELS.ty).toEqual({ plain: 'Move Y', pro: 'Translate Y', unit: 'm' });
  });
});
