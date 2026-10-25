// The Rig stage (STUDIO-TOUCH-SPEC §7.1, §12; T9): its tray, its canvas layer and its setup while the shell is
// mounted, through the shell's stage-parts seam (`../../shell/stageParts`, `StageModule`). A lazy chunk: never in
// `/app`'s initial scripts.
export { installRig as install } from './start';
export { RigLayer as Layer } from './Layer';
export { Tray } from './Tray';
