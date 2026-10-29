// Optional document table. Older writers preserve it as opaque data, like ekza.targets.
import { type Disposer, EkzaError } from '@ekza-studio/anim-core';
import {
  type CharacterId,
  getTableDef,
  type ReadView,
  registerTable,
  type TableDef,
  type Tombstone,
  type Tx,
} from '@ekza-studio/doc';
import { type ImportedMaterialOverride, materialColor } from '@ekza-studio/io';

export const MATERIAL_OVERRIDES_TABLE = 'ekza.materialOverrides';
export interface MaterialOverrideRecord extends ImportedMaterialOverride {
  readonly id: string;
  readonly character: CharacterId;
  readonly deleted: Tombstone;
}
interface AnyView {
  list(table: string): readonly MaterialOverrideRecord[];
}
interface AnyTx {
  put(table: string, value: MaterialOverrideRecord): void;
  patch(table: string, id: string, value: unknown): void;
  getIncludingDeleted(table: string, id: string): MaterialOverrideRecord | undefined;
  restore(table: string, id: string): void;
  softDelete(table: string, id: string): void;
}

export function validateMaterialOverride(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null) return ['expected material override'];
  const row = value as Partial<MaterialOverrideRecord>;
  const hash = /^[0-9a-f]{64}$/;
  return typeof row.id === 'string' &&
    typeof row.character === 'string' &&
    hash.test(row.baseSha256 ?? '') &&
    hash.test(row.materialSha256 ?? '') &&
    Number.isSafeInteger(row.material) &&
    (row.material ?? -1) >= 0 &&
    materialColor(row.baseColorFactor)
    ? []
    : ['invalid source, material identity or colour'];
}
const TABLE: TableDef = {
  name: MATERIAL_OVERRIDES_TABLE,
  version: 1,
  mergeUnit: 'field',
  softDelete: true,
  partition: (row) => `char:${(row as MaterialOverrideRecord).character}`,
  validate: validateMaterialOverride,
  migrations: [],
};
export function ensureMaterialOverridesTable(): Disposer {
  return getTableDef(MATERIAL_OVERRIDES_TABLE) === undefined ? registerTable(TABLE) : () => {};
}
export function materialOverrides(store: ReadView, character: CharacterId): readonly MaterialOverrideRecord[] {
  return (store as unknown as AnyView)
    .list(MATERIAL_OVERRIDES_TABLE)
    .filter((row) => row.character === character && row.deleted === null)
    .sort((a, b) => a.material - b.material);
}
export function writeMaterialOverride(tx: Tx, row: MaterialOverrideRecord): void {
  if (validateMaterialOverride(row).length > 0) throw new EkzaError('invalid-input', 'Invalid material override');
  const writer = tx as unknown as AnyTx;
  const existing = writer.getIncludingDeleted(MATERIAL_OVERRIDES_TABLE, row.id);
  if (existing === undefined) writer.put(MATERIAL_OVERRIDES_TABLE, row);
  else {
    if (existing.deleted !== null) writer.restore(MATERIAL_OVERRIDES_TABLE, row.id);
    const { id: _id, deleted: _deleted, ...fields } = row;
    writer.patch(MATERIAL_OVERRIDES_TABLE, row.id, fields);
  }
}
export function removeMaterialOverride(tx: Tx, id: string): void {
  (tx as unknown as AnyTx).softDelete(MATERIAL_OVERRIDES_TABLE, id);
}
