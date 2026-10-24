// Which meshes and characters came from a generated model (ADR 0017 §7; MODELING-PLAN §3.11; DECISIONS M7-GD-4): the
// extension table `ekza.generations`, one record per generated model asset, listing the meshes `gen.import` made from
// it (and a provider-rigged character). The generator record itself lives on the asset (`AssetRecord.provenance`); this
// table is the link an export follows back to it, because the clean-up's palette bake makes a mesh paintable and drops
// its `source` (M7-GA-7). An extension table keeps `SCHEMA_VERSION` 4: builds without it keep the rows untouched (opaque
// tables survive snapshots verbatim), as `ekza.targets` does. Registered before anything reads or writes it.
import { type Disposer } from '@ekza-studio/anim-core';
import {
  type AssetId,
  type AssetProvenance,
  type CharacterId,
  type GeneratorProvenance,
  getTableDef,
  type MeshId,
  type ReadView,
  registerTable,
  type TableDef,
  type Tombstone,
  type Tx,
} from '@ekza-studio/doc';

export const GENERATIONS_TABLE = 'ekza.generations';

export interface GenerationRecord {
  readonly id: string;
  /** The generated model's asset; its `provenance.generator` is the record exports disclose. */
  readonly asset: AssetId;
  /** The meshes made from it (imported and cleaned up by `gen.import`). */
  readonly meshes: readonly MeshId[];
  /** The character a provider-rigged model became, else null. */
  readonly character: CharacterId | null;
  readonly deleted: Tombstone;
}

/** One record per asset: its id is derived from the asset. */
export const generationIdOf = (asset: AssetId): string => `gen:${asset}`;

const SHA256 = /^[0-9a-f]{64}$/;
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Problems of a generation record ([] = valid). */
export function validateGeneration(value: unknown): readonly string[] {
  if (!isObject(value)) return ['expected a record object'];
  const problems: string[] = [];
  if (typeof value['id'] !== 'string' || !value['id'].startsWith('gen:')) problems.push('id: expected gen:<asset>');
  if (typeof value['asset'] !== 'string' || !SHA256.test(value['asset'])) problems.push('asset: expected a SHA-256');
  const meshes = value['meshes'];
  if (!Array.isArray(meshes) || meshes.some((mesh) => typeof mesh !== 'string')) {
    problems.push('meshes: expected mesh ids');
  }
  const character = value['character'];
  if (character !== null && typeof character !== 'string') problems.push('character: expected null or an id');
  const deleted = value['deleted'];
  if (deleted !== null && !isObject(deleted)) problems.push('deleted: expected null or a tombstone');
  return problems;
}

export const GENERATIONS_TABLE_DEF: TableDef = {
  name: GENERATIONS_TABLE,
  version: 1,
  mergeUnit: 'field',
  softDelete: true,
  partition: () => 'scene',
  validate: validateGeneration,
  migrations: [],
};

/** Registers `ekza.generations` once (a table registered by another copy of this module is kept). */
export function ensureGenerationTable(): Disposer {
  if (getTableDef(GENERATIONS_TABLE) !== undefined) return () => {};
  return registerTable(GENERATIONS_TABLE_DEF);
}

// The store is typed over the built-in tables; the extension table is reached through these casts (as `ekza.targets`).
interface AnyView {
  get(table: string, id: string): unknown;
  list(table: string): readonly unknown[];
}
interface AnyTx extends AnyView {
  getIncludingDeleted(table: string, id: string): unknown;
  restore(table: string, id: string): void;
  put(table: string, record: unknown): void;
  patch(table: string, id: string, fields: unknown): void;
}
const view = (store: ReadView): AnyView => store as unknown as AnyView;
const write = (tx: Tx): AnyTx => tx as unknown as AnyTx;

/** Every live generation record of the document. */
export function generationRecords(store: ReadView): readonly GenerationRecord[] {
  return (view(store).list(GENERATIONS_TABLE) as readonly GenerationRecord[]).filter(
    (record) => isObject(record) && record.deleted === null,
  );
}

/** Writes an asset's generation record: new, or the existing one (restored when removed) with these meshes added. */
export function putGeneration(
  tx: Tx,
  asset: AssetId,
  meshes: readonly MeshId[],
  character: CharacterId | null,
): GenerationRecord {
  const any = write(tx);
  const id = generationIdOf(asset);
  const existing = any.getIncludingDeleted(GENERATIONS_TABLE, id) as GenerationRecord | undefined;
  if (existing === undefined) {
    const record: GenerationRecord = { id, asset, meshes: [...meshes], character, deleted: null };
    any.put(GENERATIONS_TABLE, record);
    return record;
  }
  if (existing.deleted !== null) any.restore(GENERATIONS_TABLE, id);
  const merged = [...existing.meshes, ...meshes.filter((mesh) => !existing.meshes.includes(mesh))];
  const fields = { meshes: merged, character: character ?? existing.character };
  any.patch(GENERATIONS_TABLE, id, fields);
  return { ...existing, ...fields, deleted: null };
}

/** The AI generator record of an asset, or null. */
export function assetGenerator(store: ReadView, asset: AssetId): GeneratorProvenance | null {
  return store.get('assets', asset)?.provenance?.generator ?? null;
}

/**
 * The generator an export of these meshes (or this character) discloses: the first linked generation's record in
 * mesh order, else null. Several generated models in one file disclose the first (the block holds one generator).
 */
export function generatorOfExport(
  store: ReadView,
  meshes: readonly string[],
  character: string | null = null,
): GeneratorProvenance | null {
  const records = generationRecords(store);
  if (records.length === 0) return null;
  for (const mesh of meshes) {
    const record = records.find((r) => r.meshes.includes(mesh as MeshId));
    const generator = record === undefined ? null : assetGenerator(store, record.asset);
    if (generator !== null) return generator;
  }
  if (character !== null) {
    const record = records.find((r) => r.character === character);
    const generator = record === undefined ? null : assetGenerator(store, record.asset);
    if (generator !== null) return generator;
  }
  return null;
}

/** The meshes of `meshes` that came from a generated model (the `ekza.provenance-ai-undisclosed` lint's input). */
export function generatedMeshes(store: ReadView, meshes: readonly string[]): ReadonlySet<string> {
  const records = generationRecords(store);
  const out = new Set<string>();
  for (const mesh of meshes) if (records.some((r) => r.meshes.includes(mesh as MeshId))) out.add(mesh);
  return out;
}

/**
 * The `ekza_model_v1.provenance.generator` block of a generator record (ADR 0017 §7): the provider task id stays in the
 * document, the prompt text is written only when the person opted in (Q-GEN-5), no download URL, no key named `uri`.
 */
export function exportedGenerator(
  generator: GeneratorProvenance,
): { readonly kind: 'ai' } & Omit<GeneratorProvenance, 'kind' | 'taskId' | 'prompt'> & { readonly prompt?: string } {
  const { taskId: _taskId, prompt, ...rest } = generator;
  return prompt === null ? rest : { ...rest, prompt };
}

/** The badge a generated asset shows: the service, the pinned model, the attested tier, the post steps. */
export interface GenBadge {
  readonly service: string;
  readonly model: string;
  readonly op: string;
  readonly tier: GeneratorProvenance['tier'];
  readonly aiMarksMayBeAltered: boolean;
  readonly promptKept: boolean;
}

export function badgeOf(provenance: AssetProvenance | null): GenBadge | null {
  const generator = provenance?.generator ?? null;
  if (generator === null) return null;
  return {
    service: generator.service,
    model: generator.model,
    op: generator.op,
    tier: generator.tier,
    aiMarksMayBeAltered: generator.postSteps.some((step) => step.aiMarksMayBeAltered),
    promptKept: generator.prompt !== null,
  };
}

/** The badge of a mesh made from a generated model, or null. */
export function meshGenBadge(store: ReadView, mesh: string): GenBadge | null {
  const record = generationRecords(store).find((r) => r.meshes.includes(mesh as MeshId));
  return record === undefined ? null : badgeOf(store.get('assets', record.asset)?.provenance ?? null);
}
