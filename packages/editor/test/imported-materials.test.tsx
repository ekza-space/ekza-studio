import { createEditorApp, materialOverrides } from '@ekza-studio/editor-core';
import { createFakeServices } from '@ekza-studio/editor-core/testing';
import { parseGlb } from '@ekza-studio/io';
import { createThreeModelLoader, type LoadedModel } from '@ekza-studio/io/three';
import type { MeshStandardMaterial } from 'three';
import { expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { GltfBuilder } from '../../io/src/testing/glb';
import { EditorAppProvider } from '../src/hooks/context';
import ImportedMaterials from '../src/panels/attributes/ImportedMaterials';
import { render, update } from './render';

function fixture(): Uint8Array {
  const b = new GltfBuilder();
  const p = b.accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3', { minMax: true });
  const joints = b.accessor(new Uint16Array(12), 'VEC4');
  const weights = b.accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4');
  b.json['nodes'] = [
    { name: 'Body', mesh: 0, skin: 0 },
    { name: 'Root', children: [2] },
    { name: 'Tip', translation: [0, 1, 0] },
  ];
  b.json['skins'] = [{ joints: [1, 2], skeleton: 1 }];
  b.json['materials'] = [{ name: 'Coat', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }];
  b.json['meshes'] = [
    { primitives: [{ attributes: { POSITION: p, JOINTS_0: joints, WEIGHTS_0: weights }, material: 0 }] },
  ];
  b.json['scenes'] = [{ nodes: [0, 1] }];
  b.json['scene'] = 0;
  return b.build();
}

it('colour UI updates the real glTF display material and exported bytes, then Reset restores it', async () => {
  const services = createFakeServices();
  const loader = createThreeModelLoader({ decoderPath: '/unused-no-compressed-fixtures' });
  // No WebGL/KTX2 is needed for this fixture; model parsing and material creation use the actual Three loader.
  const app = createEditorApp({
    services: { ...services, models: { setRenderer() {}, load: (...args) => loader.load(...args) } },
  });
  app.services.models!.setRenderer({});
  let view: Awaited<ReturnType<typeof render>> | undefined;
  try {
    const result = await app.runUntyped('file.importModel', {
      name: 'coat.glb',
      bytes: fixture(),
      options: { clips: 'none' },
    });
    expect(result.status).toBe('finished');
    await (app.characters as unknown as { settled(): Promise<void> }).settled();
    const character = app.characters.list()[0]!.id;
    const material = (): MeshStandardMaterial => {
      const display = app.characters.get(character)?.display;
      if (display === undefined || display === null) throw new Error('Display is not loaded');
      return (display.handle as LoadedModel).skinnedMeshes[0]!.material as MeshStandardMaterial;
    };
    expect(material().color.r).toBe(1);
    view = await render(
      <EditorAppProvider app={app}>
        <ImportedMaterials app={app} character={character} />
      </EditorAppProvider>,
    );
    const input = view.container.querySelector<HTMLInputElement>('input[type=text]')!;
    await update(async () => {
      await userEvent.fill(input, '#c02040');
      input.blur();
    });
    await expect.poll(() => materialOverrides(app.store, character).length).toBe(1);
    const factor = materialOverrides(app.store, character)[0]!.baseColorFactor;
    await update(async () => {
      await expect.poll(() => material().color.r).toBeCloseTo(factor[0], 6);
    });
    const button = [...view.container.querySelectorAll('button')].find(
      (node) => node.textContent === 'Export colour variant',
    )!;
    await update(() => userEvent.click(button));
    await expect.poll(() => services.downloads.length).toBe(1);
    const output = await parseGlb(services.downloads[0]!.bytes);
    const json = output.json['materials'] as { pbrMetallicRoughness: { baseColorFactor: unknown } }[];
    expect(json[0]?.pbrMetallicRoughness.baseColorFactor).toEqual(factor);
    const reset = [...view.container.querySelectorAll('button')].find((node) => node.textContent === 'Reset colour')!;
    await update(() => userEvent.click(reset));
    await update(async () => {
      await expect.poll(() => material().color.r).toBe(1);
    });
  } finally {
    await view?.unmount();
    app.dispose();
  }
});
