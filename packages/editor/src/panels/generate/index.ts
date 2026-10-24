// The Generate panel (MODELING-PLAN §7.2 G-d; ADR 0017 §2; DECISIONS M7-GD-*): Studio Pro's door to AI generation —
// File › Generate with AI… shows it (`workspace.showPanel {panel: 'generate'}`), listed only in builds with a gateway
// (`EditorServices.generation`). Its body is a React.lazy chunk with the Generate flow: the first-visit route carries
// this definition only (SIZE-1, the `generate` boundary of `check:size`).
import type { Disposer } from '@ekza-studio/anim-core';
import type { PanelDef, PanelRegistry } from '../types';
import { GeneratePanelLazy } from './GeneratePanelLazy';

/** The panel kind (`workspace.showPanel {panel: 'generate'}`). */
export const GENERATE_PANEL_KIND = 'generate';

export const GENERATE_PANEL: PanelDef = {
  id: GENERATE_PANEL_KIND,
  kind: GENERATE_PANEL_KIND,
  title: 'Generate',
  component: GeneratePanelLazy,
  keyScope: GENERATE_PANEL_KIND,
};

export function registerGeneratePanel(registry: PanelRegistry): Disposer {
  return registry.register(GENERATE_PANEL);
}
