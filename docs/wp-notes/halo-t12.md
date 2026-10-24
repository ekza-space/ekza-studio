# Halo T12 — integration and the release gate (`halo/t12-release`)

Work package T12 of [STUDIO-TOUCH-SPEC](../STUDIO-TOUCH-SPEC.md) §21 (v0.2, [ADR 0023](../adr/0023-studio-touch-ui.md)):
§1.2 (the entry), §17 (the beta note), §20.2 (the files as built), §20.6 (the size record), §22 (the release gate).
Branch `halo/t12-release` from `dev` `b4bcf546` (T0–T11, M7 G-a…G-e and C1/C2 merged). Decisions:
[DECISIONS-OPEN §P · T12](../DECISIONS-OPEN.md), rows `ST-INT-1` … `ST-INT-14`. The owner's priorities for the release:
animation, then the turnkey AI pipeline (prompt or photo → model → clean-up → *Rig it* → animate), then the rest;
frames are the default time unit and the ruler has a tick on every frame (both already true from T7/T10).

## The flags (ST-INT-1)

| Flag | Where | Now |
|---|---|---|
| `HALO_ENTRY` | `apps/web/app/entry.ts` (the landing, `REDIRECT_SCRIPT`, the chooser rows), `packages/editor/src/dialogs/entryChoice.ts` (Pro's Start in, the switch's write), `packages/halo/src/shell/entry.ts` (▤ Pro layout's write) | **on** in all three; `apps/web/test/entry-contract.test.ts` pins Halo's copy too (key, record, flag, the `'halo' → 'studio'` write) and keeps the off rule's script byte for byte |
| `PRO_TITLE` | `packages/editor/src/shell/menuItems.ts` | **on**: the menu bar reads *Ekza Studio Pro*; `/editor`'s metadata title is `{absolute: 'Ekza Studio Pro'}` |
| `simpleLayoutSwitch()` | `menuItems.ts`, `StatusLine.tsx` | **removed**: ▤ Simple layout and File › / Help › *Switch to the Simple Layout* show on every page |

What a person sees: a first visit to `/` opens Home at `/app` on every device; a remembered `studio` or `autorig` still
wins; `/?chooser=1` lists *Ekza Studio · Ekza Studio Pro · Rig a model for me*; Pro's Preferences › Start in offers
*Default (Ekza Studio) · Ekza Studio · Ekza Studio Pro · Rig a model for me*; the layout switch updates a remembered
choice either way. Help › About carries a **Beta** pill and the note (ST-INT-3). Halo's Settings › Start in explains
the front page and links the chooser (ST-INT-2).

## The patches (ST-INT-5, ST-INT-7)

| # | Applied | Where | Test |
|---|---|---|---|
| P-T9-1 | Create with AI's *Rig it* opens the Rig-it card on the hand-over (`rigOpenersOf(app)?.rigIt()`), which closes the sheet | `halo/src/generate/binding.ts` | `generate-binding.test.ts`; `ha-J1-generated` (the rig part is 3 touches, was 4) |
| P-T9-2 | The breadcrumb and the arc start under the session or target bar | `halo/src/halo/{geometry,HaloLayer}.ts(x)` (`grammarTop`, `TOP_BAR_ROW`) | `t12-integration.test.ts`; `ha-10`, `ha-14` green |
| P-T9-3 | A long-press with a brush active never replays a click (no dab); the ring opens on the selection | `halo/src/halo/grammar.ts` | `t12-grammar.test.ts`; `ha-09`, `ha-10` green |
| P-T7-7 | A tap on a manipulator over another body part selects that part (every stage but Animate, where Reach's press does it) | `halo/src/halo/grammar.ts` (`partUnderHandle`) | `t12-grammar.test.ts`; `ha-02`, `ha-06` green |
| ST-T8-18 | Nothing is asked of the gateway while `/app` loads (Home asks when *Make a character* opens its starts) | `halo/src/stages/make/ai/availability.ts` (`useAiAvailability(app, ask)`), `home/Home.tsx` | `ar-02-chooser-landing` (a first visit: no response ≥ 400, no console error), `ha-01` |
| — | `/app` links its icon again (its segment's `icons` had replaced the root's file-convention icon: a `/favicon.ico` 404 on every first visit) | `apps/web/app/(studio)/app/layout.tsx` | same |
| P-T8-6 | On a phone the Make tray's selection level is one chip with a menu, so the row keeps its chips | `halo/src/stages/make/{Tray.tsx,state.ts}` | `ha-t12-release` (phone, chrome-touch) |
| P-T11-3 | `ViewportManager.viewState(paneId)` / `setViewState(paneId, state)` (a view camera, kept as the person's own view); J10's resume record keeps the canvas pane's camera (also written on `visibilitychange`) and puts it back | `viewport/src/manager/ViewportManager.ts`, `viewport/src/index.ts` (`NavState`), `halo/src/home/resume.ts` | `viewport/test/halo-t12-view-state.test.ts`, `t11-share-home.test.ts`, `ha-J10` (the camera after a reload) |
| P-T11-4 | Pro toasts *Same project, every panel at once · Undo still works* on a same-page arrival from Halo; `HostNavigation.takeFrom()` | `editor/src/shell/EditorShell.tsx`, `editor/src/host/{navigation,types}.ts` | `halo-t2-host.test.ts`, `ha-J9` |
| P-T10-3 | The live AI line under the search pill (paired and busy, or asking for access; a tap opens Ask) | `halo/src/history/activity.ts` (eager slot), `halo/src/sheets/ask/activity.ts` (the watcher, lazy), `shell/TopBar.tsx` | `t12-integration.test.ts`, `ha-t12-release` (chrome, the e2e fake session) |
| P-T10-4 | The agent session keeps the document before the pairing's first non-read call (`beforeAgentSnapshot()`, `state.beforeAgent`); the e2e fake does the same; Halo's *Restore before the AI* reads it | `editor/src/agent/{beforeAgent,session}.ts`, `agent/ui/fakeSession.ts`, `halo/src/sheets/{ask/AskSheet.tsx,history/requests.ts}` | `mai-b3-agent-ui.test.tsx` |
| P-T7-3, P-T8-5 | One vocabulary lint over every catalogue (en, animate, make, paint, rig, the plain channel names), one jargon list | `halo/test/rules.test.ts` (the stage copies removed from `make-paint`, `rig-stage`, `animate-words`) | itself |
| T2's P5 | The budgets bench measures `/app`'s route JS | `apps/web/e2e/bench/budgets.bench.ts` | `pnpm --filter web bench:budgets -g "route JS"` |

Deferred (ST-INT-7): **P-T11-2** (a recipe stepper card and *Resume* chip: T11's recipes finish in one step with a toast
and *Undo all*, T9's Rig-it card is its own stepper; a generic one waits for a recipe that spans a session); P-T10-2,
P-T10-5, P-T10-7, P-T11-5 (owner / optional); P-T8-2, P-T8-4, P-T7-5 (Pro follow-ups); P-T9-5 (`char.makeEditable`,
M6b). Not built and named in the release notes: *Open in a new tab* from ▤ Pro layout (§16.2), the ⟨Bend joint⟩ chip,
Share's *Back to Share ▸* chip, Pro's *Restore before the agent*.

## axe in the gate (ST-INT-6)

`axe-core` **4.14.0** is a web devDependency (exact, published 2026-10-05, past the 14-day `minimumReleaseAge`;
MPL-2.0, dev only; `tooling/check-deps.mjs` admits it for web). `ha-15`'s axe run (WCAG 2.0/2.1/2.2 A and AA over every
sheet) runs in every gate on all three projects. It found one real rule at once — `label-content-name-mismatch` on
Settings › Input's *Reduce gestures* and *Quick pinch* chips (they show *On / Off*, their name was the setting alone):
the names now say both (`halo/src/input/InputSettings.tsx`).

## The `ar-12` load flake (ST-INT-8)

`ar-12-layouts` › phone 390 × 844 touch › "the frame on ① and on ②" failed under load: the panel's `y` read 578
against the panes' bottom 762. Both live in one flex column (`Frame.tsx`: the panes' box and the `<aside>` bottom
sheet), so no single frame can have the sheet's top above the panes' bottom. The race was in the test: `expectFrame`
read the two rects with two separate `boundingBox()` calls (and its poll did the same), and the step's lazy panel —
the report on ①, the Markers panel on ② — grows the sheet a few frames after the step shows; under load the first read
saw the panes before the growth and the second the sheet after it. `settledBoxes` reads both rects in the same frame
and waits until they hold still for two animation frames (a 5 s cap returns the last pair read together). The
assertions are unchanged.

## Records

- STUDIO-TOUCH-SPEC as built: §1.2 (the flags), §6.2 (the mesh, faces, edges, swatch and rig-dot rows as T8/T9 curated
  them, and a note on P-T7-7, Paint's tray and the Checks petals), §10.4 (Keys rows by the 1.8× scale), §12.4 (the
  bend test is the test-pose swing, ST-T9-5), §20.2 (the file list as built, P-T6A-7, P-T7-6, P-T8-5, P-T9-4, P-T10-1,
  P-T11-7), §20.3 item 12 (P-T3-5), §20.4 (T2's P7 and T12's additions), §20.6 (SIZE-1 and the recorded total).
- `apps/web/scripts/size-baseline.json` `routes.app`: enforced (5,000,000 B, SIZE-1), **total recorded**;
  `apps/web/test/halo-size.test.ts` checks the record.
- `docs/FEATURES.md` and `FEATURES.summary.json` for v0.7.0: one studio, two layouts (§1), the Simple layout (§13),
  AI generation and clean-up (§14), the character contract (§10), MCP shipped in `v0.6.0` (§11), the platform (§12).
  The §15 inventory's FEATURES ids still resolve (`features-map.test.ts`).
- `docs/ROADMAP.md` v1.3 (HALO and CC rows, M7 G1, M-AI released, the next steps); `docs/agents.md` (Ask in the Simple
  layout, and the iPad note: no loopback from WebKit, pair on a computer, move projects through Files).
- `docs/evidence/halo/README.md` (§22 per scenario), `device-checklist.ru.md` (the owner's iPad run, in Russian),
  `docs/releases/v0.7.0.md` (draft notes; earlier releases only had a one-line tag message).

## §22 (ST-INT-13)

Every scenario green but the device run: AS-ST-2, 4–10 and 15–20 green; AS-ST-1, 3, 12, 13 and 14 green in the browser
(WebKit as an iPad, CDP touch and Pencil, axe) with their device halves in the checklist; AS-ST-11 and AS-ST-21 open
(the owner's iPad). AS-ST-19 got its own test here: `packages/halo/test/t12-chips-readout.test.ts` poses every TRS
channel of every control of Polybot and Seed-san with both signs through `channel.setValues` and compares the Numbers
fields and the Echo chips' values with Pro's `channelText`. AS-ST-10 got its browser check here too: `ha-12` ›
*AS-ST-10* compares the meaning of Pro's keys, the Shift+RMB marking menu's definition, every stored `ekza-animator:`
key of the page's namespace and the panes before and after Ekza Studio ran every stage and changed its own input
settings. Details: [evidence/halo](../evidence/halo/README.md).

## Trademarks (ST-INT-9)

A case-insensitive scan of `packages/*/src`, `apps/web/app`, the web manifest and the docs this release touches finds no
third-party product name (the TM-1 exceptions stay where TM-1 lists them). Provider names reach the UI only as the
gateway's provider labels where the person picks the service (its terms and data use must be named); platform names
(iPad, Pencil, Safari, Chrome, Edge, Files, Home Screen) and agent clients state compatibility.

## Gate and sizes

GATE_SECTION

## Screenshots

`/private/tmp/claude-501/-Users-wotori-git/d810d71f-f77c-5950-8a1f-82bdfe6725d3/scratchpad/halo/t12-*.png` (not
committed; `EKZA_T12_SHOTS=<folder>` with `ha-t12-release`): `t12-home-{chrome,chrome-touch,webkit-ipad}.png` (a first
visit opens Home; iPad landscape on WebKit), `t12-chooser-chrome.png` (`/?chooser=1`), `t12-pro-title-chrome.png`,
`t12-about-beta-{chrome,chrome-touch,webkit-ipad}.png`, `t12-ai-activity-chrome.png`, `t12-phone-make-chrome-touch.png`.

## For the owner

1. The iPad run: [device-checklist.ru.md](../evidence/halo/device-checklist.ru.md) (AS-ST-21).
2. Accept the spec and ADR 0023 (Proposed), or say what changes.
3. Merge, tag `v0.7.0` (optionally bump `EDITOR_VERSION`, ST-INT-3) and deploy: [release notes](../releases/v0.7.0.md).
