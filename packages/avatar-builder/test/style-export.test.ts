import { describe, expect, it } from 'vitest';
import { exportAvatar } from '../src/exportAvatar';
import { createStyleRegistry } from '../src/styleRegistry';
import { installedStyles } from '../src/styles';
import { prismStyle } from './styleFixture';

describe('style exports', () => {
  it('exports the selected style’s name and bind rig reproducibly', async () => {
    const registry = createStyleRegistry([...installedStyles, prismStyle]);
    const recipe = registry.createRecipe(undefined, 'test-prism');
    const bytes = await exportAvatar(recipe, registry);
    expect(await exportAvatar(recipe, registry)).toEqual(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as {
      extensions: { VRMC_vrm: { meta: { name: string }; humanoid: { humanBones: Record<string, unknown> } } };
      nodes: { name: string; translation?: number[] }[];
    };
    expect(json.extensions.VRMC_vrm.meta.name).toBe('Prism Test — Sentinel');
    expect(Object.keys(json.extensions.VRMC_vrm.humanoid.humanBones)).toHaveLength(15);
    expect(json.nodes.find(({ name }) => name === 'hips')?.translation?.[1]).toBeCloseTo(0.79 * 1.1);
  });
});
