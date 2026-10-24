// STUDIO-TOUCH-SPEC §9 J10 (T12, P-T11-3): a pane's view camera can be read and put back — Halo's resume keeps the
// canvas pane's view across a reload. Putting it back makes it the person's own view (it is not framed again when a
// character finishes loading); a malformed state, an unknown pane or a scene camera is refused.
import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_PANES } from '../src';
import { createRig, type Rig } from './helpers';

let rig: Rig | null = null;
afterEach(() => {
  rig?.dispose();
  rig = null;
});

const close = (a: readonly number[], b: readonly number[], eps = 1e-6): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= eps);

describe('ViewportManager.viewState / setViewState (J10, P-T11-3)', () => {
  it('reads the view camera and puts it back after the view moved', async () => {
    rig = await createRig();
    rig.layout('single');
    rig.frame();
    const id = LAYOUT_PANES.single[0] as string;
    const kept = rig.vm.viewState(id);
    expect(kept).not.toBeNull();
    if (kept === null) return;
    const before = rig.vm.camera(id);
    rig.vm.navigate(id, 'orbit', 120, 40);
    rig.vm.navigate(id, 'dolly', 0.5, 0);
    expect(close(rig.vm.camera(id).position, before.position)).toBe(false);
    expect(rig.vm.setViewState(id, kept)).toBe(true);
    const after = rig.vm.camera(id);
    expect(close(after.position, before.position)).toBe(true);
    expect(close(after.quaternion, before.quaternion)).toBe(true);
    expect(close(after.target, before.target)).toBe(true);
    // the person's own view now: a frame preparation (a character loading) does not frame it again
    rig.frame();
    expect(close(rig.vm.camera(id).position, before.position)).toBe(true);
  });

  it('refuses an unknown pane and a state that is not finite', async () => {
    rig = await createRig();
    rig.layout('single');
    rig.frame();
    const id = LAYOUT_PANES.single[0] as string;
    const kept = rig.vm.viewState(id);
    if (kept === null) throw new Error('no view');
    expect(rig.vm.viewState('pane-nowhere')).toBeNull();
    expect(rig.vm.setViewState('pane-nowhere', kept)).toBe(false);
    expect(rig.vm.setViewState(id, { ...kept, position: [Number.NaN, 0, 0] })).toBe(false);
    expect(rig.vm.setViewState(id, { ...kept, zoom: 0 })).toBe(false);
  });
});

describe('a leaving shell releases only its own press hooks (STUDIO-TOUCH-SPEC §16.1, AS-ST-10; T12)', () => {
  it('clearPointerMenus and clearNavigationOverride leave the next shell’s hooks in place', async () => {
    rig = await createRig();
    rig.layout('single');
    const pro = () => true;
    const halo = () => false;
    rig.vm.setPointerMenus(pro);
    // the next shell installs its own before the leaving one's disposer runs
    rig.vm.setPointerMenus(halo);
    rig.vm.clearPointerMenus(pro);
    expect((rig.vm as unknown as { pointerMenus: unknown }).pointerMenus).toBe(halo);
    rig.vm.clearPointerMenus(halo);
    expect((rig.vm as unknown as { pointerMenus: unknown }).pointerMenus).toBeNull();
    const a = { gesture: () => null };
    const b = { gesture: () => null };
    rig.vm.setNavigationOverride(a);
    rig.vm.setNavigationOverride(b);
    rig.vm.clearNavigationOverride(a);
    expect((rig.vm as unknown as { navOverride: unknown }).navOverride).toBe(b);
    rig.vm.clearNavigationOverride(b);
    expect((rig.vm as unknown as { navOverride: unknown }).navOverride).toBeNull();
  });
});
