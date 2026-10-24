// The Make stage (STUDIO-TOUCH-SPEC §7.1, §11; T8): its tray, its canvas layer and its setup while the shell is
// mounted, through the shell's stage-parts seam (`../../shell/stageParts`, `StageModule`). A lazy chunk: never in
// `/app`'s initial scripts.
export { installMake as install } from './install';
export { MakeLayer as Layer } from './Layer';
export { MakeTray as Tray } from './Tray';
