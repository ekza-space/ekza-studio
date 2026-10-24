// The Rig stage's words and pure parts (STUDIO-TOUCH-SPEC §1.3, §12; T9): the vocabulary lint over `i18n/rig.ts` (the
// shell's rules: no DCC jargon at L0 or L1, *Animation* only for clips, the selection meanings stay the Thumb key's);
// the bend test's swing and its edits; search's phrases for *Rig it for me* and *Fix where it bends badly*; the finger
// detail of a destination; the Rig stage in the stage-parts seam; and, on Polybot (a bound VRM character), the bones a
// skin spot follows, the bone list and the bend test's controls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rigWords } from '../src/i18n/rig';
import { BUILT_OWNERS, SHEET_OWNER } from '../src/manifest/types';
import { SHEET_SECTIONS } from '../src/manifest/sheets';
import { bendAt, bendEdits } from '../src/recipes/fixBend';
import { DESTINATION_FINGERS, fingersOfPreset, subjectOfDocument } from '../src/recipes/rigIt';
import { fixBendOffer, rigItOffer } from '../src/recipes/rigOffers';
import { SEARCH_RECIPES } from '../src/recipes';
import { STAGE_MODULES } from '../src/shell/stageParts';
import { bendTargets, bodyPartLabel, bonesAt, boneRows } from '../src/stages/rig/model';
import { riggedCubeLad, staticFetch } from './support-rig';

function strings(node: unknown, path: string[] = []): { readonly path: string; readonly text: string }[] {
  if (typeof node === 'string') return [{ path: path.join('.'), text: node }];
  if (typeof node === 'function') return [{ path: path.join('.'), text: String((node as (v: unknown) => unknown)(2)) }];
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, [...path, String(i)]));
  if (typeof node === 'object' && node !== null)
    return Object.entries(node).flatMap(([k, v]) => strings(v, [...path, k]));
  return [];
}

describe('the Rig stage’s vocabulary (§1.3)', () => {
  const all = strings(rigWords);
  it('no DCC jargon at L0 or L1 (no influence, bind pose, IK / FK, …)', () => {
    const jargon =
      /\b(extrude|tween|breakdown|ripple|euler|tangents?|IK|FK|influences?|bind pose|lambert|blinn|tris|keyframes?)\b/i;
    expect(all.filter((s) => jargon.test(s.text)).map((s) => `${s.path}: ${s.text}`)).toEqual([]);
  });
  it('“Animation” is a clip: only the card’s starter set speaks of animations', () => {
    for (const s of all.filter((x) => /\banimations?\b/i.test(x.text))) expect(s.path).toMatch(/^card\.addAnimations$/);
  });
  it('the selection meanings stay the Thumb key’s; “Move” is never a clip', () => {
    expect(all.filter((s) => /\bselect more\b|\bpick or unpick\b|\bunselect\b/i.test(s.text))).toEqual([]);
    expect(all.filter((s) => /\bmoves?\b/i.test(s.text) && /animation|clip/i.test(s.text))).toEqual([]);
  });
});

describe('the bend test (§12.4 step 1)', () => {
  it('swings 0 → the deepest bend → 0 over its period', () => {
    expect(bendAt(0)).toBe(0);
    expect(bendAt(1.2)).toBeCloseTo(1, 12);
    expect(bendAt(2.4)).toBeCloseTo(0, 12);
    expect(bendAt(0.6)).toBeCloseTo(0.5, 12);
  });
  it('turns each control from its own start value', () => {
    const targets = [
      { control: 'cns_a' as never, channel: 'ry' as const, bend: 1 },
      { control: 'cns_b' as never, channel: 'rx' as const, bend: -2 },
    ];
    const start = new Map([
      ['cns_a:ry', 0.5],
      ['cns_b:rx', 0],
    ]);
    expect(bendEdits(targets, start, 0.5)).toEqual([
      { control: 'cns_a', channel: 'ry', value: 1 },
      { control: 'cns_b', channel: 'rx', value: -1 },
    ]);
  });
});

describe('search offers the Rig recipes (§9.11, P-T11-1)', () => {
  it('*Rig it for me* and *Fix where it bends badly* by phrase, never a silent guess', () => {
    expect(rigItOffer('rig it')?.id).toBe('rigIt');
    expect(rigItOffer('auto-rig this')?.id).toBe('rigIt');
    expect(rigItOffer('fix the bend')).toBeNull();
    expect(fixBendOffer('elbow bends badly')?.id).toBe('fixBend');
    expect(fixBendOffer('paint weights')?.id).toBe('fixBend');
    expect(fixBendOffer('wave twice')).toBeNull();
    expect(SEARCH_RECIPES).toContain(rigItOffer);
    expect(SEARCH_RECIPES).toContain(fixBendOffer);
  });
  it('without a mounted Rig stage the offer says why', async () => {
    const offer = rigItOffer('rig');
    const outcome = await offer?.run({ app: {} as never, run: () => Promise.reject(new Error('no')), toast: () => {} });
    expect(outcome).toMatchObject({ status: 'stopped' });
  });
});

describe('the Rig-it card’s rules', () => {
  it('OMOBA asks for a thumb bone; the presets name the finger detail', () => {
    expect(DESTINATION_FINGERS['omoba']).toBe('thumb');
    expect(DESTINATION_FINGERS['engine']).toBeUndefined();
    expect(fingersOfPreset('standard33')).toBe('thumb');
    expect(fingersOfPreset('core21')).toBe('mittens');
    expect(fingersOfPreset('full52')).toBe('all');
    expect(fingersOfPreset('lite17')).toBe('minimal');
  });
  it('the Rig stage is in the stage-parts seam; T9 is built; its sheets have sections', () => {
    expect(STAGE_MODULES.rig).toBeTypeOf('function');
    expect(BUILT_OWNERS.has('T9')).toBe(true);
    for (const sheet of ['checks', 'bones', 'weights'] as const) {
      expect(SHEET_OWNER[sheet]).toBe('T9');
      expect(SHEET_SECTIONS[sheet]?.length ?? 0).toBeGreaterThan(0);
    }
  });
  it('body parts read as words', () => {
    expect(bodyPartLabel('leftUpperArm')).toBe('Left upper arm');
    expect(bodyPartLabel('hips')).toBe('Hips');
  });
});

describe('on a bound character (the Cube Lad, rigged through the flow)', { timeout: 120_000 }, () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', staticFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('a skin spot names the bones it follows; the bone list; the bend test’s forearms and shins', async () => {
    const { app, character } = await riggedCubeLad();
    // the document's subject is the character (Rig it again)
    expect(subjectOfDocument(app)).toEqual({ character, meshes: [] });
    const mesh = app.store.query.meshesOfOwner(character).find((m) => m.deleted === null && m.skin !== null);
    expect(mesh).toBeDefined();
    if (mesh === undefined) return;
    const bones = bonesAt(app, mesh.id, 0, 3);
    expect(bones.length).toBeGreaterThan(0);
    expect(bones.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < bones.length; i++)
      expect(bones[i - 1]?.weight ?? 0).toBeGreaterThanOrEqual(bones[i]?.weight ?? 0);
    expect(bones.reduce((a, b) => a + b.weight, 0)).toBeLessThanOrEqual(1 + 1e-6);
    // a bone's plain name is its body part when it maps to a humanoid bone
    expect(bones[0]?.label).toMatch(/^[A-Z]/);
    const targets = bendTargets(app, character);
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const t of targets) expect(Math.abs(t.bend)).toBeGreaterThan(1);
    // the bone list: the bound meshes' bones with the points each one weights, in body order
    const rows = boneRows(app, 'hierarchy');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((row) => row.count > 0)).toBe(true);
    expect(rows.some((row) => row.label === 'Hips')).toBe(true);
  });
});
