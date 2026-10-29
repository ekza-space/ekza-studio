import { EkzaError } from '@ekza-studio/anim-core';
import { importedMaterialTargets, materialColor } from '@ekza-studio/io';
import { GLOBAL_SCOPE } from '../../types';
import { materialOverrides, removeMaterialOverride, writeMaterialOverride } from '../../workflows/materialOverrides';
import { type AnyOperator, defineOperator, fail } from './define';
import { pollEditable } from './polls';

const set = defineOperator({
  id: 'material.setBaseColor',
  label: 'Set Imported Material Colour',
  description: 'Change standard glTF base RGB on the exact imported source; source alpha and textures stay in place.',
  category: 'material',
  scope: GLOBAL_SCOPE,
  flags: { undo: true },
  undoLabel: () => 'Set Material Colour',
  poll({ app }, args) {
    const runtime = app.characters.get(args?.character);
    if (runtime === undefined || app.store.get('characters', args.character)?.source.kind !== 'asset')
      return fail('Choose a loaded imported character');
    const target = importedMaterialTargets(runtime.container)[args.material];
    if (target === undefined || !target.supported) return fail(target?.reason ?? 'Material does not exist');
    if (args.baseSha256 !== target.baseSha256 || args.materialSha256 !== target.materialSha256)
      return fail('The material belongs to a different source revision');
    if (!materialColor(args.baseColorFactor) || args.baseColorFactor[3] !== target.baseColorFactor[3])
      return fail('Base RGB must be finite linear values in 0…1; source alpha cannot change');
    return pollEditable(app);
  },
  apply({ tx }, args) {
    if (tx === null) throw new EkzaError('internal', 'Material edit needs a transaction');
    writeMaterialOverride(tx, { ...args, id: `mat:${args.character}:${args.material}`, deleted: null });
  },
});
const reset = defineOperator({
  id: 'material.resetBaseColor',
  label: 'Reset Imported Material Colour',
  description: 'Restore the imported source colour.',
  category: 'material',
  scope: GLOBAL_SCOPE,
  flags: { undo: true },
  undoLabel: () => 'Reset Material Colour',
  poll({ app }, args) {
    if (typeof args?.character !== 'string' || !Number.isSafeInteger(args.material)) return fail('Choose a material');
    return materialOverrides(app.store, args.character).some((row) => row.material === args.material)
      ? pollEditable(app)
      : fail('This material already uses its source colour');
  },
  apply({ tx }, args) {
    if (tx === null) throw new EkzaError('internal', 'Material reset needs a transaction');
    removeMaterialOverride(tx, `mat:${args.character}:${args.material}`);
  },
});
export const MATERIAL_OPERATORS: readonly AnyOperator[] = [set, reset];
