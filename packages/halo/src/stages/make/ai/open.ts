// *Create with AI* (the owner's AI pipeline, 2026-10-24; MODELING-PLAN §7.2 G-d; T8): the entry in Make's tray, in the
// empty Make stage and in *Make a character*'s starts on Home. It opens a lazy sheet: a prompt, a photo, the size
// presets. The entries show only where a generation gateway is configured and enabled (`./availability`, ST-T8-18);
// generation itself is G-d's (the Generate flow over G-b/G-c's `GenerationClient` and the `gen.*` operators), so the
// sheet says what it can and keeps *Create* off (ST-T8-13).
import type { ShellContext } from '../../../shell/context';

/** The sheet id (`registerHaloSheet`, `../../../shell/stageParts`). */
export const CREATE_AI_SHEET = 'createAi';

/** The entry flag: off hides *Create with AI* whatever the gateway says (`./availability`). */
export const CREATE_WITH_AI_ENTRY = true;

export function openCreateWithAi(ctx: Pick<ShellContext, 'store'>): void {
  ctx.store.set({ sheet: CREATE_AI_SHEET, sheetArgs: null, sheetNoun: null, halo: null, focus: null });
}
