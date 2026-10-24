// Where the Rig stage's cards dock (STUDIO-TOUCH-SPEC §4.1, §6.1: next to the work, never over the chrome; T9): above
// the Rig tray, whose height they read (it wraps on narrow containers), and on phones above the Path's tab bar too.
import type { SizeClass } from '../../shell/hooks';

/** The `bottom` of a card docked above the tray. */
export function aboveTray(trayHeight: number, size: SizeClass): string {
  // portrait and phones: the card spans the width, so it clears the corner clusters (↶, the Thumb key, the puck) too —
  // and on phones the Path's tab bar; on Wide the corners sit beside it
  const corners = size === 'compact' ? 200 : size === 'regular' ? 80 : 0;
  return `calc(var(--touch-inset-bottom) + ${trayHeight + 14 + corners}px)`;
}
