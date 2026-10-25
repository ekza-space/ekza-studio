# Halo ◆ Key — an explicit Key button beside Rec (`feat/halo-key-button`)

Owner request, 2026-10-25, after a test on an iPhone (translated): *"I missed an explicit button next to REC, to punch a
key by hand. If I turn Auto Key off, how do I key the selected part by hand?"* The *Key ◆* petal existed on a control's
Halo, but it was not discoverable, and on a phone the verb bar could fold it away. Branch off `dev` `5689ba17` (Halo
integrated and on by default at `/app`). Spec: [STUDIO-TOUCH-SPEC](../STUDIO-TOUCH-SPEC.md) §10.2, §10.3, §4.8 (and the
wireframes of §4.2–§4.4, §15.8 row 8.1). Decisions: [DECISIONS-OPEN §P · ◆ Key](../DECISIONS-OPEN.md), rows
`ST-KEY-1` … `ST-KEY-7`.

## What landed

| Part | Files | What |
|---|---|---|
| ◆ Key | `halo/src/thread/strip/{KeyButton.tsx,key.ts}` (new), `Thread.tsx` | A labelled 44 pt *◆ Key* right after *● Rec*, on iPad landscape, portrait and the phone. Tap: `key.set {channels: 'all', target: 'selected'}` at the playhead, one undo step, Rec on or off; the toast *Keyed R Lower Arm · frame 24* (*3 parts*; seconds under Settings › Time). Hold (right-click): *All channels* · *Only changed channels* · *Selected channels* (only while channels are selected in Numbers or Keys), each greyed with its reason when it cannot run. Nothing selected: greyed, a tap says *Select a body part to key*. The diamond is filled while the playhead sits on a key of the selection (`data-keyed`), hollow otherwise. `key.ts` is the pure part (state, choices, calls, toast text) |
| ● Rec on a phone | `Thread.tsx` | Keeps its word (it was a dot alone on Compact): *● Rec* and *◆ Key* read side by side |
| The coach mark | `KeyButton.tsx`, `shell/coach.ts` | The first tap on *● Rec* or *◆ Key* (or its hold) shows *Rec keys what you change. ◆ Key keys the selection now.* once on the device, through the shell's coach marks (`coachOnce`) |
| The layer switch | `Thread.tsx` (`LayerSwitch`, `LayerChip`, `LayerMenu`, `useFoldLayers`) | At rest *Keys · Curves* (the Thread is the timeline); *Timeline · Keys · Curves* while one is open. Each layer one tap, as before. On a phone whose row cannot hold ▶ · ● Rec · ◆ Key and the switch, the switch folds into one chip naming the layer (*Keys ▾*, a tap lists the three); ◆ Key never gives way. The switch is the Thread's own radio group now (the kit's `Segmented` always checks its first item when the value is not among them) |
| `key.set {channels: 'changed'}` | `editor-core/src/operators/{args.ts,builtin/key.ts}`, `editor-core/test/builtin/key-changed.test.ts` (new) | *Only changed channels*: the channels `'all'` keys that changed since they were keyed — a session override, or a channel without keys in the control's active clip whose value is not its default (the static value Auto Key off writes); a changed rotation keys all three; locked channels never; nothing changed refuses with *Nothing changed since the last key*; undo label *Key Changed Channels*. `key.set` declares no ParamDefs, so the value lives in `KeyChannels`; the agents' toolset is unchanged (`key.set` is denied to agents) |
| Manifest and words | `halo/src/manifest/disclosure.ts`, `halo/src/i18n/animate.ts` | `key.set` gains the Thread as a depth-0 surface (`C('thread')`); its plain name stays *Key* (`labels.ts`), which is the button's word. The words under `animate.thread.key*` and `coachRecKey`, `layerChip` |
| Tests | `halo/test/thread-key.test.ts` (new), `editor-core/test/builtin/key-changed.test.ts` (new), `apps/web/e2e/ha-06-thread-keys.spec.ts` | below |
| Docs | `STUDIO-TOUCH-SPEC.md` §10.2, §10.3, §4.8 (a phone row), the wireframes C, D, portrait and phone, §15.8 row 8.1; `DECISIONS-OPEN.md` ST-KEY-1…7 (rev. 21); `MVP-SPEC.md` §4.11.1 rule 2 (`changed`); `FEATURES.md` (a ◆ Key row, **Next release**) | the spec follows the code |

## The budgets (§4.8)

◆ Key made the Thread eight targets, and Animate at rest **23** on iPad landscape and portrait (Seed-san: top bar 8,
↶, puck, the Next chip and its ✕, the Animations row 3, the Thread 8). The fix that costs no journey a touch: at rest
the switch drops *Timeline* (the current layer, a target that does nothing there) and shows it again while Keys or
Curves is open, where it is the way back (ST-KEY-5).

| Size (Seed-san, one animation) | At rest | With a control's Halo | Budget |
|---|---|---|---|
| iPad landscape 1194 × 834 | **22** | **31** | ≤ 22 · ≤ 36 |
| iPad portrait 834 × 1194 | **22** | **31** | ≤ 22 · ≤ 36 |
| Phone 390 × 844 | **20** | **26** | its own row: ≤ 20 · ≤ 28 |
| Phone 360 × 780 | 20 | 25 | the switch folds into a chip only while a layer is open |

Rejected: a single layer chip on iPad too (J4 would take 11 touches, > 10); not counting a greyed button (weakens
ST-37 everywhere); fewer animation chips or no Next chip (ST-T7-2 and ST-T7-18, and the three-animation row would still
be 23).

## Tests

| Where | What |
|---|---|
| `editor-core/test/builtin/key-changed.test.ts` (7) | an override keys with its rotation triple, one exact undo step, the label; a static change with Auto Key off keys that channel only; only the changed target is keyed; nothing changed refuses, and after a key nothing is changed; locked channels; attributes follow `'all'` (`@roll` keys, `@ikFk` only as a selected channel); an unknown set is refused |
| `halo/test/thread-key.test.ts` (8, Polybot, production kernel) | greyed without a selection; a tap keys every channel of the selection at the playhead as one step, the diamond fills there and empties off it, the toast in frames and seconds, undo; *3 parts*; Rec on: Rec keyed what changed, *Only changed* has nothing, ◆ Key keys every channel; Rec off: *Only changed* keys the turned rotation's triple only; the long-press lists *Selected channels* only with channels selected; the word is the manifest's plain name and the Thread a depth-0 surface; the call targets the selection |
| `apps/web/e2e/ha-06-thread-keys.spec.ts` on `chrome-touch` | *◆ Key keys the selection by a tap* at **iPad landscape, iPad portrait and phone** sizes (● Rec and ◆ Key side by side with their words, 44 pt; greyed at rest with its reason and no step; the at-rest and selection budgets per size; Rec off by touch, a pose stays unkeyed, a tap keys frame 24 in one step, the diamond fills and empties, the toast, undo); *with Rec on* (Rec keyed the turned forearm only; *Only changed* greyed with its reason; ◆ Key keys both selected parts, every channel, Rec still on); *the long-press* (All · Only changed, then Selected channels once a channel is selected; each keys what it says); *the coach mark* once (`firstRun`); *a 360 pt phone* (Keys · Curves fit at rest; with Keys open the switch folds into one chip on the same row, nothing past 360; Timeline from the chip brings the switch back). The at-rest test asserts the two-segment switch, the Rec/layers test the three segments while Keys is open. `webkit-ipad`: the boot test taps ◆ Key (a key at 30) |

## Lines outside the Thread files (shared files)

The row is `halo/src/thread/strip/**` and `key.set`'s arguments. Outside it, each the smallest seam-shaped change:

| File (owner) | Lines | Why |
|---|---|---|
| `editor-core/src/operators/args.ts` (contracts; **ANIM-LAYERS works here too**) | `KeyChannels` + `'changed'` | ST-KEY-3 |
| `editor-core/src/operators/builtin/key.ts` (M2a; **ANIM-LAYERS works here too**) | `KEY_CHANNELS` + `'changed'`; `changedChannelsOf` (new, private); `keyChannelsOf` takes the view and filters by it for `'changed'`; `keyPlan` passes the view and filters the IK proxy channels; `KEY_LABEL.changed`; the poll's refusal | ST-KEY-3. `curveOf` reads the base layer, as `key.set` writes; when layers land, *changed* should read the layer `key.set` keys into |
| `halo/src/manifest/disclosure.ts` (T6b) | `key.set`: `on(0, [C('thread'), …])` | the Thread is a depth-0 surface |
| `halo/src/i18n/animate.ts` (T7) | the ◆ Key words, the coach text, `layerChip` | the stage's words |
| `halo/src/shell/coach.ts` (T6a) | `coachOnce(ctx, id, text)` and its registry, set by `coachMarks` | ST-KEY-4: a surface's own coach mark |
| `apps/web/e2e/ha-06-thread-keys.spec.ts` (T7, T10) | the new cases; the at-rest switch has two segments, three while Keys is open; the WebKit boot taps ◆ Key | the tests |
| `docs/*` | as listed above | the spec follows the code |

## Follow-ups

- When animation layers land (ANIM-LAYERS), *Only changed* and the diamond should read the layer `key.set` keys into,
  not only the base layer (`changedChannelsOf`, `keyDots`).
- The petal's *Key ◆ · changed* dot of §10.2 (Rec off) is still not drawn; `key.set {channels: 'changed'}`'s poll is the
  test it needs.
- The real-iPhone check: the owner's device (best-effort size class, OQ-11).
