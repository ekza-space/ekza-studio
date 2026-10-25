// AI disclosure on export (ADR 0017 §7, §8; MODELING-PLAN §3.11, §7.3; DECISIONS M7-GD-4): an export whose meshes were
// made from a generated model (the `ekza.generations` link) writes that model's generator record into the hashed
// `asset.extras.ekza_model_v1.provenance.generator` block (no task id, the prompt only on opt-in) and marks those meshes
// for the `ekza.provenance-ai-undisclosed` lint, which then passes because the block discloses them. The provenance
// lints of the written file (`ekza.provenance-free-tier`, `-territory`, `-attribution`) read that block.
import type { GeneratorProvenance } from '@ekza-studio/doc';
import type { EkzaModelV1 } from '@ekza-studio/io';
import type { MeshLintInput } from '@ekza-studio/io/write';
import type { EditorApp } from '../types';
import { exportedGenerator, generatedMeshes, generatorOfExport } from './table';

/** The model block with the AI generator (unchanged without one). */
export function withAiGenerator(model: EkzaModelV1, generator: GeneratorProvenance | null): EkzaModelV1 {
  if (generator === null) return model;
  return { ...model, provenance: { ...model.provenance, generator: exportedGenerator(generator) } };
}

export interface AiDisclosure {
  /** The generator the export discloses, or null. */
  readonly generator: GeneratorProvenance | null;
  /** The mesh lint inputs with `aiGenerated` set on the generated ones. */
  readonly meshes: MeshLintInput[];
  readonly generated: boolean;
}

/** The disclosure of an export of these meshes (and, for a character export, this character). */
export function aiDisclosure(
  app: EditorApp,
  meshes: readonly MeshLintInput[],
  character: string | null = null,
): AiDisclosure {
  const ids = meshes.map((mesh) => mesh.id);
  const generated = generatedMeshes(app.store, ids);
  const generator = generatorOfExport(app.store, ids, character);
  return {
    generator,
    meshes: meshes.map((mesh) => (generated.has(mesh.id) ? { ...mesh, aiGenerated: true } : mesh)),
    generated: generated.size > 0 || generator !== null,
  };
}
