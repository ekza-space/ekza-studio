// The Rig stage's pure parts (STUDIO-TOUCH-SPEC §12; T9; the vocabulary lint over `i18n/rig.ts` is `rules.test.ts`'s
// since T12): the bend test's swing and its edits; search's phrases for *Rig it for me* and *Fix where it bends badly*; the finger
// detail of a destination; the Rig stage in the stage-parts seam; and, on Polybot (a bound VRM character), the bones a
// skin spot follows, the bone list and the bend test's controls.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QUICK_RIG_LABELS } from '@ekza-studio/editor-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_OWNERS, SHEET_OWNER } from '../src/manifest/types';
import { SHEET_SECTIONS } from '../src/manifest/sheets';
import { bendAt, bendEdits } from '../src/recipes/fixBend';
import { DESTINATION_FINGERS, fingersOfPreset, subjectOfDocument } from '../src/recipes/rigIt';
import { fixBendOffer, rigItOffer } from '../src/recipes/rigOffers';
import { SEARCH_RECIPES } from '../src/recipes';
import { STAGE_MODULES } from '../src/shell/stageParts';
import { RIG_DOT_LABELS } from '../src/stages/rig/dotLabels';
import { bendTargets, bodyPartLabel, bonesAt, boneRows } from '../src/stages/rig/model';
import { riggedCubeLad, staticFetch } from './support-rig';

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
  it('the dots are named as Pro names its markers', () => {
    expect(RIG_DOT_LABELS).toEqual(QUICK_RIG_LABELS);
  });
});

describe('the Rig stays out of /app’s initial scripts (§20.6, SIZE-1 lazy boundaries)', () => {
  const SRC = new URL('../src', import.meta.url).pathname;
  const CORE = new URL('../../editor-core/src', import.meta.url).pathname;

  /** The Halo modules `src/index.ts` reaches by static value imports (`import()` is a lazy chunk). */
  function eagerModules(): string[] {
    const seen = new Set<string>();
    const resolveSpec = (from: string, spec: string): string | null => {
      if (!spec.startsWith('.')) return null;
      const base = join(from, '..', spec);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        try {
          if (statSync(candidate).isFile()) return candidate;
        } catch {
          // not this one
        }
      }
      return null;
    };
    const walk = (path: string): void => {
      if (seen.has(path)) return;
      seen.add(path);
      for (const m of readFileSync(path, 'utf8').matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)) {
        const next = resolveSpec(path, m[1] ?? '');
        if (next !== null) walk(next);
      }
    };
    walk(join(SRC, 'index.ts'));
    return [...seen];
  }

  /** The values editor-core's rig operators and the Auto-Rig flow export (the Quick Rig, the skeleton builders). */
  function rigValues(): Set<string> {
    const names = new Set<string>();
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (/\.tsx?$/.test(entry.name))
          for (const m of readFileSync(path, 'utf8').matchAll(/^export (?:async )?(?:const|function|class) (\w+)/gm))
            names.add(m[1] ?? '');
      }
    };
    scan(join(CORE, 'operators/builtin/rig'));
    scan(join(CORE, 'autorigFlow'));
    return names;
  }

  it('no eager Halo module imports a Quick Rig or Auto-Rig value from editor-core', () => {
    const rig = rigValues();
    expect(rig.has('QUICK_RIG_LABELS')).toBe(true);
    const leaks: string[] = [];
    for (const path of eagerModules()) {
      for (const m of readFileSync(path, 'utf8').matchAll(
        /^import\s+(?!type\b)\{([^}]*)\}\s*from\s+'@ekza-studio\/editor-core'/gm,
      )) {
        for (const spec of (m[1] ?? '').split(',')) {
          const name = spec.trim();
          if (name === '' || name.startsWith('type ')) continue;
          const local = name.split(/\s+as\s+/)[0] ?? name;
          if (rig.has(local)) leaks.push(`${path.slice(SRC.length + 1)}: ${local}`);
        }
      }
    }
    expect(leaks).toEqual([]);
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
