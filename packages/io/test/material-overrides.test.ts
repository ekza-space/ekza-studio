import { describe, expect, it } from 'vitest';
import { parseGlb } from '../src/glb/parse';
import {
  importedMaterialTargets,
  materialOverrideContainer,
  type ImportedMaterialOverride,
} from '../src/materialOverrides';
import { skeletonFromGltf } from '../src/skeleton/read';
import { bakeIntoModel } from '../src/surgeon/bakeIntoModel';
import { GltfBuilder } from '../src/testing/glb';
import { metaOf, rawClip } from './helpers/poses';

function sourceBytes() {
  const b = new GltfBuilder({
    version: '2.0',
    generator: 'original test author',
    extras: { credit: 'Fixture author' },
  });
  const position = b.accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3', { minMax: true });
  b.json['materials'] = [
    {
      name: 'Coat',
      pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.1, 0.8], roughnessFactor: 0.7 },
      extras: { credit: 'Material author' },
    },
    { name: 'Face', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } },
  ];
  b.json['meshes'] = [
    {
      primitives: [
        { attributes: { POSITION: position }, material: 0 },
        { attributes: { POSITION: position }, material: 1 },
      ],
    },
  ];
  b.json['nodes'] = [{ name: 'Body', mesh: 0 }];
  b.json['scenes'] = [{ nodes: [0] }];
  b.json['scene'] = 0;
  return b.build();
}
describe('source-bound imported PBR colour', () => {
  it('bakes deterministically and preserves every unrelated component and original bytes', async () => {
    const source = await parseGlb(sourceBytes());
    const before = structuredClone(source.json);
    const target = importedMaterialTargets(source)[0]!;
    const edit: ImportedMaterialOverride = { ...target, baseColorFactor: [0.1, 0.2, 0.3, 0.8] };
    const skeleton = skeletonFromGltf(source);
    const options = { fileName: 'colour.glb', profile: null, meta: metaOf([], skeleton), materials: [edit] };
    const a = await bakeIntoModel(source, skeleton, [], options);
    const b = await bakeIntoModel(source, skeleton, [], options);
    expect(a.bytes).toEqual(b.bytes);
    expect(a.readBack?.ok).toBe(true);
    const output = await parseGlb(a.bytes);
    const preview = await materialOverrideContainer(source, [edit]);
    const materials = output.json['materials'] as Record<string, unknown>[];
    expect(materials).toEqual(preview.json['materials']);
    expect(materials[0]).toEqual({
      ...(before['materials'] as Record<string, unknown>[])[0],
      pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.3, 0.8], roughnessFactor: 0.7 },
    });
    expect(materials[1]).toEqual((before['materials'] as unknown[])[1]);
    for (const key of ['asset', 'nodes', 'meshes', 'skins', 'extensions', 'bufferViews', 'accessors'])
      expect(output.json[key]).toEqual(before[key]);
    expect(output.bin).toEqual(source.bin);
    expect(source.json).toEqual(before);
    expect(source.bytes).toEqual(sourceBytes());
  });
  it('keeps earlier baked animations and their provenance intact during a colour-only export', async () => {
    const original = await parseGlb(sourceBytes());
    const skeleton = skeletonFromGltf(original);
    const clip = rawClip(skeleton, 'wave');
    const baked = await bakeIntoModel(original, skeleton, [clip], {
      meta: metaOf([clip], skeleton),
      fileName: 'animated.glb',
      profile: null,
    });
    const source = await parseGlb(baked.bytes);
    const target = importedMaterialTargets(source)[0]!;
    const output = await bakeIntoModel(source, skeleton, [], {
      meta: metaOf([], skeleton),
      fileName: 'colour.glb',
      profile: null,
      materials: [{ ...target, baseColorFactor: [0, 1, 0, 0.8] }],
    });
    const json = (await parseGlb(output.bytes)).json;
    expect(json['animations']).toEqual(source.json['animations']);
    expect(json.asset).toEqual(source.json.asset);
    expect(json['accessors']).toEqual(source.json['accessors']);
    expect((await parseGlb(output.bytes)).bin).toEqual(source.bin);
  });
  it('rejects a wrong source, material fingerprint, alpha, duplicate target and invalid RGB', async () => {
    const source = await parseGlb(sourceBytes());
    const target = importedMaterialTargets(source)[0]!;
    for (const edit of [
      { ...target, baseSha256: 'a'.repeat(64) },
      { ...target, materialSha256: 'b'.repeat(64) },
      { ...target, baseColorFactor: [1, 0, 0, 1] },
      { ...target, baseColorFactor: [NaN, 0, 0, 0.8] },
      { ...target, baseColorFactor: [2, 0, 0, 0.8] },
      { ...target, material: 50 },
    ]) {
      await expect(materialOverrideContainer(source, [edit as ImportedMaterialOverride])).rejects.toThrow(
        /source material/,
      );
    }
    await expect(materialOverrideContainer(source, [target, target])).rejects.toThrow(/source material/);
  });
  it('refuses MToon and unknown material extensions rather than claiming preview parity', async () => {
    const b = new GltfBuilder();
    b.json['materials'] = [{ extensions: { VRMC_materials_mtoon: {} } }, { extensions: { KHR_materials_unlit: {} } }];
    const source = await parseGlb(b.build());
    const targets = importedMaterialTargets(source);
    expect(targets[0]?.supported).toBe(false);
    expect(targets[0]?.reason).toMatch(/MToon/);
    expect(targets[1]?.supported).toBe(true);
    await expect(materialOverrideContainer(source, [targets[0]!])).rejects.toThrow(/source material/);
  });
});
