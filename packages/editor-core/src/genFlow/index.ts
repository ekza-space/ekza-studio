// The Generate flow in editor-core (MODELING-PLAN §7.2 G-d; ADR 0017; DECISIONS M7-GD-*): the UI-free model both
// shells bind (`./flow`), the per-app session of jobs (`./session`), presets and providers (`./presets`), the
// provenance written on import (`./provenance`) and the `ekza.generations` link exports follow (`./table`), the
// browser re-encode of pictures (`./image`) and the plain words both shells say (`./text`). Exported from the package
// root and tree-shaken there (`sideEffects: false`): only lazy chunks import the flow, so no route's first visit
// grows; the operators' polls read the session only.
export {
  createGenFlow,
  DEFAULT_MAX_COST_USD,
  defaultGenFlowState,
  GEN_FLOW_MARKER,
  type GenFlow,
  type GenFlowHost,
  type GenFlowRun,
  type GenFlowState,
  type GenFlowView,
  genFlowOf,
  type GenImageState,
  type GenJobView,
  type GenPostState,
  type GenProviderView,
  type GenQuoteState,
  IMPORT_LABEL as GEN_IMPORT_LABEL,
} from './flow';
export {
  REENCODE_MAX_SIDE,
  REENCODE_MIN_SIDE,
  ReencodeError,
  type ReencodedImage,
  reencodeImage,
  reencodeSize,
} from './image';
export {
  GEN_PRESET_IDS,
  GEN_PRESETS,
  type GenFlowOp,
  type GenPreset,
  type GenPresetId,
  isGenPreset,
  presetParams,
  providerFor,
} from './presets';
export {
  documentGenerator,
  GEN_MARK_ALTERING_STEPS,
  generatedAssetProvenance,
  intakeStepOp,
  promptProvenance,
  promptSha256,
  redistributableOf,
  withPostSteps,
  withPromptOptIn,
} from './provenance';
export {
  GEN_REASONS,
  GEN_TERMINAL_STATES,
  type GenAvailability,
  type GenImported,
  type GenJobEntry,
  type GenSession,
  type GenSessionState,
  genSessionOf,
  isActiveJob,
  isTerminalState,
  peekGenSession,
} from './session';
export {
  badgeOf,
  ensureGenerationTable,
  exportedGenerator,
  type GenBadge,
  generatedMeshes,
  GENERATIONS_TABLE,
  GENERATIONS_TABLE_DEF,
  type GenerationRecord,
  generationIdOf,
  generationRecords,
  generatorOfExport,
  meshGenBadge,
  putGeneration,
  validateGeneration,
} from './table';
export {
  capsText,
  GEN_PRESET_LABELS,
  GEN_TEXT,
  jobStateText,
  provenanceBadgeText,
  quoteLine,
  type TermsBadge,
  termsBadges,
} from './text';
export type {
  GenImportArgs,
  GenImportResult,
  GenIntakeOutcome,
  GenJobArgs,
  GenJobResult,
  GenSubmitArgs,
} from './types';
