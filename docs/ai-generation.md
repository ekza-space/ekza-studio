# AI generation: self-hosting the gateway

Ekza Studio can turn a prompt or a picture into a low-poly model through a paid 3D generation service (Tripo for
characters, Meshy for props), clean it up (triangle budget, flat colours, stand up and face front), and hand it to
Auto-Rig and the animation tools. The browser never talks to a provider. It talks to **your generation gateway**,
which holds the provider keys, enforces your spend caps and downloads the results. This guide shows how to run that
gateway and point an editor build at it. The design is [ADR 0017](adr/0017-ai-generation-boundary.md); the API and
every variable are in [the G-b/G-c note](wp-notes/m7-gbc.md); the editor side is [the G-d note](wp-notes/m7-gd.md).

```
 Browser (Studio Pro's Generate panel, Halo's Create with AI)
   │   GenerationClient (@ekza-studio/gen-core): same origin '/api/gen', or the build-time gateway URL
   ▼
 Generation gateway (@ekza-studio/gen-gateway)      ← provider keys, token, spend caps, job store, results by SHA-256
   │   egress allow-list: the providers' API hosts only
   ▼
 Tripo · Meshy (paid accounts)
```

## What you need

- **Provider accounts with API credit.** Tripo (international site; credits from $1) and/or Meshy (a paid plan; the
  API refuses free accounts). Both bill through Stripe in USD. Create an API key for each provider you want.
- **A long-running Node ≥ 24 process.** The gateway polls providers and downloads results in the background of the
  process that created a job, so it needs `next start` or the standalone server, not a serverless platform whose
  functions stop after the response.
- **A token and spend caps.** The gateway refuses to start without them (see below).

## The rules the gateway enforces

| Rule | What happens |
|---|---|
| **Default deny** | Without `GEN_GATEWAY_ENABLED=1` every path answers a plain 404. The editor then hides AI generation. |
| **Auth is required** | Enabled, it needs `GEN_GATEWAY_TOKEN` (at least 32 characters; a shared bearer token), or, for a standalone gateway on your own machine only, a loopback-only bind. Provider keys without auth: the process exits with code 78 and names the variables (never their values). |
| **Spend caps are required** | `GEN_CAP_DAILY_USD` and `GEN_CAP_MONTHLY_USD` (UTC day and month). A job whose quote would cross a cap is refused with 402, whatever the editor asks. |
| **Quote first** | The editor shows the price before Generate is enabled. The person also sets the most a job may cost; the gateway refuses a quote above it. |
| **No silent resubmits** | A create request that got no answer is never sent again; the job fails with "check the provider console". *Try again* is the person's choice and uses a new idempotency key. |
| **Clean inputs** | Pictures are re-encoded in the browser (PNG, no EXIF or GPS); the gateway refuses images that still carry EXIF or XMP, and sizes outside 64–8,192 px. |
| **Prompts stay private** | Rows and logs keep a prompt's SHA-256 only. The text enters the model's provenance only when the person ticks *Keep the prompt text in the file*. |
| **Paid plan attestation** | The provider's API cannot say which plan you are on. The person states it per provider; on a free plan the result may not be theirs to publish, and the export lints say so. |

## Option A: a server build of the editor (same origin)

The editor's own server mounts the gateway at `/api/gen` (server builds only; a static export has no route).

```sh
pnpm install --frozen-lockfile
pnpm --filter web build
GEN_GATEWAY_ENABLED=1 \
GEN_GATEWAY_TOKEN="$(openssl rand -hex 32)" \
GEN_CAP_DAILY_USD=5 GEN_CAP_MONTHLY_USD=30 \
TRIPO_API_KEY=… MESHY_API_KEY=… \
GEN_DATA_DIR=/var/lib/ekza-gen \
pnpm --filter web start
```

Open the editor, choose **File › Generate with AI…**, and paste the token when the panel asks for it (it is kept in
memory for the page only). Without `GEN_GATEWAY_ENABLED=1` the same build answers 404 and the panel says AI
generation is not set up; the menu item then disappears for that page.

## Option B: the standalone gateway (dev VPS) and a static editor

The dev editor (`studio.dev.ekza.io`) is a static export, so it talks to a standalone gateway at a fixed origin, for
example `gen.dev.ekza.io`, behind the VPS's Caddy. The full runbook is in [the G-b/G-c note](wp-notes/m7-gbc.md#running-the-gateway-on-the-dev-vps-when-it-is-reachable-again);
in short:

1. **DNS:** `gen.dev.ekza.io` → the VPS (owner action).
2. **Code:** `git archive <commit> | tar -x -C /opt/ekza-gen-gateway/app`, then
   `pnpm install --frozen-lockfile --prod --filter @ekza-studio/gen-gateway` (no third-party packages).
3. **Secrets:** copy `packages/gen-gateway/deploy/gen-gateway.env.example` to `/opt/ekza-dev/secrets/gen-gateway.env`
   (mode 0600) and fill in:
   - `GEN_GATEWAY_ENABLED=1`, `GEN_GATEWAY_TOKEN=$(openssl rand -hex 32)`;
   - `GEN_GATEWAY_HOST=127.0.0.1`, `GEN_GATEWAY_PORT=18787` (Caddy terminates TLS);
   - `GEN_CAP_DAILY_USD=5`, `GEN_CAP_MONTHLY_USD=30`;
   - `GEN_ALLOWED_ORIGINS=https://studio.dev.ekza.io` (the editor builds that may call it, CORS);
   - `GEN_DATA_DIR=/var/lib/ekza-gen-gateway`;
   - `TRIPO_API_KEY`, `MESHY_API_KEY`.
4. **Service:** `packages/gen-gateway/deploy/gen-gateway.service.example` → systemd (`RestartPreventExitStatus=78`, so
   a refused configuration does not restart in a loop).
5. **Caddy:** the site block of `packages/gen-gateway/deploy/Caddyfile.example` (TLS, `flush_interval -1` for the
   job event stream, a 21 MB body limit).
6. **Check:** `curl https://gen.dev.ekza.io/healthz` → `ok`; `/v1/providers` → 401 without the token, the provider
   list with it.

### Point the static editor at it: `STUDIO_GEN_GATEWAY_URL`

The gateway URL of a static export is fixed at build time, because the page's Content-Security-Policy must name it
(`connect-src`) and a static file cannot learn it later:

```sh
STUDIO_STATIC_EXPORT=1 STUDIO_GEN_GATEWAY_URL=https://gen.dev.ekza.io pnpm --filter web build
pnpm run check:gen-boundary   # no provider key name, provider host or gateway code in the client bundle
```

- The URL must be `https` (or `http` on loopback); anything else stops the build.
- Its origin enters the page's CSP; nothing else does. A page script cannot reach a provider or any other origin.
- The build's client gets the URL as `NEXT_PUBLIC_EKZA_GEN_GATEWAY`. With no URL, a static export hides AI generation;
  a server build defaults to its own `/api/gen`.
- The gateway must list the editor's origin in `GEN_ALLOWED_ORIGINS`.

`editor-dev.sh` passes the environment through to the static export.

## Using it

1. **File › Generate with AI…** (Studio Pro) or **Create with AI** in Make (Ekza Studio's touch layout). The panel
   asks the gateway what it offers when it opens, never on page load.
2. **From a picture** or **From words**. A picture is re-encoded here and sent to your gateway; it reaches the
   provider only when you press Generate. Say whether it shows a real person.
3. **Size:** Prop (≤ 500 triangles, Meshy by default), Character (≤ 3,000, Tripo), Hero (≤ 10,000, Tripo). You may
   pick the other service. Its terms are shown as badges: who owns the result, whether inputs train models, how long
   files are kept, attribution and other duties.
4. **Your plan** with that service (paid or free), then the **price line** (credits, USD, what your caps leave today
   and this month) and **At most $**.
5. **Generate.** The job appears in the **Generations** list and in the help line; you can **Stop** a job the provider
   has not started (Meshy also while it waits), and **Try again** a failed one.
6. **Bring it in** opens the clean-up: size preset, colours (16 by default), flat colours or the texture, height. It
   imports and cleans the model in one undo step and shows the triangle and colour budgets and any warnings. **Clean up
   again** with other settings replaces the last import.
7. **Rig it** hands the model to Auto-Rig. Tripo can also rig it with VRM bone names (**Rig with Tripo**, a second
   paid request, shown with its price).
8. Every generated model records where it came from (`AssetRecord.provenance`): the service, the pinned model, the
   parameters, the input hashes, the terms, the clean-up steps (reduce and palette bake may alter invisible AI marks,
   which is recorded), your plan. Exports write it into `ekza_model_v1.provenance.generator`, so a published file
   discloses that it is AI-generated.

## Testing without spending money

- Unit and headless tests run the real gateway in-process against the mock provider server
  (`@ekza-studio/gen-gateway/testing`: Tripo-like and Meshy-like state machines with scripted failures).
- The E2E-GEN specs (`apps/web/e2e/gen-*.spec.ts`) run the gateway in the Playwright worker and route the page's
  `/api/gen` requests to it; the e2e server itself keeps the gateway disabled.
- Real providers are used only by the manual smoke script, which needs `--confirm-spend` and stops at $5:
  `TRIPO_API_KEY=… MESHY_API_KEY=… node packages/gen-gateway/scripts/smoke-real.ts --confirm-spend --out <dir>`.

## Troubleshooting

| You see | Meaning |
|---|---|
| "AI generation is not set up on this server" | The gateway answered 404: `GEN_GATEWAY_ENABLED` is not `1` (or the build has no gateway URL). |
| The token prompt | The gateway answered 401: paste `GEN_GATEWAY_TOKEN`. A wrong token asks again. |
| "It is over what this server may spend now" | A spend cap would be crossed; raise `GEN_CAP_*` or wait for the next UTC day or month. |
| A service shows "(not configured)" | Its key is not set on the gateway. |
| The process exits with 78 | A refused configuration: keys without auth, missing caps, a weak token, a bad URL. The log line names the variables. |
| CORS errors in a static build | Add the editor's origin to `GEN_ALLOWED_ORIGINS`. |
| "No answer from the provider: check its console before trying again" | A create request got no answer; it may have created a task. Look in the provider's console before **Try again**. |
