import { describe, expect, it } from 'vitest';
import { importedMaterialTargets, parseGlb, type ExportArtifact } from '@ekza-studio/io';
import { GltfBuilder } from '../../io/src/testing/glb';
import { createEditorApp } from '../src';
import type { KernelCharacters } from '../src/characters/registry';
import { createFakeServices } from '../src/testing';
import { materialOverrides } from '../src/workflows/materialOverrides';
import { displayContainer } from '../src/workflows/exportModel';
import { runOk } from './builtin/support';

function bytes() {
  const b = new GltfBuilder();
  const position = b.accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3', { minMax: true });
  b.json['nodes'] = [
    { mesh: 0, skin: 0, name: 'Body' },
    { name: 'Root', children: [2] },
    { name: 'Tip', translation: [0, 1, 0] },
  ];
  b.json['skins'] = [{ joints: [1, 2], skeleton: 1 }];
  const joints = b.accessor(new Uint16Array(12), 'VEC4');
  const weights = b.accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4');
  b.json['meshes'] = [
    { primitives: [{ attributes: { POSITION: position, JOINTS_0: joints, WEIGHTS_0: weights }, material: 0 }] },
  ];
  b.json['materials'] = [
    { name: 'Coat', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } },
    { name: 'Untouched' },
  ];
  b.json['scenes'] = [{ nodes: [0, 1] }];
  b.json['scene'] = 0;
  return b.build();
}
describe('imported material editor roundtrip', () => {
  it('one undoable edit survives project save/reopen and material-only export', async () => {
    const services = createFakeServices();
    const app = createEditorApp({ services });
    const otherServices = createFakeServices();
    const other = createEditorApp({ services: otherServices });
    try {
      const result = await app.runUntyped('file.importModel', {
        name: 'coat.glb',
        bytes: bytes(),
        options: { clips: 'none' },
      });
      expect(result.status).toBe('finished');
      await (app.characters as KernelCharacters).settled();
      const character = app.characters.list()[0]!.id;
      const source = app.characters.get(character)!.container;
      const target = importedMaterialTargets(source)[0]!;
      const edit = {
        character,
        baseSha256: target.baseSha256,
        material: target.material,
        materialSha256: target.materialSha256,
        baseColorFactor: [0.1, 0.2, 0.3, 1],
      };
      expect((await app.runUntyped('material.setBaseColor', { ...edit, baseSha256: 'a'.repeat(64) })).status).toBe(
        'cancelled',
      );
      await runOk(app, 'material.setBaseColor', edit);
      expect(materialOverrides(app.store, character)).toHaveLength(1);
      app.history.undo();
      expect(materialOverrides(app.store, character)).toHaveLength(0);
      app.history.redo();
      expect(materialOverrides(app.store, character)[0]?.baseColorFactor).toEqual(edit.baseColorFactor);
      const preview = await displayContainer(app, app.characters.get(character)!);
      expect((preview!.json['materials'] as Record<string, unknown>[])[0]?.['pbrMetallicRoughness']).toEqual({
        baseColorFactor: edit.baseColorFactor,
      });
      await runOk(app, 'file.save');
      const project = services.downloads.at(-1)!;
      await runOk(other, 'file.openProject', { name: project.fileName, bytes: project.bytes });
      await (other.characters as KernelCharacters).settled();
      expect(materialOverrides(other.store, character)).toEqual(materialOverrides(app.store, character));
      const request = {
        kind: 'bake-into-model',
        character,
        clips: [],
        fileNamePattern: 'colour',
        profile: null,
        closeLoop: false,
        includeConstantTracks: false,
        acknowledgeLicense: false,
      };
      const exported = (await runOk(other, 'file.export', request)) as readonly ExportArtifact[];
      expect(exported[0]?.readBack?.ok).toBe(true);
      expect(otherServices.downloads.at(-1)?.fileName).toBe('colour.glb');
      const output = await parseGlb(exported[0]!.bytes);
      expect(output.json['materials']).toEqual(preview?.json['materials']);
      expect(output.bin).toEqual(source.bin);
      await runOk(other, 'material.resetBaseColor', { character, material: target.material });
      expect(materialOverrides(other.store, character)).toHaveLength(0);
      other.history.undo();
      expect(materialOverrides(other.store, character)).toHaveLength(1);
    } finally {
      app.dispose();
      other.dispose();
    }
  });
});
