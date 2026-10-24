# Halo T9 — the Rig and Skin stage (`halo/t9-rig`)

[STUDIO-TOUCH-SPEC](../STUDIO-TOUCH-SPEC.md) §7.1, §9 J1 / J7, §9.11, §12, §15.5–§15.6, §16.3, §20.4, §21 (the T9 row),
§22 (AS-ST-4, AS-ST-5, AS-ST-7, AS-ST-12, AS-ST-16); [ADR 0023](../adr/0023-studio-touch-ui.md);
[AUTORIG-SPEC](../AUTORIG-SPEC.md) §5.3–§5.4. Branch `halo/t9-rig` from `dev` `582aa335`, parked as WIP `cbd9c892`
(the brush's Pencil pressure), resumed on 2026-10-25 with `dev` merged three times (`2bde8c24`: T7, T10, T11, M7 G-a;
`e1208263`: T8; `47fa724f`: M7 G-d / G-e). Decisions:
[DECISIONS-OPEN §P](../DECISIONS-OPEN.md#p-ekza-studio-touch-shell-halo-defaults-chosen-2026-10-24) rows `ST-T9-1` …
`ST-T9-18`.

Rigging is a step of the owner's pipeline: prompt or photo → generated model → clean-up (`gen.import`) → **Rig it** →
animate. T9 makes *Rig it* Halo's own, over Auto-Rig's orchestration, so a person never leaves the canvas.

## What landed

| Part | Where | What |
|---|---|---|
| *Rig it for me* | `recipes/rigIt.ts` | React-free recipe over editor-core's `autorigFlow` (T5b) on Home's flow host (`intake/flowHost.ts`, P-T11-1): `openMarkers` → the destination sets the finger detail (`chooseFingers`) → `runRig` (straighten, rigid parts, the rebind question) with its stages → `startMotionTest` → the starter set (T11's `starterSteps`: `autorig.clip.add` ×3). *Skeleton only* (`skel.quickRig.commit`), Cancel (`autorig.cancel` / `skel.quickRig.cancel`), *Bind again* (`rebindSkin`), Checks' *Fix them in order* (`fixInOrder`: Auto-Rig ①'s fix order). A subject comes from the intake, from Create with AI's *Rig it*, from a Make part, else the document (*From Studio*'s rule). A character that came with its own rig (a VRM, a provider's rig) is not guessed again: *Use its rig* runs `char.makeEditable`, then the checks |
| The Rig-it card | `stages/rig/RigCard.tsx` | Above the tray: *For: OMOBA & Ekza Space · Game engine · Just exploring*, *Dots look right? [Rig it] · Adjust dots · ⋯* (Skeleton only, Guess the dots again), Mittens · Thumb · All fingers, the story line (*Building skeleton… Skinning… Straightening arms… Checking…*, Cancel while skinning), M6b's rebind question inline, *Rigged · 34 joints · thumbs* with *Test with: Walk · Sword · Dance*, *Starter set: Idle · Walk · Run* |
| *Adjust dots* | `stages/rig/{DotsPanes.tsx,start.ts}` | A session on the same canvas (`registerSession`, id `adjustDots`): Pro's and Auto-Rig's R-Markers panes `pane-front` and `pane-side` take the single pane's place (side by side on Wide, one at a time with *Front · Side* on Regular and Compact); a dot under a finger is a handle (`addHaloClaim` over the marker overlay's hits within the touch pick radius), a drag elsewhere pans; a tap places or picks a dot through the rig runtime as a click does in Pro; the dot's Halo (*Re-guess*, *Mirror to other side*, *Clear dots*, ⋯ *Pick from view*) and a row of the dots by name; ✓ Done returns to the card, ✕ cancels Quick Rig |
| The Rig tray | `stages/rig/RigTray.tsx` | `[Character │ Skeleton │ Skin]` (`rig.mode`), *Rig it for me* / *Rig again*, *Add skeleton ▾*, *Bind skin*, the pose segment `[Bind │ Test │ Clip]` once a skin is bound (Clip greyed: after the MVP), ▶ *Bend test* / ❚❚ *Pause here* / ▶ *Play again*, *Paint weights*, *Joints ▾* in Skeleton, *Checks ⚠n*, ⋯. Folds its lower-priority items into ⋯ on phones |
| The brush bar | `stages/rig/RigTray.tsx` | While the brush paints (session `paintWeights`): `[Replace │ Add │ Scale │ Smooth]`, ⟨Size⟩ ⟨Strength⟩ ⟨Value⟩ (`skin.paint.set`), *Pressure* (the Pencil's, `setStrokePressure`), *Mirror* (`skin.paint.mirrorToggle`), *Flood*, *Show ▾* (ramp / grey / colours by bone / off: the display overlay), the pose segment, ▶ *Play again*, ⋯ the Weights sheet |
| Skin cards | `stages/rig/SkinCards.tsx` | *Who owns this?* beside a finger held on the skin (the grammar's stage hook): the bones that point follows with their weights, each a chip that paints that bone (Skin, `skin.influence.setActive`, the brush), *Smooth here*, ⋯ the skin spot's More. While painting, *This area follows* (docked right; a tray row on phones): the bone, ‹ › (`skin.influence.walk`), the spot's other bones, *All bones* |
| The bend test | `recipes/fixBend.ts` | *Fix where it bends badly*: the forearms and shins swing through their bend in the **test pose** (the rig chunk's test-pose gesture: never a key, never the document); *Pause here* keeps the pose as one *Test Pose* step, painting is posed on it; *Play again* swings again from rest |
| Sheets | `sheets/{checks,bones,weights}/**` | **Checks**: Auto-Rig's model check in its fix order with Fix and *Fix them in order* (`applyFix` on the flow host), the rig's rows for the destination with Fix and Show me, *Fix where it bends badly ▸*. **Bones**: Pro's Paint Weights list at touch density (body order / A–Z / flat, a filter, points per bone, Hold / Release, Hold all / Release all). **Weights**: Mirror, Smooth, Prune small, Normalize, Remove unused bones, each with ⚙ Options; the brush's falloff, reach, front faces only, *Brush does* (paint / select points); *Set weight…* (`skin.weights.set`, the first UI for it) |
| Search | `recipes/rigOffers.ts`, `stages/rig/openers.ts` | *Rig it for me* and *Fix where it bends badly* in `SEARCH_RECIPES` (P-T11-1): hands-on recipes, their offers open the card or the bend test through the mounted Rig stage |
| Back to Studio | `autorig/src/shell/{Frame,context,controller}.ts(x)` | Auto-Rig entered `from=halo` offers *Back to Studio ▸* (a same-page switch to `/app`); *Open in Studio ▸* still goes to Pro (§16.3) |
| Pencil pressure | `viewport/src/tools/rig/paint/{tool,pick,pressure}.ts` | A pen's pressure scales each stamp's strength at stamp time (folded into `StrokeStamp.strength`), read only for `pointerType: 'pen'` while the toggle is on; stamps every 0.25 r along the path through the coalesced samples, the pressure interpolated, so a fast stroke leaves no gap. Mouse and finger strokes are today's bit for bit |
| Words | `i18n/rig.ts` | The stage's catalogue (no "influence", "bind pose" or IK / FK at L0–L1) |
| Test API | `stages/rig/slice.ts` | `halo().slices.rig`: the card (phase, stage, fingers, motion), the flow's subject, the dots session, the brush, the Pencil's toggle, the bone painting goes to, strokes, the skin spot and its bones, the bend test |

## Exit test (T9 row)

| Check | Result |
|---|---|
| J1 ≤ 11 touches with the real defaults | **11** (`ha-J1-rig-to-omoba`, chrome-touch): Bring a model · the file in Files · the Next chip *Rig it for me ▸* · For: OMOBA · Rig it · Starter set · Share · licence · author · Export · iOS Save. The counter saw every in-app one; the Files pick and iOS's Save are counted by the spec |
| J1 from a generated model | `ha-J1-generated` (chrome-touch, the real gateway and the mock providers): Create with AI → Bring it in → *Rig it* hands the cleaned meshes to the flow host → the card opens on **those** meshes → For: OMOBA → Rig it: 4 touches for the rig part |
| J7 ≤ 7 + strokes | **7 + 2 strokes** (`ha-J7-fix-bend`, fingers only): Path › Rig · Test · ▶ Bend test · Pause here · a finger held on the bad spot · the bone that owns it · ▶ Play again |
| Native *Adjust dots* | `ha-10` (chrome-touch): front and side panes, a finger drag moves the elbow by the axis rule (depth kept), a tap opens the dot's Halo, a drag beside the dots pans, ✓ Done, then *Rig it* rigs the moved dot. Portrait: one pane and the toggle, the knee dragged in the side view (`ha-14`) |
| Halo's J1 operator log equals Auto-Rig's | `test/rig-journeys.test.ts` (production kernel; the Cube Lad, Polybot A-pose, the Cube Lad in centimetres): Halo's recorded log (Home's intake, Checks' fixes, the card, Share's first entry) **equals** Auto-Rig ①–④ and ⑤'s first entry run by `runAutoRigJourney` with the same choices, and T5b's recorded references for ①–③. Every run finished, nothing ran outside the flow. ⑤: Share exports with Studio Pro's `file.exportCharacter` (T11), whose bytes **equal** `autorig.export`'s for the same document (ST-T9-2). The logs are in the table below |
| Portrait Rig editing | `ha-14` (834 × 1194 and 744 × 1133, chrome-touch): the dots, *Rig it*, a stroke, a round trip to Pro (view-only there below 1024 px) and back, a stroke again |
| Pressure determinism headless | `headless-tests/test/rig.paint-pressure.test.ts`: a pressured stroke replays bit for bit (undo / redo; a second app with the same arguments gives the same weights and the same VRM bytes); pressure changes only the strengths. `viewport/test/halo-t9-paint-pressure.test.ts`: the stamp steps, coalesced samples in order, no gap wider than the spacing on a fast segment, pressure interpolation, the factor and the toggle, strengths scaled exactly |
| ha-10 / ha-14 green on chrome-touch, boot on webkit-ipad | ha-10: 2 chrome-touch tests + the Back to Studio round trip on chrome + the WebKit boot; ha-14: 834, 744, the phone smoke + the WebKit portrait boot. See *Gate* |
| Exports byte-equal to Auto-Rig's | The ⑤ check above, three models |
| `searchOnly` to the T9 target | **25 → 4** (target 20): only the explicit developer items remain (`file.saveJson`, `ui.commandPalette`, `key.write`, `key.delete`) — the GA floor; 342 of 362 live operators reachable without search (from 321) |

### The J1 logs (Halo = Auto-Rig ①–④ + ⑤'s first entry)

```
cube-lad:      workspace.set → autorig.sample[mesh.importStatic] → select.objects → skel.quickRig.start
               → autorig.rig[skel.quickRig.commit, skin.bind] → library.preview → library.stop
               → autorig.clip.add[library.useClip] ×3 → char.renderThumbnail
polybot-apose: … → autorig.rig[skel.quickRig.commit, skin.bind, skel.pose.applyAsRest] → …
cube-lad-cm:   workspace.set → autorig.intake → autorig.fix[scene.object.transform] → autorig.inspect
               → select.objects → skel.quickRig.start → autorig.rig[…] → … (the same tail)
```

## Screenshots

In the session's scratchpad `halo/` (production e2e builds and the dev server, Chrome with touch @2x; not committed):
`t9-j1-chrome-touch-{card,rigged}.png` and `t9-ha10-chrome-touch-{dots,owns,paint}.png` (iPad landscape),
`t9-j7-chrome-touch-{paused,paint}.png`, `t9-ha14-chrome-touch-{834,744}-{dots,rigged,paint}.png` (iPad portrait),
`t9-ha14-webkit-ipad-834-card.png`, `t9-ha14-chrome-touch-phone-{card,dots}.png` (phone).

## Gate and sizes

`EKZA_E2E_PORT=3189 pnpm run ci` at `712a31d2` (local Chrome, after `dev` `47fa724f` was merged): **exit 0**. Format,
lint, typecheck, deps, fixtures, licences, every package's tests (halo 242, autorig 115, viewport 351 + 1 skipped,
headless-tests 237, editor-core 1,831, editor 677 + 1 skipped, …), the production build, `check:size`,
`check:gen-boundary`, and the e2e suite: **566 passed, 186 skipped** (project-gated), none failed or flaky. The T9 specs:
ha-10 ×2, ha-14 834 / 744 / phone, ha-J1, ha-J1 (generated) and ha-J7 on chrome-touch; ha-10's Back to Studio on
chrome; ha-10 and ha-14's boots on webkit-ipad.

`check:size` (production build, gzip -9, first visit; SIZE-1: one 5,000,000 B gate per route, the rest a record). The
`dev` column is `47fa724f` built on this machine the same way (with source maps, which add ≈ 120 B):

| Route | `dev` `47fa724f` | T9 | Δ |
|---|---|---|---|
| `/editor` | 902,724 B | **902,533 B** | ≈ −70 B |
| `/autorig` | 661,202 B | **661,174 B** | ≈ +75 B (*Back to Studio*) |
| `/app` | 734,640 B | **735,842 B** | ≈ +1,320 B (the Rig card's open flag and lift, the stage hooks, the `rigDot` noun and its labels, the Next action, the seam line) |

`/autorig` takes no Halo code (`halo-shell` is unreachable from its scripts). The Rig stage, its sheets, the recipes,
the brush tray and the words are lazy chunks; the eager Rig files on `/app` are `stages/rig/{ui,cardOpen,dotLabels}.ts`
(≈ 1.6 kB raw). The first gate run showed `/app` at 778,245 B: `verbs/nouns.ts` imported editor-core's
`QUICK_RIG_LABELS`, which drags the Quick Rig operators, the skeleton builders and io's skeleton readers into the
initial scripts (+43.7 kB; found with `STUDIO_SOURCE_MAPS=1` and a per-source diff against `dev`). The noun now reads
`stages/rig/dotLabels.ts` (a test keeps it equal to Pro's table), and `test/rig-stage.test.ts` fails when an eager Halo
module imports any value of editor-core's rig operators or `autorigFlow` — the halo rules test walks only Halo's own
modules, so a package-level leak slipped past it.

## Lines outside the T9 row (seam-shaped; each is a hook other stages can use)

| File (owner) | Edit | Why |
|---|---|---|
| `halo/src/shell/stageParts.ts` (T8) | `rig: () => import('../stages/rig')` in `STAGE_MODULES` (P-T8-3) | The Rig stage's tray, layer and setup through the seam |
| `halo/src/shell/Frame.tsx` (T6a) | `useRigCardOpen` hides the Next chip while a Rig card, the dots or the brush is up; `useRigLift` adds the wrapped Rig tray's extra height to `insetBottom` | §7.2: the Next chip never shows over a card; the corners rise with the tray as T7's `animate.lift` does |
| `halo/src/shell/PathParts.tsx` (T6b / T6-INT) | `registerNextAction(app, id, run)`: a Next chip's own action | J1: *Rig it for me ▸* opens the card in the same touch |
| `halo/src/halo/grammar.ts` (T6a) | `addStageGestureHooks(app, {tap, longPress})` | A finger held on the skin is *Who owns this?* (no ring, no replayed click — that click would paint a dab with the brush); a tap beside the dots drops the selected dot |
| `halo/src/halo/verbSource.ts` (T6-INT) | `registerPetalArgs('<noun>.<petal>', app => args)` | A rig dot's *Mirror to other side* names that dot and its mirrored point |
| `halo/src/halo/run.ts` (T6a) | `registerVerbAction(app, verbId, action)` | The Make part's *Rig it* (`stage:rig`, T8's petal) opens the card on the selected part |
| `halo/src/halo/HaloLayer.tsx` (T6a) | The Echo chips give way while a Rig card is up | After *Rig it* the last run is the inner Bind Skin; the card speaks for it |
| `halo/src/verbs/{nouns,table}.ts` (T6b) | The `rigDot` noun from Quick Rig's selected marker, named by `stages/rig/dotLabels.ts` (never editor-core's `QUICK_RIG_LABELS`: see *Gate and sizes*); Checks petals open the Checks sheet; the dot's *Remove* reads *Clear dots* (`skel.quickRig.clear` clears every dot) | §6.2 curated in T6a–T9 |
| `halo/src/manifest/{types,sheets,sheetLoaders,disclosure}.ts`, `searchOnly.baseline.json` (T6b) | `T9` built; the three sheets' sections and prefetch loaders; the sheet surfaces of the operators they run; the baseline regenerated | P-T6B-5 |
| `halo/src/recipes/index.ts` (T11) | `rigItOffer`, `fixBendOffer` | P-T11-1 |
| `autorig/src/i18n/en/frame.ts` (Auto-Rig D0) | `backToStudio`, `backToStudioTitle` | Auto-Rig's strings live in its tables (§8.4); the row owns `autorig/src/shell/**` only |
| `viewport/src/index.ts` (T1 / T0) | One export line: `setStrokePressure`, `strokePressure`, `subscribeStrokePressure` | The brush tray's Pressure chip |

The quick-rig marker tool itself needed no change for touch: T1 already scales its pick radius by pointer
(`markerPickPx`), the arbiter delivers a dot drag past the slop with its original down, and the stage's claim reads the
marker overlay's hits (`viewportRigOf(app).markers.hits`) — so the T9 row's "touch seams" are the claim and the panes.

## Patches for other packages

| # | Owner | Patch | Why |
|---|---|---|---|
| P-T9-1 | M7 G-d (`halo/src/generate/binding.ts`) | Create with AI's *Rig it* could open the card itself: `void rigOpenersOf(app)?.rigIt()` (`stages/rig/openers.ts`) after its hand-over, and close its sheet | Today the sheet stays open and the tray's *Rig it for me* is one more touch |
| P-T9-2 | T6a / T12 (`halo/src/halo/Breadcrumb.tsx`) | The breadcrumb sits over the session bar's hint when a mesh is selected in Rig (the dots and paint sessions) | Seen in the screenshots; the hint is still read by the bar's name |
| P-T9-3 | T6a (`halo/src/halo/grammar.ts`, `input/arbiter.ts`) | A long-press while a brush tool is active replays the press as a click after the arbiter cancelled the stroke: with a brush that is a dab. T9's hook takes the Rig skin's long-press; Paint (T8) may want the same | Found while building *Who owns this?* |
| P-T9-4 | T12 (`docs/STUDIO-TOUCH-SPEC.md` §20.2, §12.4) | Files as built: `stages/rig/{index,Tray,Layer,RigTray,RigCard,DotsPanes,SkinCards,start,model,ui,slice,cardOpen,dock,openers,poll}`, `recipes/{rigIt,fixBend,rigOffers}`; §12.4's *Bend test* is the test-pose swing (ST-T9-5), not the motion test | The spec follows the code |
| P-T9-5 | M6b owner (`viewport` / `editor-core`) | `char.makeEditable` is still a deferred stub: *Use its rig* stays greyed with its poll reason until it ships (G-d's import goes through it) | Imported and provider rigs |

## Follow-ups (not in T9's row)

- *Mode follows touch*: a joint tapped in Character enters Skeleton and *Paint its weights* enters Skin; a mesh tapped in
  Skeleton (meshes are masked there) does not switch back to Character yet — it needs the mesh pick of a masked press.
- The ⟨Bend <joint>⟩ scrub chip (§12.4 step 1's second form) is not built: ▶ *Bend test* covers J7.
- *Test with: Sword · Dance* plays the library's clips; the motion test does not offer the Range test (D5 stretch).
