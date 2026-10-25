# ADR 0026 — Animation layers: additive and override, Euler accumulation, keying deltas on the active layer

- Status: Accepted (2026-10-25, [ANIM-LAYERS-SPEC](../ANIM-LAYERS-SPEC.md) v1.0)
- Inputs: research [01](../research/01-dcc-animation-features.md) NL-02, REQUIREMENTS FR-CLIP-06, ARCHITECTURE §4.4
  and §5, [ADR 0003](0003-time-rotation-and-curve-engine.md), [ADR 0005](0005-export-strategy.md),
  [ADR 0011](0011-project-file-format.md), [ADR 0013](0013-editor-history.md); the owner's request of 2026-10-25.

## Context

The document has carried `clip → layers → curves` since M1, with one base layer evaluated (ARCHITECTURE §4.4). The
owner wants classic DCC animation layers: put a finished (library) animation on the character and fix it on a layer
above, which can be weighted, muted, soloed and merged, without touching the base. Four things need deciding: how
layers blend (and how rotations accumulate), what a key on a layer stores, what the exports carry, and whether the
project file changes.

## Decision

1. **Two modes.** *Additive* adds translate, attributes and Euler rotation per component and multiplies scale
   (`v·(1 + w·(y − 1))`). *Override* lerps translate, attributes and scale toward the layer and slerps rotation
   (`eulerNear` around the component lerp keeps the Euler branch continuous); at weight 1 it copies the layer's values.
   A layer affects only the channels it has curves for (passthrough), and only its masked controls when it has a mask.
2. **Euler accumulation for additive rotation**, in the control's rotate order. Curves on a layer read as offsets
   (*+10° bend*), keying is linear and exact, and the Graph Editor shows deltas that add up. Trade-off: it is not
   rotation composition — large multi-axis deltas depend on the rotate order and can meet gimbal effects, which the
   per-joint rotate orders of research 07 keep away from the common fixes (bend, tilt). Quaternion accumulation
   (`q_below · slerp(1, q_layer, w)`) is order-independent but makes per-channel deltas meaningless and keying
   non-linear; it stays a later per-layer option.
3. **Keying goes to the active layer** (session state per clip, default the base) and **stores the value that makes
   the composite equal the pose**: on an additive layer, the delta. One inverse function (`solveLayerTrs`, anim-core)
   serves the channel edit path, `key.set` and merges; it is closed-form wherever the blend is separable and a Newton
   solve on the rotation triple where a partial-weight override slerp is involved. Edits that cannot reach the
   composite (muted, weight 0, locked, covered by a full override above) are refused with plain reasons.
4. **One evaluation path.** `rig`'s `ClipSampler` folds the playing layers, so the viewport, the Channels panel, the
   bake and every export see the same composite. The base (override, weight 1) copies its values: a single-layer clip
   samples, poses and exports bit-identically to M1–M7 (golden tests).
5. **Merge bakes what plays**: down into the layer below, or all into the base; at the merged curves' key times
   (default) or on every frame; the merged layers are deleted in the same undo step.
6. **No schema change.** `locked` and `mask` are optional `LayerRecord` fields; older apps keep them and play the base.

## Alternatives

- Quaternion accumulation for additive rotation (decision 2): rejected for the MVP of layers, kept as a later option.
- Keying the raw value on any layer (no inverse): posing on an additive layer would double the base pose; rejected.
- Storing the active layer in the document (some DCCs keep it in the scene): it is per user (ARCHITECTURE §4.1, R12).
- A schema bump with required `locked` / `mask` fields: a migration for two booleans' worth of data; optional fields
  are what ADR 0011's unknown-field rule already supports.
- Keyable layer weight curves: deferred (a static weight is the minimum of NL-02); they would be a curve on a layer
  pseudo-channel and need no schema change either.

## Consequences

- A clip's motion is no longer readable from its base curves alone; readers that mean *what plays* use the sampler
  (`value`, `keyTimes`, `curveInfo`), readers that mean *what the person edits* use the active layer.
- Clip-level rewrites that walk every curve (fps keep-seconds, duplicate) cover every layer; the rotate-order change
  converts each layer as rotations and is refused on controls with additive rotation curves (*merge first*).
- Per-user layers (P3, `owner`) can reuse the stack unchanged.
