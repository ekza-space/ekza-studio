# ANIM-LAYERS — animation layers in Studio Pro and Ekza Studio (`feat/anim-layers`)

The owner's request (2026-10-25): put a finished animation on the character (for example from the library), then fix
it — raise the hands, tilt the body — on a layer above it, as classic DCC animation layers do. The base stays intact;
the fixes sit on a layer that can be weighted, muted, soloed and merged. Branch off `dev` `5689ba17`; `origin/dev`
`b3fb0986` (the Halo ◆ Key button) merged at `afec7081`. Spec [ANIM-LAYERS-SPEC](../ANIM-LAYERS-SPEC.md) v1.0,
[ADR 0026](../adr/0026-animation-layers.md), decisions [DECISIONS-OPEN §W](../DECISIONS-OPEN.md) `AL-1` … `AL-16`.

## What landed

| Part | Where | What |
|---|---|---|
| Blending | `anim-core/src/layers/blend.ts` | `blendLayerTrs` / `blendLayerSlot` / `blendOverrideRotation` (allocation-free folds: additive adds translate and Euler per component, multiplies scale; override lerps, slerps rotation with `eulerNear` around the component lerp, copies at weight 1), `composeLayerTrs`, and the inverse `solveLayerTrs` / `solveLayerScalar` (closed-form where separable, Newton on the rotation triple through a partial-weight override slerp, unreachable slots NaN, a forward check of coupled rotations) |
| Evaluation | `rig/src/sampler/{cache,layers}.ts`, `rig/src/schedule/influence.ts` | The `ClipSampler` folds the playing layers (`playingLayers`: mute, solo keeps the base, weight 0, masks); the base copies — the M1 code path; `value`, `keyTimes`, `curveInfo` report the composite; `controlStackAt` / `attrStackAt` give one control's stack to the editor (keying, readouts, merges); IK activity reads several `@ikFk` curves |
| Document | `doc/src/records.ts`, `records/validate.ts` | `LayerRecord.locked?`, `mask?` — optional, validated when present; no schema or table version change |
| Edit kernel | `editor-core/src/edit/layers.ts`, `edit/{channels,keys,ripple,tween}.ts`, `evaluation/service.ts`, `session/*`, `workflows/targets.ts` | `SessionState.activeLayer` (per clip); `editLayerOf`, `isCurveLocked`, `layerKeyProblem`, `channelKeyedAtOrBelow`, `solveLayerValues`; `applyChannelEdits` and `key.set` key the solved layer value (deltas on additive layers); `ensureCurve` targets the edit layer; the Channels readout, `channelState` and `channelValues` read the composite on layered clips; key edits, Graph Editor targets, ripple, next/previous key, tween, mirror animation and *Only changed channels* address the active layer; time insert/remove moves every layer |
| Operators | `editor-core/src/operators/builtin/{layer,layerBodies}.ts`, `args.ts`, `menus.ts`, `ik.ts`, `agentCommon.ts`, `agentImpl.ts`, `actorRun.ts` | `layer.add`, `layer.remove`, `layer.setActive`, `layer.set`, `layer.reorder`, `layer.duplicate`, `layer.merge` (down / all × keys / frames), `clip.adjustOnLayer`; the Clip menu's three items; *Match Range* refused on layered clips; agent explicit-target writes stay on the base; `activeLayer` is a protected session field |
| Agents | `agent-tools/src/tools/layers/**`, `policy.ts`, `tools.manifest.json`, `docs/agent-tools-reference.md` | `layer_add`, `layer_set`, `layer_merge` (toolset `1.0.0-mvp.4`), the policy rows, the `layer` noun in the schema lint |
| Studio Pro | `editor/src/panels/layers/**`, `panels/index.ts`, `shell/layout.ts`, `curve-editor/src/{dopesheet/rows,timeline/keys,channel-tree/buildChannelTree}.ts`, the three controllers' session watches | The lazy **Layers** panel (Windows › Layers); the Dope Sheet, Graph Editor and time slider show the active layer's keys |
| Ekza Studio | `halo/src/layers/{model,LayerChip,LayersSheet}.tsx`, `i18n/layers.ts`, the manifest (`AL` owner, `layers` sheet, `layerChip` chrome), the verb table's clip petal, `stages/animate/DockedHalo.tsx`, `thread/strip/{Thread,KeyButton,model}.tsx`, `thread/curves/model.ts`, `shell/stageParts.ts` | *Adjust on a layer* petal (opens the Layers sheet once layered), the layer chip and its Halo (only while Keys or Curves is open), *Keying into: Fixes* in ◆ Key's hold, the Layers sheet; the Thread's dots, ◆ Key's diamond and Curves read the active layer |
| Test API | `editor/src/test-api/{types,createTestApi}.ts` | `layers(clip?)` (additive): the stack, the active layer and each layer's curve ids (`curves()` unchanged) |
| Tests | below | |

## Evaluation budget (§2)

`rig/test/layers.test.ts` › *bench*, sample + `RigProgram.evaluate` per frame, the rich humanoid's auto-rig (60
controls), base keyed on all 9 channels × 30 keys, best of three (reported, not a gate):

| Stack | Time | vs 1 layer |
|---|---|---|
| Base only | ≈ 40 µs | 1.00× |
| + 2 fix layers on 12 controls each (additive, override 50 %) | ≈ 48 µs | **1.2×** |
| + 2 additive layers on every control's rotation | ≈ 65–70 µs | 1.6–1.75× |
| + additive and override 50 % on every control's rotation | ≈ 78–80 µs | 1.97–2.02× |

The extreme case (a partial-weight override slerp on every control of the rig) sits at the 2× line: ~14 µs of it is
the slerp and its Euler round trip (~230 ns a control); the rest is the doubled curve count.

## Golden and export evidence (§6)

- `headless-tests/test/layers.export.test.ts`: the single-layer exports of Seed-san with the library's Walk —
  **VRMA `6d39ebf8…`, animation GLB `136abaca…`, surgeon bake `d4e83ce1…`** — and the character writer's VRM of the
  ready body character **`c6726900…`** are the hashes of dev `5689ba17` (computed there with the same setup before
  any layer code existed); an empty layer, a muted keyed one and a weight-0 keyed one leave the bytes unchanged.
- The VRMA read back (`io.readVrma`) against the evaluated pose's normalized rotations at every sample: **8.0e-8 rad**
  over 882 samples for the Walk alone and **8.0e-8 rad** over 921 samples with the fix layer (float32 rounding): the
  export is what plays.
- Merge on every frame: the base alone then plays the layered motion at every frame within 1e-9 rad; at the keys:
  exactly at the fixed frames.

## The journey

| Run | Result |
|---|---|
| Headless (`headless-tests/test/layers.export.test.ts`, production kernel, Seed-san + library Walk) | Adjust on a layer → frames 10 and 30: R upper arm Side −35°, spine Bend +8° → base keys byte-equal → weight 0.5 (between) → mute: the Walk's VRMA bytes → unmute: the half-weight bytes → merge (keys): one layer, the fixed frames as played → undo → merge (frames): every frame as played. **Green** |
| `chrome`: `apps/web/e2e/al-01-layers-pro.spec.ts` | The Layers panel: *Adjust on a Layer* (one step), the keys only on Fixes at 10 and 30, base unchanged, weight field 0.5 (*Layer Weight*), M: the Walk's own VRMA, M again: the half-weight VRMA, *Merge Down (every frame)*: layered vs merged VRMA within 1e-5 rad, undo restores the layer and the base. **Green** |
| `chrome-touch`: `apps/web/e2e/ha-al-layers.spec.ts` | The Walk chip's Halo › *Adjust on a layer* (the Halo closes); Rec keys the fix into Fixes; at rest no chip, the at-rest count unchanged; on a 390 × 844 phone ≤ 20 at rest and ≤ 28 with a part selected; ◆ Key's hold: *Keying into: Fixes* → the Layers sheet; Keys open: the chip names Fixes, its Halo's ⟨Weight⟩ to 50 % (five steps), Mute: the Walk's bytes, Mute again; *Merge down*: one layer. **Green** |

Screenshots for the review (not committed): `layers-pro-panel.png`, `layers-pro-before.png` / `layers-pro-after.png`
(frame 10, Fixes muted / playing), `layers-halo-adjust.png`, `layers-halo-chip.png`, `layers-halo-sheet.png`.

## Gate

See the final section below (filled after the run).

## Follow-ups

- Keyable layer weights (AL-3) and quaternion accumulation as a per-layer option (AL-2).
- *Match Range* through the layer solve per frame (AL-12); the rotate-order change on additive deltas.
- Masks have no UI yet (the operator and the evaluation take them): a body-part picker in the Layers panel and sheet.
- Per-user layers (P3, `owner`) reuse the stack as it is.
