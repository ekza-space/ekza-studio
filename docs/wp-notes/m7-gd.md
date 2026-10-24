# M7 G-d + G-e — the Generate flow, its operators, the panel and the E2E-GEN scenarios (`m7/gd-generate`)

Work packages G-d and G-e of [MODELING-PLAN](../MODELING-PLAN.md) §7.2 (§3.11, §7.3) under
[ADR 0017](../adr/0017-ai-generation-boundary.md) and DECISIONS §G.6 (Q-GEN-1…10). Branch `m7/gd-generate` off `dev`
`b8fc6a32`, with `dev` merged at `2bde8c24` (G-a, the intake operators) and `e1208263` (T8, the Make stage). The owner's goal (2026-10-24): write a prompt
or attach a photo → a generator, through our gateway, returns a model → Studio cleans it → the person tweaks it →
Auto-Rig → animation; characters and props alike, mainly on the iPad. Decisions:
[DECISIONS-OPEN §V](../DECISIONS-OPEN.md#v-m7-g-d-the-generate-flow-the-operators-and-the-panel-2026-10-25), rows
`M7-GD-1` … `M7-GD-16`. The self-host guide: [ai-generation.md](../ai-generation.md).

## What landed

| Part | Files | What |
|---|---|---|
| The flow (UI-free, both shells) | `editor-core/src/genFlow/{flow,session,presets,ops,provenance,table,disclose,image,text,types,index}.ts` | `createGenFlow(host)` / `genFlowOf(host, key)`: availability (ready, needs-token, unavailable), inputs (words or a picture re-encoded here), presets and providers, terms badges, the attested plan, the quote line and *At most*, submit, the job tray (the app's session: watches, cancel, retry, dismiss, resume after a reload), the clean-up (`gen.import` with live budgets, warnings, re-run), the provenance badge, Rig it offers and the provider's rig; the `ekza.generations` link; AI disclosure on export |
| The operators | `editor-core/src/operators/builtin/gen.ts`, `operators/args.ts` (4 rows), `builtin/index.ts` | `gen.submit`, `gen.cancel`, `gen.retry`, `gen.import` (internal; eager polls with plain reasons, lazy bodies) |
| Exports | `editor-core/src/workflows/{exportModel,exportCharacter}.ts` | `ekza_model_v1.provenance.generator` from the linked generated asset (static GLB and character VRM/GLB), `aiGenerated` for the mesh lint |
| The host's client | `editor/src/services/generation.ts`, `services/browser.ts`, `host/StudioHost.tsx`, `apps/web/app/(studio)/hostProps.ts` | `createLazyGenerationClient({baseUrl, pollMs})` (gen-core loads with the first call), `setGenerationToken` (memory only); the base is `NEXT_PUBLIC_EKZA_GEN_GATEWAY` |
| Studio Pro | `editor/src/panels/generate/{index.ts,GeneratePanelLazy.tsx,GeneratePanel.tsx}`, `shell/menuItems.ts`, `shell/HelpLine.tsx`, `shell/genTraySlot.ts`, `panels/index.ts` | File › Generate with AI… (only with a gateway; removed after a 404), the lazy Generate panel (picture and words tabs, presets, service and terms, plan, price, Generate, the tray, the clean-up dialog, Rig it, Rig with Tripo), the help line's job pill |
| Halo | `halo/src/stages/make/ai/CreateWithAiSheet.tsx`, `halo/src/generate/binding.ts`, `halo/src/i18n/make.ts`, `halo/src/manifest/{disclosure,labels}.ts` | T8's *Create with AI* sheet made real (below); the manifest rows on the `createAi` sheet |
| Agents | `agent-tools/src/policy.ts` | Every spend asks the person: `gen.submit`, `gen.retry` confirm (Edit), `gen.cancel` confirm (View), `gen.import` confirm (Edit) |
| Gates | `apps/web/scripts/check-size.mjs`, `tooling/check-deps.mjs`, `.oxlintrc.json` | The `generate` lazy boundary (`ekza-generate-flow`); editor may hold gen-core types and load the client by a dynamic import; headless-tests and the e2e specs may run the gateway and its testing kit |
| Tests | `editor-core/test/m7/gen.test.ts`, `headless-tests/test/m7.generate.test.ts`, `apps/web/e2e/gen-0{1..6}-*.spec.ts`, `apps/web/e2e/helpers/gen.ts` | below |
| Docs | `docs/ai-generation.md`, this note, DECISIONS §V | |

## The flow model's API (for the Halo sheet)

Everything is exported from `@ekza-studio/editor-core` (tree-shaken; only lazy chunks import it). Halo's sheet binds
it through `halo/src/generate/binding.ts`:

```ts
import { useCreateWithAi, CREATE_WITH_AI_PRESETS, GEN_TEXT } from '../../../generate/binding';

const ai = useCreateWithAi(ctx);          // ctx: the sheet's HaloSheetContext (host, run, setStage)
ai.view.availability                      // { status: 'unknown' | 'checking' | 'ready' | 'needs-token' | 'unavailable' | 'error' | 'off', message? }
ai.flow.setToken(token)                   // on 'needs-token' (kept in memory by the host)
ai.flow.setMode('image-to-model' | 'text-to-model')
ai.flow.setPrompt(text); ai.flow.setKeepPrompt(boolean)
await ai.flow.setImage(file, file.name)   // re-encoded here (PNG, no EXIF/GPS), uploaded to the gateway
ai.flow.setRealPerson(true | false)       // asked for a picture
ai.flow.setPreset('prop' | 'character' | 'hero')   // CREATE_WITH_AI_PRESETS: ids, labels, details
ai.flow.setProvider(id | null)            // null = the preset's (Tripo for characters, Meshy for props)
ai.view.providers / ai.view.provider      // { info, tier, terms: [{ tone, text }] }
ai.flow.attest(providerId, 'paid' | 'free')
ai.view.quoteLine                         // "$0.50 (50 credits) · P1-20260311 · $4.50 left today, $19.50 this month"
ai.flow.setMaxCost(usd)
ai.blocked                                // null when Create may run, else the plain reason
await ai.create()                         // gen.submit → the job id (or null; ai.state.message says why)
ai.view.jobs                              // [{ id, title, provider, stateText, progress, active, canCancel, canRetry, canImport, imported, badge, … }]
ai.flow.cancel(id); ai.flow.retry(id); ai.flow.dismiss(id)
await ai.bringIn(id)                      // gen.import (clean-up preset, one undo step), then Rig / Animate / Make
ai.flow.openPost(id); ai.flow.setPost({ preset, colours, texture, height }); await ai.flow.runPost()   // the clean-up with settings
ai.flow.rigOffers(id)                     // ['auto-rig'] or ['auto-rig', 'provider']
await ai.flow.quoteProviderRig(id); await ai.flow.providerRig(id)    // the provider's VRM-named rig (a paid job)
```

`GEN_TEXT`, `jobStateText`, `quoteLine`, `termsBadges` and `provenanceBadgeText` are the words Studio Pro says;
Halo's vocabulary may replace them.

## How it works

**Availability without a request on load.** The host creates a lazy `GenerationClient` when the build has a gateway
base (server builds `/api/gen`; a static export only with `STUDIO_GEN_GATEWAY_URL`). Nothing is requested until the
panel or the sheet opens: `providers()` then answers ready, 401 (the token prompt) or 404 (not enabled: the controls are
hidden, one plain line says so, and File › Generate with AI… goes away for the page). A default server build therefore
never logs a 404 on page load (M7-GD-5).

**Before spending.** Generate stays off, with the reason shown, until the gateway is ready, the input is there (a
picture is re-encoded and uploaded; its person question answered), the plan with that provider is stated (Q-GEN-9),
and the quote line is shown within *At most* and the server caps (M7-GD-9). The request is the preset's: the face
budget clamped to the provider's low-poly range, its native low-poly model, base-colour textures (M7-GD-8).

**The job tray.** `gen.submit` sends the request with a fresh idempotency key and watches the job (SSE, polling as the
fallback) into the app's session; the panel's list and the help line's pill show the plain state ("Waiting at the
provider", "Generating 40%", "Downloading the model", "Ready", "Failed: …", "Stopped"). *Stop* is offered until the
results download; *Try again* resends the same request under a new key.

**Import and clean-up in one step.** `gen.import` downloads the model (hash-checked by the client), then composes
`mesh.intake {bytes, name, preset, forward, colours, texture, height}`'s own poll, `prepare` and `apply` in its
transaction, patches the asset's provenance and writes the `ekza.generations` link: one undo step, *Import Generated
Model* (M7-GD-3). The clean-up dialog shows the triangle budget against the preset, the colours against 16, the
chain's steps and warnings, and the provenance badge; *Clean up again* undoes the last import first (M7-GD-11).

**Provenance and disclosure.** `AssetRecord.provenance = {origin: 'generated', derivedFrom: [], redistributable,
generator}`: the gateway's record plus the post steps that ran (reduce, palette bake and texture downsize record
`aiMarksMayBeAltered: true`) and the prompt text only on opt-in, checked against its hash (M7-GD-13). Exports follow
the link (through a rig's adoption) and write the generator into `ekza_model_v1.provenance.generator`; the file's
provenance lints then read it (M7-GD-4).

**Rig.** A humanoid preset offers *Rig it* (Auto-Rig with the generated meshes) and, for Tripo, *Rig with Tripo (VRM
bones)*: a second paid job of the provider's own model, imported through `file.importModel` as a character.
`char.makeEditable` is a deferred stub on `dev`, so that character is animatable but not editable (M7-GD-12).

## Tests

| Where | What |
|---|---|
| `editor-core/test/m7/gen.test.ts` (7) | Plain poll reasons (no gateway, unknown jobs, missing inputs); presets → providers, terms badges, the plan before the quote, the price line, *At most*; submit → tray → import: `mesh.intake` with Tripo's +X, ≤ 3k triangles, ≤ 16 colours, one undo step, the asset's provenance (post steps, hashes, tier, task id), the link, the badge, undo and redo, *Clean up again*; the prompt kept only on opt-in; cancel and retry (new key, same prompt); the provider's VRM rig imported as a character; a static export discloses the generator |
| `headless-tests/test/m7.generate.test.ts` (2) | gen-core's and editor-core's provenance helpers agree; **the §7.3 acceptance headless** through the real gateway (token, caps) and the mock providers: one picture → Tripo P1 → clean-up (96,824 → ≤ 3,000 triangles, ≤ 16 colours) → Auto-Rig's flow (hand-over, fixes, markers, rig) → idle and walk → the Ekza VRM: no error lint, vrm-validator clean, `ekza_model_v1.provenance.generator` = Tripo P1, paid, no task id; secrets never in the gateway's log |
| `apps/web/e2e/gen-0*.spec.ts` (Chrome) | E2E-GEN-01 words → a Tripo character; E2E-GEN-02 a picture with EXIF → re-encoded → a Meshy prop; E2E-GEN-03 a failure and *Try again*; E2E-GEN-04 *Stop*; gen-05 the panel hidden when the gateway is disabled; gen-06 the §7.3 acceptance through the UI (Generate panel → Auto-Rig wizard → Idle, Walk → the Ekza VRM, both validators) |
| Updated | `editor-core/test/builtin/registration.test.ts` (the four operators), `agent-tools/test/policy.test.ts` (their actor runs) |

## E2E-GEN results

RESULTS

## Acceptance (§7.3, against the mock)

ACCEPTANCE

## Gate and sizes

GATE

## Screenshots

`/private/tmp/claude-501/-Users-wotori-git/d810d71f-f77c-5950-8a1f-82bdfe6725d3/scratchpad/m7/gd-*.png` (not
committed; produced by the specs with `EKZA_M7GD_SHOTS=<folder>` and attached to each test).

## Halo: *Create with AI* (T8's sheet, made real)

T8 merged at `e1208263` (`dev` merged here at `f3db804b`); its sheet now runs the flow:

| Part | What |
|---|---|
| `stages/make/ai/CreateWithAiSheet.tsx` | The status line (T8's `data-state`: checking, token, offline, hidden, ready) with the **token prompt** on a 401 (P-T8 G-d); *Describe it* and *Attach a photo* (a photo makes a picture request; it is redrawn here and its person question asked); the size (Prop / Character / Hero); the service with its terms; the plan with it (no answer until the person gives one: the kit's `Segmented` always marks a choice, so the plan and the person question are toggle rows); the price line; *Create* with its plain reason when off; the jobs with progress, *Stop*, *Try again*, *Bring it in*; the result (triangles of the budget, colours, warnings, the made-with-AI badge) with *Rig it* and *Rig with Tripo* |
| `generate/binding.ts` | `useCreateWithAi(ctx)`; `bringIn` (the clean-up in Make, one undo step; a provider-rigged character goes to Animate); `rigIt` (the cleaned meshes become Auto-Rig's subject through `takeHandedSubject` on Halo's flow host — the subject the Rig-it card rigs — then the Rig stage; T9's files untouched) |
| `stages/make/ai/availability.ts` | T8's entry probe, unchanged: the entries show for a gateway that answers, wants its token or does not answer, and hide for none or a 404 |
| `i18n/make.ts` | The sheet's words (the vocabulary lint passes) |
| Manifest | The four `gen.*` rows and `workspace.showPanel {panel: 'generate'}` on the `createAi` sheet (T8, built) |

## Open items

- `char.makeEditable` (deferred in M6b) would make a provider-rigged character editable; until then Auto-Rig is the
  default rig of generated humanoids.
- Meshes made from a generated one by Separate, Combine or Duplicate are not linked (M7-GD-4); a mesh-level lineage
  field would close it.
- Auto-Rig's *Decimate first* button (G-a open item 3) is still the Auto-Rig owner's.
- Real providers: the manual smoke script (owner actions of [m7-gbc](m7-gbc.md#owner-actions)); the panel has not met a
  live gateway.
- FEATURES.md rows (Generate panel, Create with AI) belong to the release that ships them.
