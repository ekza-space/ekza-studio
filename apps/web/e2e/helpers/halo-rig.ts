// T9's e2e helpers (STUDIO-TOUCH-SPEC §12, §9 J1 / J7, §20.7): the Rig stage's slice of `halo()`, a tap counted by the
// journey (each deliberate tap, drag or filled field is one touch, §9), the centre of a test id, and the points of
// Quick Rig's dots and of the skin on the canvas.
import { expect, type Page, type TestInfo } from '@playwright/test';
import { halo } from './halo';
import { call } from './test-api';
import type { Point } from './touch';

export interface RigSlice {
  readonly mode: string;
  readonly poseView: string;
  readonly card: {
    readonly open: boolean;
    readonly phase: string | null;
    readonly stage: string | null;
    readonly fingers: string | null;
    readonly motion: string | null;
    readonly character: string | null;
    readonly message: string | null;
  };
  readonly dots: {
    readonly open: boolean;
    readonly view: string;
    readonly quickRig: boolean;
    readonly selected: string | null;
    readonly moved: number;
    readonly panes: readonly string[];
  };
  readonly painting: boolean;
  readonly brush: { readonly op: string; readonly radiusPx: number; readonly opacity: number; readonly value: number };
  readonly pressure: boolean;
  readonly active: string | null;
  readonly strokes: number;
  readonly spot: {
    readonly mesh: string;
    readonly point: number;
    readonly bones: readonly { readonly joint: string; readonly label: string; readonly weight: number }[];
  } | null;
  readonly bend: string;
  readonly show: string;
}

export async function rig(page: Page): Promise<RigSlice> {
  return (await halo(page)).slices['rig'] as RigSlice;
}

/** The centre of an element (page px). */
export async function centreOf(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (box === null) throw new Error(`${testId} is not on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A journey's own count of its touches (§9: one deliberate tap, drag or filled field each). */
export interface TouchLog {
  readonly steps: string[];
  count(step: string): void;
}

export function touchLog(): TouchLog {
  const steps: string[] = [];
  return { steps, count: (step) => steps.push(step) };
}

/** One tap on a test id: a touch on the touch projects (the page's touchscreen), a click on `chrome`. */
export async function tapId(page: Page, testId: string, info: TestInfo, log?: TouchLog): Promise<void> {
  const target = page.getByTestId(testId).first();
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  if (info.project.name === 'chrome') await target.click();
  else await target.tap();
  log?.count(testId);
}

/** A dot's page point in a pane (null while it is not drawn there). */
export async function dotPoint(page: Page, marker: string, paneId: string): Promise<Point | null> {
  return call(page, 'screenOfMarker', marker, 'R', paneId);
}
