// Provenance of a generated model (ADR 0017 §7; Q-GEN-5, Q-GEN-9): the gateway computes the generator record (pinned
// model, params as sent, input hashes, the provider's terms, the raw model's hash, the attested tier, the task id);
// the import adds the clean-up's post steps — reduce, palette bake and texture downsize may alter a provider's
// invisible AI marks, so they record `aiMarksMayBeAltered` — and the prompt text only on the person's opt-in, after
// checking it is the text the job was generated from. gen-core's `withPostStep`, `withPromptOptIn` and
// `MARK_ALTERING_STEPS`, mirrored here because editor-core imports gen-core types only (M7-GB-14); a test keeps the
// copies equal.
import type { AssetProvenance, GeneratorProvenance, Redistributable } from '@ekza-studio/doc';
import type { GenProvenance, GenTerms } from '@ekza-studio/gen-core';
import { sha256Hex } from '../services/assets';

/** The post steps that may alter a provider's invisible AI marks (gen-core `MARK_ALTERING_STEPS`). */
export const GEN_MARK_ALTERING_STEPS: readonly string[] = ['mesh.reduce', 'mesh.paletteBake', 'mesh.textureDownsize'];

/** The operator a step of the intake chain (`IntakeOutcome.steps[].kind`) stands for. */
export const intakeStepOp = (kind: string): string => (kind.includes('.') ? kind : `mesh.${kind}`);

/** Appends post steps (gen-core `withPostStep` for each). */
export function withPostSteps(p: GenProvenance, ops: readonly string[]): GenProvenance {
  return {
    ...p,
    postSteps: [...p.postSteps, ...ops.map((op) => ({ op, aiMarksMayBeAltered: GEN_MARK_ALTERING_STEPS.includes(op) }))],
  };
}

/** The prompt's hash as provenance records it: SHA-256 of the UTF-8 bytes (gen-core `promptSha256`). */
export function promptSha256(prompt: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(prompt) as Uint8Array<ArrayBuffer>);
}

/** The record with the prompt text, after checking it is the generation's (gen-core `withPromptOptIn`). */
export async function withPromptOptIn(p: GenProvenance, prompt: string): Promise<GenProvenance> {
  if (p.promptSha256 === null) throw new Error('This generation had no prompt.');
  if ((await promptSha256(prompt)) !== p.promptSha256) throw new Error('The prompt does not match the generation.');
  return { ...p, prompt };
}

type Ownership = GenTerms['ownership'];

/** Whether the output may be redistributed, from the terms snapshot and the attested tier (ADR 0017 §7). */
export function redistributableOf(p: GenProvenance): Redistributable {
  const terms = p.termsSnapshot;
  const paid = terms['ownership'];
  const free = terms['freeTierOwnership'];
  const ownership = (p.tier === 'paid' ? paid : p.tier === 'free' ? free : null) as Ownership | null | undefined;
  if (ownership === 'user' || ownership === 'provider-cc-by') return 'yes';
  if (ownership === 'provider') return 'no';
  return 'unknown';
}

/** The document's record of the generator (field for field, M7-GB-1). */
export function documentGenerator(p: GenProvenance): GeneratorProvenance {
  return {
    kind: 'ai',
    digitalSourceType: p.digitalSourceType,
    service: p.service,
    model: p.model,
    op: p.op,
    params: { ...p.params },
    inputSha256: [...p.inputSha256],
    termsSnapshot: Object.fromEntries(
      Object.entries(p.termsSnapshot).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
    ),
    rawSha256: p.rawSha256,
    postSteps: p.postSteps.map((step) => ({ ...step })),
    promptSha256: p.promptSha256,
    prompt: p.prompt,
    tier: p.tier,
    taskId: p.taskId,
  };
}

/** The record with the prompt when the person opted in (checked against its hash), else as it is. */
export async function promptProvenance(p: GenProvenance, prompt: string | null): Promise<GenProvenance> {
  return typeof prompt === 'string' && prompt !== '' && p.promptSha256 !== null ? withPromptOptIn(p, prompt) : p;
}

/**
 * `AssetRecord.provenance` of a generated model: origin `generated`, the generator with the post steps that ran.
 * `marksAltered` is the intake's own `aiMarksMayBeAltered` (recorded even when its steps are named differently).
 */
export function generatedAssetProvenance(
  p: GenProvenance,
  opts: { readonly postSteps?: readonly string[]; readonly marksAltered?: boolean } = {},
): AssetProvenance {
  let record = withPostSteps(p, opts.postSteps ?? []);
  if (opts.marksAltered === true && !record.postSteps.some((step) => step.aiMarksMayBeAltered)) {
    record = { ...record, postSteps: [...record.postSteps, { op: 'mesh.intake', aiMarksMayBeAltered: true }] };
  }
  return {
    origin: 'generated',
    derivedFrom: [],
    redistributable: redistributableOf(record),
    generator: documentGenerator(record),
  };
}
