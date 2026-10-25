# Ekza Studio — Animation layers (ANIM-LAYERS)

Status: v1.0 (2026-10-25), build spec of branch `feat/anim-layers`. Decision record: [ADR 0026](adr/0026-animation-layers.md);
build decisions: [DECISIONS-OPEN §W](DECISIONS-OPEN.md) rows `AL-*`; as built: [wp-notes/anim-layers.md](wp-notes/anim-layers.md).
Inputs: research 01 NL-02 (the canonical layer feature list), REQUIREMENTS FR-CLIP-06, ROADMAP M5, ARCHITECTURE §4.4
and §5, ADR 0003 (Euler + rotate order, quaternions after sampling), ADR 0005 (export resamples LINEAR), ADR 0013
(history), STUDIO-TOUCH-SPEC §10.

The owner's case (2026-10-25): *put a finished animation on the character, then fix it — raise the hands, tilt the
body — on a layer above it, the way classic DCC animation layers work.* The base animation (a library Walk) stays
intact; the fixes live on a layer that can be weighted, muted, soloed and merged.

## 1. Model

A clip owns an ordered stack of layers (`LayerRecord`, ordered by fractional `order`; the lowest is the **base**).
Every curve belongs to exactly one layer (`(clip, layer, control, channel)`, unchanged). The schema version does not
change (§7).

| Field | Base | Other layers |
|---|---|---|
| `name` | `Base` | 1–64 characters, unique in the clip (*Fixes*, *Fixes 2*, …) |
| `mode` | `override` (fixed) | `additive` (default) or `override` |
| `weight` | 1 (fixed) | static 0…1, clamped at evaluation |
| `mute` | yes | yes |
| `solo` | yes | yes |
| `locked` (new, optional) | yes | yes — no edit may change the layer's curves or keys |
| `mask` (new, optional) | — | the controls the layer affects (a body-part choice in the UI); absent = every control |

A **playing** layer contributes to evaluation: not muted; when any layer is soloed, only the soloed layers and the base
play; a non-base layer with weight 0 plays nothing. The base, muted, leaves the channel defaults (the rest pose) under
the other layers.

The **active layer** is session state (U) per clip, default the base. Keying, Auto Key, ◆ Key, the Dope Sheet, the
Graph Editor, the time slider's key ticks and Halo's Thread, Keys and Curves all address the active layer.

## 2. Evaluation

Per control, the composite starts from the channel defaults and folds the playing layers in stack order. A layer only
touches the channels it has a curve for (passthrough elsewhere). With `w` the layer's weight and `y` the layer's
channel value (`staticValue ?? identity` for a key-less curve):

| Mode | Translate (`tx ty tz`), attributes (`@…`) | Rotate (`rx ry rz`, Euler in the control's rotate order) | Scale (`sx sy sz`) |
|---|---|---|---|
| Additive | `v + w·y` | per component `e + w·y` | `v · (1 + w·(y − 1))` |
| Override | `v + w·(y − v)`; `w = 1` copies `y` | `w = 1`: the present components are copied; else `slerp(q(e), q(e'), w)` back to Euler with `eulerNear` around the component lerp, where `e'` is `e` with the layer's present components | `v + w·(y − v)` |

- Identity values of an additive layer: 0 for translate, rotate and attributes, 1 for scale; an override layer's
  key-less curve without a static value gives the channel default.
- The base layer (override, weight 1) **copies** its values, so a clip with only a base layer evaluates bit-identically
  to the single-layer sampler: same `ChannelBuffer`, same pose, same exports.
- **Rotation accumulation** (ADR 0026): additive rotation adds Euler angles per component in the control's rotate
  order. It keeps a layer's curves readable as offsets (*+10° bend*) and makes keying linear and exact; it is not
  rotation composition, so large deltas on several axes depend on the rotate order and can meet gimbal effects. The
  alternative — quaternion accumulation `q_below · slerp(1, q_layer, w)` — is order-independent but makes layer curves
  non-additive per channel, keying non-linear, and the Graph Editor's deltas unreadable. Quaternion accumulation per
  layer is a later option (research 01 NL-02 "per layer (quaternion)").
- Blending lives in `anim-core` (`composeLayerTrs`, `solveLayerTrs`: pure, allocation-free); `rig`'s `ClipSampler`
  plans the playing layers once per structural change and folds them per frame. `value`, `keyTimes` and `curveInfo`
  report the composite (union of the playing layers), so the bake's step schedule and influence sets see every layer.
- **Budget**: with 3 layers on a 60-control rig, sampling + pose evaluation stays within 2× the single-layer time
  (measured, `rig/bench`, recorded in the wp-note).

## 3. Keying on a layer

A key on the active layer stores the value that makes the composite equal what the person posed (*posing on a layer
just works*): the channel edit path (`applyChannelEdits`: manipulators, Channels, reset, paste, mirror, plant feet)
and `key.set` convert the posed composite value `D` into the layer value `x` with every other layer unchanged:

- the layers above the active one are inverted top-down (additive: subtract / divide; override at `w < 1`: the lerp's
  inverse, the slerp's inverse for rotations), then `x` solves the active layer's own blend against its input;
- translate, scale and attributes are always closed-form (per component, affine); rotation is closed-form when every
  blend from the active layer up is separable (additive, or override at `w = 1`), otherwise a Newton solve on the
  triple; when a slerp is involved the triple is written together;
- an additive layer therefore keys **deltas**: posing the arm 10° further than the Walk keys `+10°`; `key.set` on an
  untouched channel keys 0 (scale 1).

Refusals, with plain reasons (poll and toast): the active layer is muted (*"Fixes is muted — unmute it to key"*), not
playing because another layer is soloed, has weight 0, is locked, or is fully covered by an override layer above at
weight 1 (*"Override layer Hands covers this channel"*).

**Auto Key** (`keyed-only`) treats a channel as keyed when it has keys on the active layer **or on any playing layer
below it**: on *Fixes* over a Walk, every animated channel keys at the playhead. A new key on a fresh layer holds
before and after it (constant infinity), as in classic DCCs; a fix is bracketed by keys.

## 4. Operators (editor-core)

One undo step each, polls with plain reasons, `flags: { undo: true }`; session-only ops (`layer.setActive`) are not
undoable.

| Operator | Args | What |
|---|---|---|
| `layer.add` | `{ clip?, name?, mode?: 'additive' \| 'override', weight?, activate? }` | A layer on top of the stack (default additive, weight 1, *Layer 1…*); active unless `activate: false` |
| `layer.remove` | `{ layer }` | Deletes a non-base layer with its curves and keys; active → the layer below |
| `layer.setActive` | `{ layer }` | Session: the layer keys go to |
| `layer.set` | `{ layer, weight?, mute?, solo?, locked?, mode?, name?, mask? }` | One field-merge patch; the base takes only `mute`, `solo`, `locked`; mode changes are refused on a layer with curves (*"Merge or clear it first"*: a mode switch would change what plays) |
| `layer.reorder` | `{ layer, to: 'up' \| 'down' \| index }` | Moves a non-base layer; the base stays lowest |
| `layer.duplicate` | `{ layer }` | Copy with curves and keys, above the source, *Name copy* |
| `layer.merge` | `{ layer?, scope: 'down' \| 'all', times?: 'keys' \| 'frames' }` | Bakes into the layer below (`down`) or every playing layer into the base (`all`); `keys` (default) writes at the union of the merged curves' key times per control (rotation as a triple), `frames` on every frame of the clip range; the merged layers are deleted; active → the target. Muted layers are not merged (down: refused; all: they stay) |
| `clip.adjustOnLayer` | `{ clip? }` | *Adjust on a layer*: an additive layer *Fixes* (*Fixes 2*…) on top, active; the base untouched |

Agents (MCP, `agent-tools`, toolset `1.0.0-mvp.4`): `layer_add`, `layer_set` (weight, mute, solo, lock, name, move)
and `layer_merge` (Edit access; `scope: 'all'` confirms, as other bulk rewrites do); each returns the clip's stack.
The operator policy classifies every layer operator (`layer.remove` confirms; `layer.setActive` is View). The agents'
key and pose tools keep writing the **base layer** (raw values, as in M-AI); an agent run never changes the layer the
user keys into (`activeLayer` is a protected session field) unless it has the View grant. *Match Range* (IK/FK) is
refused on clips with more than one layer (its per-frame bake would need the layer solve).

## 5. UI

**Studio Pro** — a compact **Layers** panel in the Animate workspace (bottom dock beside the Dope Sheet; a lazy panel):
Base plus the layers top-down, each row: name (double-click renames), mode badge (*Add* / *Over*), weight field and
slider (0–1), **M** (mute), **S** (solo), lock, the active row highlighted; header buttons **+** (add), *Adjust on a
layer*, *Merge ▾* (down · all, keys · frames), duplicate, delete. Edit › *Animation Layers* items and the Channels
panel's header show the active layer.

**Halo** (Ekza Studio) — its own module `halo/src/layers/**`, mounted through the smallest seam:

- a **layer chip** above the Thread (the Animations row's end) saying where keys go (*Keys → Fixes*); tapping it opens
  the **Layers sheet** (rows as Pro's, 44 pt targets; *+ Layer*, *Merge ▾*);
- *Adjust on a layer* is a petal on the animation chip's Halo (`clip.adjustOnLayer`);
- the layer chip's Halo: *Mute · Solo · Lock · Merge down · Delete*, and ⟨Weight⟩ as an Echo chip (0–100 %);
- frames stay the default unit (ST-T7-UNIT, ST-T10-RULER).

Every new operator has a Disclosure Manifest entry; the `searchOnly` baseline does not rise.

## 6. Export

Exports bake through the layered `ClipSampler` (ADR 0005: integer clip frames, LINEAR), so a VRMA, an animation GLB, a
surgeon bake and a character package carry exactly what plays (muted layers excluded). With only a base layer the
bytes are unchanged; golden tests pin both: the committed hashes of the single-layer exports, and *export ≡ the
evaluated pose at every frame* for a layered clip.

## 7. Project file

Layers already persist (`layers` table, partition `clip:<id>`). `locked` and `mask` are **optional** fields: absent on
every record written so far, validated when present, preserved by older apps (unknown fields survive, ADR 0011). The
schema and table versions stay; no migration. An older app opening a layered project plays the base only.

## 8. Tests

- anim-core: additive and override, weights, rotate orders (all six), slerp continuity, solve ∘ compose = identity.
- rig: the sampler over a stack (mute, solo, weight 0, mask), bit-identity of a single base layer, the bench.
- editor-core: every operator headless (one undo step, polls), keying deltas through additive and override stacks,
  merge down / all (keys and frames), auto-key's keyed rule.
- headless golden: the single-layer export bytes unchanged; a layered Walk's VRMA ≡ the evaluated motion.
- e2e: the journey (library Walk → *Adjust on a layer* → frames 10 and 30: raise the right arm, tilt the torso →
  weight 0.5 → mute, unmute → merge; the base keys unchanged until the merge; the export ≡ the evaluated motion) on
  `chrome` (Pro) and `chrome-touch` (Halo).
