// A Rig control's poll (STUDIO-TOUCH-SPEC §6.3: a disabled control stays visible and says why): the operator's own
// poll in the single pane, null when it may run, else its reason in plain words.
import type { EditorApp } from '@ekza-studio/editor-core';
import { en } from '../../i18n/en';
import { PANE } from '../../shell/stage';

export function reasonOf(app: EditorApp, op: string, args?: unknown): string | null {
  if (app.operators.get(op) === undefined) return en.sheet.soon;
  try {
    const poll = app.operators.poll(op, { panel: 'viewport', paneId: PANE }, args);
    return poll === true ? null : poll.reason;
  } catch {
    return null;
  }
}
