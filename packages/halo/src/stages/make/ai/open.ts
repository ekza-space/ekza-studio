// *Create with AI* (the owner's AI pipeline, 2026-10-24; MODELING-PLAN §7.2 G-d; T8): the entry in Make's tray, in the
// empty Make stage and in *Make a character*'s starts (and, through T11's patch, on Home). It opens a lazy sheet: a
// prompt, a photo, the size presets. Generation itself is G-d's (the Generate flow over G-b/G-c's `GenerationClient`
// and the `gen.*` operators); until a client is connected the sheet says so and *Create* stays off (ST-T8-13).
import type { EditorApp } from '@ekza-studio/editor-core';
import type { ShellContext } from '../../../shell/context';

/** The sheet id (`registerHaloSheet`, `../../../shell/stageParts`). */
export const CREATE_AI_SHEET = 'createAi';

/**
 * The entry flag: the tray chip, the empty-stage chip and the starts card show *Create with AI* (the owner asked to
 * see the pipeline's door on the iPad now). The sheet itself says when generation is not connected.
 */
export const CREATE_WITH_AI_ENTRY = true;

/**
 * The generation client the host provides (ADR 0017: `EditorServices.generation?: GenerationClient | null`, null hides
 * the feature), read without a type import until G-b/G-c publish the contract; null: not connected on this build.
 */
export function generationClient(app: EditorApp): unknown {
  const services = app.services as unknown as { readonly generation?: unknown };
  return services.generation ?? null;
}

export function openCreateWithAi(ctx: Pick<ShellContext, 'store'>): void {
  ctx.store.set({ sheet: CREATE_AI_SHEET, sheetArgs: null, sheetNoun: null, halo: null, focus: null });
}
