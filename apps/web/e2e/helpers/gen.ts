// M7 G-e (MODELING-PLAN §7.2 G-e; DECISIONS M7-GD-*): the E2E-GEN harness. The e2e server is a production build
// WITHOUT `GEN_GATEWAY_ENABLED` (default deny: gen-00 asserts its 404s), so each spec runs the REAL gateway
// (`@ekza-studio/gen-gateway`: a bearer token, spend caps, the job engine, uploads with their EXIF checks, artifacts
// by SHA-256) in the Playwright worker against the mock provider server (`@ekza-studio/gen-gateway/testing`), and
// routes the page's own `/api/gen/**` requests to it (the page keeps its origin, so the CSP is the shipped one).
// A routed response cannot stream, so the job event stream answers 503 and the client falls back to polling (e2e
// pages poll every 400 ms). Real providers are never called.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createGateway,
  createRedactingLogger,
  defaultAdapters,
  type Gateway,
  loadGatewayConfig,
  providerEnvs,
} from '@ekza-studio/gen-gateway';
import { type MockOptions, type MockProviderServer, startMockProviders } from '@ekza-studio/gen-gateway/testing';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const GEN_TOKEN = 'e2e-gateway-token-0123456789abcdef0123';

export interface E2eGateway {
  readonly mock: MockProviderServer;
  readonly gateway: Gateway;
  /** The page's requests the gateway answered (method and path). */
  readonly requests: string[];
  /** Log lines of the gateway (redacted). */
  readonly lines: string[];
  close(): Promise<void>;
}

const HOP_HEADERS = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'keep-alive']);

/**
 * Starts the mock providers and a gateway in this worker and routes the page's `/api/gen/**` to it.
 * `timeScale` slows or speeds the engine's provider polling (1 = the adapters' 3 s / 5 s).
 */
export async function routeGateway(
  page: Page,
  opts: { readonly mock?: MockOptions; readonly timeScale?: number } = {},
): Promise<E2eGateway> {
  const mock = await startMockProviders(opts.mock);
  const env = {
    GEN_GATEWAY_ENABLED: '1',
    GEN_GATEWAY_TOKEN: GEN_TOKEN,
    GEN_CAP_DAILY_USD: '5',
    GEN_CAP_MONTHLY_USD: '20',
    TRIPO_API_KEY: mock.keys.tripo,
    MESHY_API_KEY: mock.keys.meshy,
    GEN_TRIPO_BASE_URL: mock.tripoBase,
    GEN_MESHY_BASE_URL: mock.meshyBase,
  };
  const adapters = defaultAdapters();
  const lines: string[] = [];
  const gateway = createGateway({
    config: loadGatewayConfig(env, 'next', providerEnvs(adapters)),
    adapters,
    log: createRedactingLogger((line) => lines.push(line), [], 'info'),
    timeScale: opts.timeScale ?? 0.05,
    requestTimeoutScale: 0.5,
    basePath: '/api/gen',
  });
  await gateway.start();
  const requests: string[] = [];
  await page.route('**/api/gen/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.endsWith('/events')) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":{"code":"internal","message":"no stream in e2e","retryable":true}}',
      });
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(await request.allHeaders())) {
      if (!HOP_HEADERS.has(name.toLowerCase()) && !name.startsWith(':')) headers.set(name, value);
    }
    const body = request.postDataBuffer();
    const response = await gateway.handle(
      new Request(url, {
        method: request.method(),
        headers,
        ...(body === null || request.method() === 'GET' ? {} : { body: new Uint8Array(body) }),
      }),
      { remoteAddress: '127.0.0.1' },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    const out: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      out[name] = value;
    });
    await route.fulfill({ status: response.status, headers: out, body: bytes });
  });
  return {
    mock,
    gateway,
    requests,
    lines,
    async close() {
      await page.unroute('**/api/gen/**').catch(() => undefined);
      await gateway.close();
      await mock.close();
    },
  };
}

/** File › Generate with AI… → the Generate panel, connected with the gateway's token. */
export async function openGeneratePanel(page: Page, token: string | null = GEN_TOKEN): Promise<void> {
  await page.getByTestId('menu-file').click();
  await page.getByTestId('menu-item-shell.file.generate').click();
  await expect(page.getByTestId('gen-panel')).toBeVisible({ timeout: 30_000 });
  if (token === null) return;
  await expect(page.getByTestId('gen-needs-token')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('gen-token-input').fill(token);
  await page.getByTestId('gen-token-save').click();
  await expect(page.getByTestId('gen-submit')).toBeVisible({ timeout: 30_000 });
}

/** The tray's job row (the newest first). */
export const jobRow = (page: Page, index = 0) => page.getByTestId('gen-job').nth(index);

/** Waits until the newest job reaches `state`. */
export async function untilJob(page: Page, state: string, timeout = 60_000): Promise<void> {
  await expect(jobRow(page)).toHaveAttribute('data-state', state, { timeout });
}

/** Saves a screenshot under `EKZA_M7GD_SHOTS` (when set) and attaches it to the test. */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const image = await page.screenshot();
  const folder = process.env['EKZA_M7GD_SHOTS'];
  if (folder !== undefined && folder !== '') {
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/${name}.png`, image);
  }
  await testInfo.attach(name, { body: image, contentType: 'image/png' });
}

/** The integer stored in a data attribute. */
export async function dataNumber(page: Page, testId: string, attribute = 'data-value'): Promise<number> {
  return Number(await page.getByTestId(testId).getAttribute(attribute));
}
