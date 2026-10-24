# Ekza Studio's Simple layout (Halo) — release-gate evidence

The acceptance set of [STUDIO-TOUCH-SPEC §22](../../STUDIO-TOUCH-SPEC.md#22-acceptance-scenarios-the-release-gate) as
recorded at the T12 integration (branch `halo/t12-release`, 2026-10-25). The local gate is
`EKZA_E2E_PORT=3192 pnpm run ci` (CI is off for this repository): **green** (exit 0; e2e 580 passed, 189 skipped by project, 0 failed). The projects: `chrome` (desktop mouse and
keyboard), `chrome-touch` (1194 × 834 and 834 × 1194 with CDP multi-touch and the Pencil; one phone run at 390 × 844,
best-effort) and `webkit-ipad` (Playwright's WebKit as an iPad Pro 11 — compatibility only, it proves nothing about iOS
gestures, Files, Web Share, memory or the Pencil). The real-device run is the owner's:
[device-checklist.ru.md](device-checklist.ru.md); its record goes next to this file as `device-run-<date>.md`.

| ID | Scenario (short) | Result | Evidence |
|---|---|---|---|
| AS-ST-1 | `/app` boots on an iPad in Safari, loads a sample, plays, edits, exports, saves | **Compatibility green; device open** | `ha-00` (platform, memory profile, export bytes with the profile on and off), `ha-01` (Home, intake) on `webkit-ipad` in both orientations; `ha-t12-release` (a first visit opens Home on `webkit-ipad`). Device: checklist items 1–14 |
| AS-ST-2 | Parity: every live operator has a non-search path, a reasoned `proOnly` or a `plumbing` entry; `searchOnly` holds only developer items | **Green** | `ha-parity` (chrome) at `/app`: `searchOnly` **4** (`file.saveJson`, `key.delete`, `key.write`, `ui.commandPalette`: the explicit developer items), 342 of 362 live operators reachable without search; `tooling/halo-callsites.mjs`; the manifest lints (`packages/halo/test/manifest`) |
| AS-ST-3 | The 25 tasks of §2.1 finger-only, ≤ 2 taps deep from their noun | **Green in the browser; device spot check open** | The finger-only journeys on `chrome-touch` (`ha-J4f`, `ha-J6f`, `ha-J7`, `ha-J1`), `ha-02`…`ha-14` driven by CDP touch; the device checklist |
| AS-ST-4 | Touch counts from fresh projects with the real defaults | **Green** | J1 **11** (`ha-J1-rig-to-omoba`; from a generated model the rig part is **3** since P-T9-1, `ha-J1-generated`), J2 **9**, J3 **15**, J4 **10** finger-only and with the Pencil, J5 **6**, J6 **8** (finger-only **10**), J7 **7 + 2 strokes**, J9 **2** on a touch-only device / **1** with a mouse, J10 **0** (reload) / **1** (Continue) — the `ha-J*` specs with the test API's touch counter |
| AS-ST-5 | Same document → the same bytes as Pro and Auto-Rig; Halo's J1 log = Auto-Rig ①–⑤ | **Green** | `packages/halo/test/{rig-journeys,share-bytes,animate-journeys,curves-journey}.test.ts` (production kernel: J1's operator log on three models equals Auto-Rig's; every Share destination byte-equal), `ha-11`, `ha-J2`, `ha-J6` (Pro replays the same calls: equal GLB hashes) |
| AS-ST-6 | Halo → Pro → Halo keeps history, selection, time, the pane camera, commits a session; Pro arrives mapped | **Green** | `ha-12` (the GL context, document, history, autosave slot kept), `ha-J9` (selection, frame, workspace, and Pro's arrival toast since T12) |
| AS-ST-7 | Rig & Skin editable at 744 and 834 pt, after a round trip to Pro too; Pro's view-only rule unchanged | **Green** | `ha-14` (834 × 1194, 744 × 1133: dots, *Rig it*, a stroke, Pro and back, a stroke), `packages/editor/test/halo-t3-registrations.test.tsx` (`watchRigViewOnly` Pro-only) |
| AS-ST-8 | `/app` within its gate; `/editor`, `/autorig` +0 B from the route; extractions within ST-B1 | **Green (SIZE-1)** | `check:size`: `/app` **736,850 B**, `/editor` 902,757 B, `/autorig` 661,337 B against `dev` `b4bcf546`'s 735,842 / 902,533 / 661,174 B (gate 5,000,000 B each, SIZE-1 replaced the 700,000 B gate and the per-package allowances); `ekza-halo-shell` is banned from `/editor` and `/autorig` and dockview, the Studio and Auto-Rig shells and the curve editor from `/app`'s initial scripts; `apps/web/test/halo-size.test.ts` |
| AS-ST-9 | *Reduce gestures* on: every journey still doable | **Green** | `ha-13` |
| AS-ST-10 | Pro untouched by a Halo round trip; Halo's overrides gone after unmount | **Green** | `ha-12` › *AS-ST-10* (T12: the meaning of Pro's keys, the Shift+RMB marking menu's definition, every stored `ekza-animator:` key — preferences, layouts, presets — and the panes, before and after Ekza Studio ran every stage and changed its own input settings; it found and now holds ST-INT-15, Pro's marking menus lost after a round trip) and › *Rec is a shell override* (Rec's override gone in Pro); `packages/halo/test/animate-rec.test.ts`; `rules.test.ts` (no implicit preference write) |
| AS-ST-11 | A 60k-triangle character, bound, 3 animations, 30 minutes on an iPad Air without a reload | **Open (device)** | Checklist item 22 (D7, D8) |
| AS-ST-12 | Pencil pressure changes stamp strength; fast strokes leave no gap; palms never select or orbit | **Green in the browser; device open** | `ha-10` (CDP pen with pressure), `packages/viewport/test/halo-t9-paint-pressure.test.ts` (stamp spacing, coalesced samples, interpolation), `packages/viewport/test/arbiter.test.ts` (pen plus palm); checklist items 16–17 |
| AS-ST-13 | On iPad, *Export … to Files* and *Save project to Files* take two taps each; an export never clears the unsaved dot; `.vrm`, `.ekzanim`, `.vrma` open through sniffing | **Green in the browser; device open** | `ha-11` (mocked Web Share on `webkit-ipad`; the unsaved dot), `packages/editor/test` (sniffing, `SaveTicket`); checklist items 9–13 (D2, D11) |
| AS-ST-14 | axe (WCAG 2.2 AA) passes; targets ≥ 44 pt; inputs ≥ 16 px; VoiceOver reads the Halo, Path, Thread, Thumb key | **Green in the browser; VoiceOver open** | `ha-15` — axe now runs in the gate (`axe-core` 4.14.0, ST-INT-6) and is clean on every sheet in the three projects after T12's two label fixes; 44 px / 16 px at 1194, 834 and 390 pt; checklist item 27 |
| AS-ST-15 | Auto-Rig unchanged after the navigation extraction and the `autorigFlow` move | **Green** | the `ar-*` suite (incl. `ar-as-12`, `ar-t1-touch`, `ar-12` with its race fixed, ST-INT-8) |
| AS-ST-16 | Weight strokes with pressure replay identically headless and through MCP | **Green** | `packages/headless-tests/test/rig.paint-pressure.test.ts` |
| AS-ST-17 | The visible-target budget (≤ 22 at rest, ≤ 36 with a Halo) in every stage | **Green** | `ha-05`, `ha-06` |
| AS-ST-18 | No floater covers the selection; every ⋯ and primary action on screen at 1194, 834 and 390 pt | **Green** | `ha-15`, `ha-02`, `dev-touch` |
| AS-ST-19 | Every chip value equals the Channels readout, sign included, every control of Polybot and Seed-san | **Green** | `packages/halo/test/t12-chips-readout.test.ts` (T12: a pose with both signs through `channel.setValues`; the Numbers fields and the Echo chips' values against Pro's `channelText` for every TRS channel of every control), `packages/halo/test/sheets/numbers.test.ts` |
| AS-ST-20 | Every `UiDialog` value has a Halo handler or is listed as deferred | **Green** | `packages/halo/test/dialogs.test.ts` |
| AS-ST-21 | The real-device run by its named owner, evidence here | **Open — the owner's** | [device-checklist.ru.md](device-checklist.ru.md) (AS-ST-1, 11, 12, 13 and D1–D17) |

## Screenshots

Taken from the production e2e build by `apps/web/e2e/ha-t12-release.spec.ts` with `EKZA_T12_SHOTS=<folder>` (not
committed): the first visit's Home (Chrome and WebKit as an iPad), the chooser at `/?chooser=1`, Help › About with the
beta note, Pro's title, the live AI line, the phone Make tray.
