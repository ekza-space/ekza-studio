// T9's e2e helpers (STUDIO-TOUCH-SPEC §12, §9 J1 / J7, §20.7): the Rig stage's slice of `halo()`, a tap counted by the
// journey (each deliberate tap, drag or filled field is one touch, §9), the centre of a test id, and the points of
// Quick Rig's dots and of the skin on the canvas.
import { expect, type Page, type TestInfo } from '@playwright/test';
import { halo } from './halo';
import { call } from './test-api';
import type { Point } from './touch';

export interface RigSlice {
  readonly mode: string;
  readonly subject: { readonly character: string | null; readonly meshes: readonly string[] };
  readonly startPose: string | null;
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

/**
 * A rigged Cube Lad through the real shell (setup, not a counted journey): Home › Cube Lad (the shared intake) → the
 * Next chip's Rig-it card → *Rig it* → *Not now*. Returns the character's id.
 */
export async function rigCubeLadThroughCard(page: Page, info: TestInfo): Promise<string> {
  await tapId(page, 'halo-home-sample-more', info);
  await tapId(page, 'halo-home-sample-cube-lad', info);
  await expect(page.getByTestId('halo-home')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await halo(page)).stage, { timeout: 60_000 }).toBe('rig');
  await tapId(page, 'halo-rig-it', info);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 60_000 }).toBe('dots');
  await tapId(page, 'halo-rig-go', info);
  await expect.poll(async () => (await rig(page)).card.phase, { timeout: 180_000 }).toBe('done');
  await tapId(page, 'halo-rig-not-now', info);
  await expect.poll(async () => (await rig(page)).card.open).toBe(false);
  const character = (await call(page, 'characters'))[0]?.id;
  if (character === undefined) throw new Error('no character');
  return character;
}

/** A joint of a character by its VRM human bone. */
export async function humanJoint(page: Page, character: string, bone: string): Promise<string> {
  const joint = (await call(page, 'skeleton', character))?.joints.find((j) => j.humanBone === bone);
  if (joint === undefined) throw new Error(`no ${bone}`);
  return joint.id;
}

/** A page point on a bone of the character in a pane (the skin over it): a fraction `t` along joint → child. */
export async function bonePoint(
  page: Page,
  character: string,
  bone: string,
  child: string,
  paneId = 'pane-single',
  t = 0.5,
): Promise<Point> {
  const point = await call(
    page,
    'screenOfBone',
    await humanJoint(page, character, bone),
    await humanJoint(page, character, child),
    paneId,
    t,
  );
  if (point === null) throw new Error(`${bone} is not on screen`);
  return point;
}
