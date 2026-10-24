// Halo Make and Paint e2e helpers (STUDIO-TOUCH-SPEC §9 J2, J6, §11, §13.1; T8): the test API's `make` and `paint`
// slices, the journeys' touch counter, element centres, and points on a mesh's faces (from the mesh's world positions,
// projected with the single pane's camera).
import { expect, type Page } from '@playwright/test';
import { halo, PANE } from './halo';
import { call } from './test-api';
import { cdp, type Point, touchEvent } from './touch';

export interface MakeSlice {
  readonly menu: string | null;
  readonly selectArea: boolean;
  readonly tool: string;
  readonly extrude: boolean;
  readonly cap: { readonly x: number; readonly y: number; readonly dx: number; readonly dy: number } | null;
  readonly value: { readonly op: string; readonly param: string; readonly value: number } | null;
  /** Create with AI's availability (ST-T8-18). */
  readonly ai: 'checking' | 'hidden' | 'offline' | 'token' | 'ready';
}

export interface PaintSlice {
  readonly palette: string | null;
  readonly swatches: number;
  readonly active: string | null;
  readonly focus: string | null;
  readonly fill: boolean;
  readonly pick: boolean;
  readonly tool: string;
}

export async function makeSlice(page: Page): Promise<MakeSlice> {
  await expect.poll(async () => (await halo(page)).slices['make'] !== undefined).toBe(true);
  return (await halo(page)).slices['make'] as MakeSlice;
}

export async function paintSlice(page: Page): Promise<PaintSlice> {
  await expect.poll(async () => (await halo(page)).slices['paint'] !== undefined).toBe(true);
  return (await halo(page)).slices['paint'] as PaintSlice;
}

/** The journeys' touch counter (AS-ST-4). */
export async function touches(page: Page): Promise<number> {
  return (await halo(page)).touches;
}

/** The centre of an element by test id (page px). */
export async function centre(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (box === null) throw new Error(`no ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The pane's rectangle (page px). */
export async function paneRect(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const pane = (await call(page, 'panes')).find((p) => p.id === PANE);
  if (pane === undefined) throw new Error('no single pane');
  return pane.rect;
}

/** The pane's centre (page px): everything framed, the middle of the scene's bounds. */
export async function paneCentre(page: Page): Promise<Point> {
  const r = await paneRect(page);
  return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
}

/** The live meshes' ids. */
export async function meshIds(page: Page): Promise<string[]> {
  return (await call(page, 'meshes')).filter((m) => m.badge !== 'asset').map((m) => m.id);
}

/** Whether a page point is on the canvas (no chrome covers it). */
export async function onCanvas(page: Page, at: Point): Promise<boolean> {
  return await page
    .evaluate(
      (p) => document.elementFromPoint(p.x, p.y)?.closest('[data-ekza-pane]')?.getAttribute('data-ekza-pane') ?? null,
      at,
    )
    .then((pane) => pane === PANE);
}

/** One finger along a path of points (one drag: a scrub that overshoots and comes back is one touch). */
export async function fingerPath(page: Page, path: readonly Point[]): Promise<void> {
  const [first, ...rest] = path;
  if (first === undefined) return;
  const s = await cdp(page);
  await touchEvent(s, 'touchStart', [first]);
  for (const p of rest) await touchEvent(s, 'touchMove', [p]);
  await touchEvent(s, 'touchEnd', []);
  await s.detach();
}
