# Halo T8: the Make and Paint stages (`halo/t8-make-paint`)

Spec references:
- [STUDIO-TOUCH-SPEC](../STUDIO-TOUCH-SPEC.md) §4.2 B, §4.8, §5.5, §6.2, §7.1, §9 J2 / J6, §11, §13.1, §21 (T8 row) and
  §22 (AS-ST-4, AS-ST-5, AS-ST-17).
- [ADR 0023](../adr/0023-studio-touch-ui.md); [DECISIONS-OPEN §P](../DECISIONS-OPEN.md) rows `ST-T8-1` … `ST-T8-17`.

Branch history:
- Branched from `dev` `582aa335` (T6-INT).
- Parked as a WIP commit when animation became the priority.
- Resumed on 2026-10-24 with `dev` `22b007b6` (T7) merged in, then `b045af2f` (T11).

**The owner's focus (2026-10-24).** The focus is a turnkey AI pipeline on iPad, for characters and props alike:
1. A prompt or a photo goes to a 3D generator.
2. The model is cleaned up.
3. The user tweaks it by hand.
4. Auto-Rig, then animation.

So T8 builds, in this order:
- **Make** as the clean-up stage for an imported or generated model (J2 as specced).
- **Create with AI**: an entry and a placeholder sheet.
- **Paint**: the palette and colour as specced (J6).

## What landed

| Part | Where | What |
|---|---|---|
| The stage-parts seam | `shell/stageParts.ts`, `shell/StageLayer.tsx`; one-line hooks in `shell/{Tray,Frame,controller,prefetch}` | Each stage package exports `{Tray, Layer, install}` lazily (`STAGE_MODULES`). The tray slot renders the stage's tray, and the stand-in tray is the Suspense fallback. The frame renders the stage's canvas layer under the Halo layer. The controller runs every module's `install` once per mounted shell and registers the stage packages' sheets (`STAGE_SHEETS`). The test API's `halo()` gains the registered slices (`make`, `paint`). T9 adds one line for Rig. |
| Make's tray | `stages/make/Tray.tsx`, `kit.tsx`, `state.ts` | Controls, in order:<ul><li>selection level `[Whole │ Points │ Edges │ Faces]`;</li><li>*Drag ▾*: Select, Move, Turn, Scale, *Select area*, Snap to grid, Falloff;</li><li>*Create with AI*;</li><li>*Mirror edits*, shown with a shape selected;</li><li>*Cut ▾*: Multi-cut, Loop cut, Slide, Last tool again;</li><li>*Clean up ▾*: Clean up for a game ▸, Reduce to a budget ▸, Stand up and size, Colours to swatches, Smaller textures, Tidy the geometry, Merge close points, Separate the parts;</li><li>*New shape ▾*: the six primitives and the Smooth / Blocky body starts;</li><li>the pinned ⋯.</li></ul>An empty scene shows *Smooth body · Blocky body · Create with AI · Bring a model* instead. |
| Clean-up through G-a's operators, by id | `stages/make/cleanup.ts` | Uses G-a's final contract (M7-GA-CONTRACT-1…6):<ul><li>`mesh.intake {preset}`;</li><li>`mesh.reduce {preset}` (`triangles` left to the preset);</li><li>`mesh.normalize {height: null}`;</li><li>`mesh.paletteBake {colours: 16}`;</li><li>`mesh.textureDownsize {size: 1024}`.</li></ul>These rows stay greyed (*Not in this build yet*) until G-a lands, and nothing in Halo stubs them. `PENDING_OPERATORS` (manifest/types) lets the verb table name them before their manifest entries land. |
| A part's Halo (the verb table's mesh row) | `verbs/table.ts`, `stages/make/install.ts` | Mesh: *Edit shape · Move · Separate · Delete · Reduce ▾ · Rig it*. Reduce ▾'s choices are Prop ≤ 500 · Character ≤ 3k · Hero ≤ 10k. Faces gain *Separate* (Extract) and edges gain *Delete* (Delete Edge & Vertices). Duplicate, Mirror and Paint move to the mesh's More. |
| The extrude cap handle | `stages/make/CapHandle.tsx`, `geometry.ts`, `useProjected.ts` | ST-T8-1: one 52 px handle 112 px out along the cap's projected normal. It drives `app.extrude.beginAbsorb('move', 'component')`: one Adjust Last per drag, and the session keeps its args stack and zero-drop. The Thumb key's *Smart* starts `beginSmartExtrude`, and *Fine* scales ×0.1. It follows the camera every frame. |
| The Inset / Bevel value handle | `stages/make/ValueHandle.tsx` | Beside the result: a card preview (`beginCardPreview`) while the finger moves, then one `edit.adjustLast`. |
| Component nouns' box | `stages/make/install.ts` (`bindNoun` box) | The Halo, breadcrumb and chips sit beside the selected components' projected points *and* the handles, never over them (AS-ST-18). |
| Select area | `stages/make/install.ts` (an `addHaloClaim`) | Drags on the canvas go to the select tool, which marquees, even over the model. The camera does not move. |
| Mirror edits on for character templates | `stages/make/install.ts` | After `mesh.create.template` with `humanoidBody` / `humanoid`, `model.symmetry.set {object-x}` runs on the new meshes (§11 "on by default for templates"). This is U state, never a step. |
| Reference image planes as a canvas noun | kernel: `editor-core` `select.imagePlane`, `model.imagePlane`, `select.objects` clears it; viewport `imagePlaneAt`; Halo: `verbs/nouns.ts`, `halo/grammar.ts` (tap hook), `sheets/scene/model.ts` | A tap on a reference in the view that shows it selects it. So does its Scene row. The plane's Halo opens Opacity and Size in Numbers, and runs Lock / Unlock, Hide and Delete on it. |
| *Create with AI* | `stages/make/ai/**`; Home's starts (`home/Home.tsx`, one `<li>`) | A lazy sheet with:<ul><li>a 16 px prompt;</li><li>*Attach a photo* (PNG, JPEG, WebP, HEIC: the iPad offers the camera, the library and Files);</li><li>the size presets.</li></ul>It says plainly that AI generation is not connected on this build, and *Create* stays off until `services.generation` exists (G-d wires `gen.*` through G-b/G-c's `GenerationClient`). Entries: Make's tray, the empty Make stage, and Home › Make a character as a 4th start. |
| Paint's tray | `stages/paint/Tray.tsx`, `model.ts` | Controls:<ul><li>up to five swatches with the active one kept in view;</li><li>`+n` (the palette sheet) or *New swatch* and the palette chip;</li><li>*Pick*, the Thumb key's *Pick colour* for one tap, which claims the press so the brush never starts;</li><li>*Fill part*, the Thumb key's lock (one state, §5.5);</li><li>⋯.</li></ul>When no target can be coloured, the tray says plainly: *"Painting imported meshes arrives later"* (the kernel refuses, §3 P12). It offers *Use the starter colours* when there is no palette. |
| The swatch noun | `stages/paint/install.ts` (`bindNoun('swatch', {docked})`) | The first tap makes a swatch active and opens its Halo. A long-press opens the Halo without changing the active swatch. The Halo docks as a verb bar above the tray, between the off-hand column and the puck, and outlasts strokes and taps on the model. Its verbs:<ul><li>*Edit colour* and *Rename*: the palette sheet at that swatch;</li><li>*Finish ▾*: Matte · Shiny;</li><li>*Select faces* (`select.mesh.bySwatch {slot}`);</li><li>*Replace with active* (`mesh.paint.remap`).</li></ul> |
| The palette sheet | `sheets/palette/**` | The swatch being edited:<ul><li>the system colour picker;</li><li>hex and name fields;</li><li>Finish, with Gloss for Shiny;</li><li>Select its faces;</li><li>Colour the selection with a new swatch;</li><li>Remove;</li><li>Replace with the active swatch.</li></ul>Then every swatch (a tap makes one active; *New swatch*), the palettes (New, Duplicate as a variant, Rename, Use for the selected shapes) and *Colours as*. |
| Make editable's report | `stages/make/report/**` | `ui.open {makeEditableReport}`: `lastMakeEditableReport` at touch density. |
| ▾ petals' choices | `halo/ChoiceRow.tsx`; seams in `verbSource`, `run`, `store` (`sub`), `HaloLayer` | A ▾ petal shows its choices in one row beside the Halo, and a choice is one more touch: *Finish ▾ › Shiny*, *Merge ▾ › to centre*, *Mirror ▾ › Left to right*. A ring closes into the arc that holds them. |
| Words | `i18n/make.ts` (+ `verbs.notInBuild` in `en.ts`) | The stages' own catalogue, as T7's `animate.ts`. The vocabulary lint is in `test/make-paint.test.ts`. |
| e2e | `apps/web/e2e/{ha-08-make,ha-09-paint,ha-J2-model,ha-J6-colour}.spec.ts`, `helpers/halo-make.ts` | Listed under Exit test below. |

## The cap handle, prototyped first (ST-T8-1)

**Question.** Can a finger use Studio Pro's polyExtrude manipulator? It has X / Y / Z arrows, rings, scale cubes and the
space toggle, drawn by the topology runtime at `tools.manipulatorSize`.

**Measured on `chrome-touch`.** After *Pull* on the Cube Lad's hips, a finger dragged 60 px from 54 px out along Pro's
Z arrow:
- the **camera orbited**;
- `localTranslateZ` stayed `0`.

Why:
- `ViewportManager.pickCandidates` reports only the W/E/R kit's handles. The extrude manipulator's handles are the
  topology runtime's, so the arbiter's claim never sees them and the press orbits (§5.1).
- The manipulator is also not scaled for touch: `setManipulatorScale` multiplies the kit only.
- Its 6–10 px pick radii sit 20–30 px apart, too dense for a fingertip.

**Result.** Halo draws its own cap handle as frame chrome:
- 52 px, 112 px out along the cap's projected normal, beyond Pro's arrow;
- straight up when the normal faces the camera;
- a dashed line ties it to the cap.

It runs the same kernel path as Pro's Z arrow (`beginAbsorb('move','component')` → `update({translate})` → `commit()`),
so the extrude session's semantics are unchanged:
- one Adjust Last per drag;
- the args undo stack;
- the zero-drop;
- *Smart* at drag start (`beginSmartExtrude`, from the Thumb key's drag meaning).

Pro's manipulator stays drawn under it for the Pencil and the mouse.

Evidence: `ha-08` › *the cap handle* (two drags = one step; Smart = a new extrude); `test/make-paint.test.ts` (geometry);
`ha-J2`.

**Follow-up for Studio Pro (ST-T8-2).** Pro on touch has the same gap. The arbiter should claim manipulator handles,
which needs a public hit test of the topology runtime's handles. With it, a touch Pro could drag the polyExtrude
manipulator.

## Exit test (T8 row)

| Check | Result |
|---|---|
| J2 ≤ 9, from a fresh project with the real defaults | **9** (`ha-J2`):<ul><li>Home › Make a character › Smooth body (2);</li><li>Faces (1) → a face (1) → Pull (1);</li><li>the cap handle (1);</li><li>⟨Segments⟩ scrubbed to 2 (1);</li><li>Bevel in the reduced Halo (1) → its handle (1).</li></ul>Mirror edits is on from the template. |
| J6 ≤ 8 + strokes | **8** (`ha-J6`): 7 in the browser + iOS's *Save*.<ul><li>Path › Paint (1);</li><li>a swatch (1);</li><li>strokes (not counted);</li><li>Finish ▾ › Shiny (2);</li><li>Share › Game engine › Export (3).</li></ul> |
| J6 finger-only ≤ 10 | **10** (`ha-J6f`): 9 + iOS's *Save*.<ul><li>Path › Paint;</li><li>a swatch;</li><li>Fill part;</li><li>a tap on the part;</li><li>Finish ▾ › Shiny;</li><li>Share › Game engine › Export.</li></ul> |
| The operator sequences Halo emits export bytes equal to Pro's (§22) | Each journey replays, in Studio Pro on a fresh project, the operators Halo ran, then exports the same static GLB request. **Byte-equal**:<ul><li>J2 `57bad5610d48…`: the template, Mirror edits, the face selection, `mesh.extrude` with the cap's and chip's final arguments, `mesh.bevel` with the handle's;</li><li>J6 `0e6e55827817…`: the stroke's `mesh.paint`, then `palette.setSwatch {shader: 'blinn'}`;</li><li>J6f `3330e620f200…`: `mesh.paint.fillShell`, then the finish.</li></ul> |
| ha-08 / ha-09 green on `chrome-touch`, boot on `webkit-ipad` | `ha-08`: 5 tests on chrome-touch:<ul><li>the tray and a part's Halo on the Cube Lad: G-a's Reduce greyed with its reason, Move by finger on the ring, Delete;</li><li>Select area by finger, and Multi-cut's session;</li><li>the cap handle;</li><li>the reference plane;</li><li>Create with AI.</li></ul>`ha-09`: 4 tests:<ul><li>the swatch row and its docked Halo, Fill part = Thumb lock, Pick;</li><li>the palette sheet;</li><li>the imported-model refusal;</li><li>WebKit boot.</li></ul>On webkit-ipad, Create with AI and Paint's swatch Halo pass. |
| `searchOnly` to the T8 target | **58 → 42** (T8 removed its 16 items). `live` 353 (`select.imagePlane` added), `reachable` 302. `BUILT_OWNERS` + T8 (P-T6B-5). |

**Visible targets** (`halo().visibleTargets`, iPad landscape 1194 × 834, §4.8):

| State | Count | Budget |
|---|---|---|
| Make at rest | **22** | 22 |
| Make with Pull's chips, the reduced Halo, the session bar and the cap handle | **36** | 36 |
| Paint at rest | **22** | 22 |
| Portrait: Make at rest / with Pull | 22 / 35 | 22 / 36 |
| Phone (best-effort, not gated) | 17 / 30 | — |

Screenshots: `t8-ipad-landscape-*.png`, `t8-ipad-portrait-*.png` and `t8-phone-*.png` in the session's scratchpad
`halo/`. They cover:
- make-empty, make-rest, make-cleanup, make-part-halo;
- make-pull, make-bevel;
- paint-swatch;
- create-ai.

## Kernel and viewport changes (coordinated here, P-T6B-7)

All are additive. Studio Pro never asks for them.

- **`editor-core`:**
  - `ModelSessionState.imagePlane?: ImagePlaneId | null` (`types.ts`, `session/defaults.ts`).
  - `select.imagePlane {id}` (`imagePlane.ts`, in the Model chunk):
    - flags `selection`, never an undo step;
    - picking a plane clears the object selection.
  - `select.objects` clears the plane.
  - The generated `modelManifest.ts` regenerated.
  - `args.ts`: one row.
  - `test/m6a/foundation.test.ts`: 79 editor operators, plus the own-check row.
  - `test/builtin/registration.test.ts`: `select.imagePlane` in the M6a list (not an undo step, `model` scope).
- **`agent-tools`:** `select.imagePlane` is denied (the user's selection, like `select.objects`).
- **`viewport`:**
  - `ImagePlaneLayer.corners(id)`;
  - `ViewportManager.imagePlaneAt(paneId, x, y)`, topmost first.
- **Pro's Outliner** keeps its own plane slot (`panels/outliner/planeSelection.ts`). Unifying it with `model.imagePlane`
  is a Pro follow-up (P-T8-4).

## Shared-file edits (each the smallest seam)

| File (owner) | Edit | Why |
|---|---|---|
| `halo/src/shell/Tray.tsx` (T6a) | The stage's own tray through `stageTray(stage)` in a per-stage Suspense; the old body becomes `StandInTray` | P-T6A-4: stage trays replace the stand-in |
| `halo/src/shell/Frame.tsx` (T6a, T7) | `<StageLayer …/>` under the Halo layer | Make's handles |
| `halo/src/shell/controller.ts` (T6a, T7) | `installStageParts(controller)` in `start()`; `...readHaloSlices()` in the test API's slices | The stage packages' setup and slices |
| `halo/src/shell/prefetch.ts` (T6a) | `prefetchStageParts()` at idle | S23 |
| `halo/src/shell/PathParts.tsx` (T6-INT) | A Path tab is one touch of the journeys' counter | J6 "Path › Paint (1)"; J1 and J7 count it too |
| `halo/src/shell/store.ts` (T6a) | `NounFocus.kind` admits a stage noun's kind; `sub` (the open ▾ petal) | The swatch focus; ▾ choices |
| `halo/src/halo/verbSource.ts` (T6a, T6-INT) | `Verb.choices`; `NounBinding` / `bindNoun` (focus, per-petal verb, anchor box, `docked`); `pollOp`'s reason for an operator not in the build | ▾ petals, the swatch noun, the plane's arguments |
| `halo/src/halo/run.ts` (T6a) | A ▾ petal opens its choices | §6.2 ▾ petals |
| `halo/src/halo/HaloLayer.tsx` (T6a) | `ChoiceRow`; a binding's box; a docked noun's verb bar (between the corners) and no breadcrumb | Same |
| `halo/src/halo/grammar.ts` (T6a) | The plane in `selectionKey`; tap hooks before the tool's click; a docked noun's focus outlasts selection changes | Planes; the swatch Halo during strokes |
| `halo/src/input/claims.ts` (T6a) | Stage claims run **before** the brush check; `addHaloTapHook` / `tapHooked` | Paint's Pick; planes |
| `halo/src/chips/EchoChips.tsx` (T6a) | A change is one touch; *Again* hides beside the reduced Halo; chips go below when the arc takes their side | J2's ⟨Segments⟩ scrub; §4.8; AS-ST-18 |
| `halo/src/i18n/en.ts` (T6a) | `verbs.notInBuild` | The reason |
| `halo/src/verbs/{table,nouns}.ts` (T6b) | The mesh, faces and edges rows (clean-up); the plane from `model.imagePlane` | §6.2, curated in T6a–T9 |
| `halo/src/manifest/{types,disclosure,sheets}.ts`, `searchOnly.baseline.json` (T6b) | `BUILT_OWNERS` + T8; `PENDING_OPERATORS`; `SHEET_OWNER.createAi`; the clean-up surfaces; `select.imagePlane`; the baseline | P-T6B-5 |
| `halo/src/sheets/scene/model.ts` (T6b) | A reference's row selects it | Planes |
| `halo/src/sheets/share/model.ts` (T11) | Game engine without a character exports the scene's static GLB (Pro's Static request, `local/generic`) instead of "no character" | J6 "Game engine › Export Cube Lad.glb" on a model made in Make |
| `halo/src/home/Home.tsx` (T11) | *Create with AI* as a 4th start of Make a character | The coordinator's request |
| `halo/test/{manifest/manifest,verbs/derive,sheets/scene}.test.ts` | Pending operators skipped; the mesh's Move row; the plane row's select | Follow the curated rows |
| `apps/web/e2e/ha-01-home-intake.spec.ts` (T11), `ha-02-grammar.spec.ts` (T6a) | ha-01: *Make a character* shows four buttons (the starts and *Create with AI*); ha-02: the part Halo's clean-up row has *Separate* where *Duplicate* was | Follow the Home start and ST-T8-4 |

## Patches for other packages

| # | Owner | Patch |
|---|---|---|
| P-T8-1 | G-a | When `mesh.intake`, `mesh.reduce`, `mesh.normalize`, `mesh.paletteBake` and `mesh.textureDownsize` land:<ul><li>add their manifest entries (`P('mesh')` for reduce; `T('make')` for all five; ⚙ Options in `PARAM_SURFACES`);</li><li>remove them from `PENDING_OPERATORS`;</li><li>regenerate the `searchOnly` baseline.</li></ul>Halo's rows go live by themselves. |
| P-T8-2 | Studio Pro / T1 owner | Let the arbiter claim the topology runtime's handles (the extrude manipulator, the value handle), and scale them by `setManipulatorScale` (ST-T8-2). |
| P-T8-3 | T9 | Use the stage-parts seam: one `rig: () => import('../stages/rig')` line in `STAGE_MODULES`, and your sheets in `STAGE_SHEETS`. Stage claims now run before the brush check (`claims.ts`). |
| P-T8-4 | Pro (editor) | `panels/outliner/planeSelection.ts` could read and write `model.imagePlane` through `select.imagePlane` (one state across the layouts, P13). |
| P-T8-5 | T12 | §20.2 gains:<ul><li>`shell/{stageParts,StageLayer}`;</li><li>`halo/ChoiceRow`;</li><li>`stages/make/**` (ai, report);</li><li>`stages/paint/**`;</li><li>`i18n/make.ts`.</li></ul>§6.2: the mesh row as curated for clean-up (ST-T8-4); Paint's tray and the swatch Halo docked (ST-T8-8). Fold `make-paint.test.ts`'s vocabulary lint into `rules.test.ts`. |
| P-T8-6 | Phone (best-effort, OQ-11) | Compact Make tray: the pill takes most of the row and the rest scrolls; Echo chips can sit over the verb bar (pre-existing). |

## Decisions (`ST-T8-*`, copied into DECISIONS-OPEN §P)

| ID | Decision | Why |
|---|---|---|
| ST-T8-1 | **The extrude cap handle is Halo's own 52 px frame handle on the cap's projected normal**, driving `app.extrude.beginAbsorb`. It is measured: a finger on Pro's Z arrow orbits. Pro's manipulator stays drawn for the Pencil and the mouse. | The arbiter cannot see the topology runtime's handles; the session's semantics are kept |
| ST-T8-2 | **Pro on touch gets a follow-up**: the arbiter should claim manipulator handles (P-T8-2) | The same gap in Studio Pro |
| ST-T8-3 | **A stage-parts seam** (`shell/stageParts.ts`): `{Tray, Layer, install}` per stage, lazily, plus the stage packages' sheets and test-API slices | One seam for T8 and T9 instead of edits to the frame per stage |
| ST-T8-4 | **A part's Halo cleans up** (the owner's focus): *Edit shape · Move · Separate · Delete · Reduce ▾ · Rig it*. Duplicate, Mirror and Paint move to its More; faces gain *Separate*; edges gain *Delete* | Clean-up first for imported and generated models; §6.2 rows are curated by the stage packages |
| ST-T8-5 | **The Make tray**: selection level · *Drag ▾* (Select · Move · Turn · Scale · Select area · Snap · Falloff) · *Create with AI* · *Mirror edits* (with a shape selected) · *Cut ▾* · *Clean up ▾* · *New shape ▾* · ⋯. Reference images are in empty space's ring and More | The §4.8 budget: Make at rest is 22 |
| ST-T8-6 | **▾ petals show their choices** in one row beside the Halo (`Verb.choices`, `store.sub`). A choice is one touch (J6's *Finish ▾ › Shiny* is 2) | §6.2 ▾ petals; J4's *Ease ▾ › Flat* counts the same way |
| ST-T8-7 | **Mirror edits starts on** for meshes made by the `humanoidBody` and `humanoid` templates (`model.symmetry.set {object-x}`, U state) | §11 "on by default for templates"; J2 |
| ST-T8-8 | **A tray swatch's Halo docks** as a verb bar above the tray, between the off-hand column and the puck, with no breadcrumb. Its focus outlasts strokes and taps on the model (`NounBinding.docked`) | J6: strokes, then *Finish ▾ › Shiny* in the open swatch Halo |
| ST-T8-9 | **Paint's tray shows at most five swatches** (the active one kept in view). `+n` opens the palette sheet; *New swatch* and the palette chip show when nothing is left out. *Fill part* is the Thumb key's lock, and *Pick* its one-tap *Pick colour* | §4.8: Paint at rest is 22; §5.5 one state |
| ST-T8-10 | **Paint says plainly that painting imported meshes arrives later**: the kernel refuses them, made-editable ones included | §3 P12 (the spec's *Make editable to paint* would promise a stroke that cannot land) |
| ST-T8-11 | **Reference planes are selected through `select.imagePlane` and `model.imagePlane`** (U state, a scene pick clears it), from a canvas tap (Make's tap hook over `imagePlaneAt`) or the Scene row | P-T6B-7: a plane is not a scene object |
| ST-T8-12 | **Clean-up calls G-a's operators by id with the final contract** (M7-GA-CONTRACT-1…6). Until they are in the build they stay greyed with *Not in this build yet*; `PENDING_OPERATORS` lets the verb table name them | The coordinator: no stubs; disabled with the reason |
| ST-T8-13 | ***Create with AI* is a placeholder sheet behind its entry flag** (`CREATE_WITH_AI_ENTRY`, on). It says AI generation is not connected and keeps *Create* off until `services.generation` exists (ADR 0017); G-d wires `gen.*` | The owner sees the pipeline's door; nothing pretends to generate |
| ST-T8-14 | **Game engine on a model without a character** exports the scene's static GLB (Pro's Static request, `local/generic`) | J6 on a model made in Make; the same call as More formats › Static model |
| ST-T8-15 | **Journey touches**: a Path tab and every Echo chip change count one touch (a numpad value is one: J4's rule). The off-canvas handles and the tray count their own | AS-ST-4 counts; the counter was missing them |
| ST-T8-16 | **Stage claims run before the brush check** in `claimOf` | Paint's *Pick* must reach the tool as a tap; handles are the stage's whatever the tool |
| ST-T8-17 | **Parity and bytes after T8**: `searchOnly` 58 → 42, `live` 353, reachable 302; J2, J6 and J6f byte-equal to Studio Pro's replay | The T8 exit test |

## Gate

Recorded below after the run.
