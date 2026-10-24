// AS-ST-5 for the Rig stage (STUDIO-TOUCH-SPEC §12.2, §20.7 headless integration, §22; T9 exit test): Halo's J1 issues
// Auto-Rig's operator sequence. On the production kernel (the mesh kernel, the rig and library chunks), for the Cube Lad
// (T-pose), Polybot (A-pose: straightened) and the Cube Lad in centimetres (① sets its height first):
// - Halo's side is Halo's own code over its flow host (`intake/flowHost.ts`, recorded with `recordAutoRigFlow`): Home's
//   sample door (T11's `sampleIntake`: `intakeModel`), Checks › *Fix them in order* (`fixInOrder`), the Rig-it card
//   (`createRigIt`: open → *For: OMOBA* → *Rig it* → the motion test → *Starter set*), then Share's first entry
//   (`prepareExport` on the same host, as T11's sheet runs it);
// - Auto-Rig's side is `runAutoRigJourney` (the wizard's own step functions, T5b) with the same choices;
// - ①–④ and ⑤'s first entry give equal logs (and every recorded run finished); the reference logs T5b recorded for
//   ①–③ (`editor-core/test/autorigFlow/logs`) equal Halo's first three steps too;
// - ⑤: Share exports with Studio Pro's `file.exportCharacter` (ST-T9-…): its bytes equal `autorig.export`'s for the
//   same document (the author and the licence set the same way on both).
import { existsSync, readFileSync } from 'node:fs';
import { seededIdSource } from '@ekza-studio/doc';
import {
  type AutoRigExportResult,
  type AutoRigFlowLogEntry,
  autoRigFlowHost,
  createEditorApp,
  createMemoryBlobStore,
  type EditorApp,
  type ExportArtifact,
  intakeFileArgs,
  intakeModel,
  intakeSampleArgs,
  type KernelMeshRuntimes,
  loadMeshKernel,
  prepareExport,
  recordAutoRigFlow,
  runAutoRigJourney,
} from '@ekza-studio/editor-core';
import { createFakeServices } from '@ekza-studio/editor-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haloFlowHost } from '../src/intake/flowHost';
import { STARTER_SET } from '../src/recipes/addAnimations';
import { createRigIt, fixInOrder } from '../src/recipes/rigIt';
import { DEFAULT_OPTIONS, proCharacterExport, SPACE_PROFILE } from '../src/sheets/share/model';

const ROOT = new URL('../../../', import.meta.url);
const LOGS = new URL('packages/editor-core/test/autorigFlow/logs/', ROOT);

function servedFile(url: string): Uint8Array | null {
  const path = url.startsWith('/samples/')
    ? `fixtures/models/${url.slice('/samples/'.length)}`
    : url.startsWith('/library/')
      ? `apps/web/public/library/${url.slice('/library/'.length)}`
      : null;
  if (path === null) return null;
  const file = new URL(path, ROOT);
  return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
}

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string | URL) => {
    const bytes = servedFile(String(url));
    return Promise.resolve(
      bytes === null ? new Response(null, { status: 404 }) : new Response(bytes.slice().buffer, { status: 200 }),
    );
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** An app on the production kernel, as the journey tests of T5b build it (same ids on both sides). */
async function kernelApp(): Promise<EditorApp> {
  await loadMeshKernel();
  const app = createEditorApp({
    services: { ...createFakeServices(), blobs: createMemoryBlobStore() },
    idSource: seededIdSource(7),
    builtins: true,
  });
  app.prefs.setState({ firstRunDone: true });
  (app.meshes as KernelMeshRuntimes).attach(app);
  return app;
}

/** The Cube Lad exported in centimetres: its node scaled ×100 (AR-R5-1's case; T5b's fixture). */
function centimetreLad(): Uint8Array {
  const bytes = new Uint8Array(readFileSync(new URL('fixtures/models/cube-lad.glb', ROOT)));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    nodes: { scale?: number[] }[];
  };
  for (const node of json.nodes) node.scale = [100, 100, 100];
  let text = JSON.stringify(json);
  while (text.length % 4 !== 0) text += ' ';
  const chunk = new TextEncoder().encode(text);
  const rest = bytes.subarray(20 + length);
  const out = new Uint8Array(20 + chunk.byteLength + rest.byteLength);
  const outView = new DataView(out.buffer);
  out.set(bytes.subarray(0, 12));
  outView.setUint32(8, out.byteLength, true);
  outView.setUint32(12, chunk.byteLength, true);
  outView.setUint32(16, 0x4e4f534a, true);
  out.set(chunk, 20);
  out.set(rest, 20 + chunk.byteLength);
  return out;
}

type Model = { readonly sample: 'cube-lad' | 'polybot-apose' } | { readonly name: string; readonly bytes: Uint8Array };

const until = async (ok: () => boolean, ms = 20_000): Promise<void> => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

/** Halo's J1 on its own code: Home's intake, Checks' fixes, the Rig-it card, Share's first entry. */
async function haloJ1(model: Model) {
  const app = await kernelApp();
  const log = recordAutoRigFlow(haloFlowHost({ app, run: (op, args) => app.runUntyped(op, args) }));
  try {
    const host = log.host;
    // ① Home › a sample (T11's `sampleIntake`) or Bring a model (T11's `bringFiles`): the shared intake
    const intake =
      'sample' in model
        ? await intakeModel(host, 'autorig.sample', intakeSampleArgs(model.sample))
        : await intakeModel(host, 'autorig.intake', intakeFileArgs(model.name, model.bytes));
    expect(intake.status).toBe('finished');
    // Checks › Fix them in order (Auto-Rig ①'s order)
    const fixes = await fixInOrder(host);
    // ② the Rig-it card: Quick Rig with the guess; For: OMOBA (the finger detail follows)
    const card = createRigIt({ app, host, setDestination: () => {} });
    await card.open();
    expect(card.get().phase).toBe('dots');
    await card.destination('omoba');
    expect(card.get().fingers).toBe('thumb');
    // ③ Rig it, and the motion test plays
    await card.rig();
    expect(card.get().phase, card.get().message ?? '').toBe('done');
    await until(() => card.get().motion?.state === 'playing');
    // ④ Starter set: Idle · Walk · Run
    await card.starterSet();
    expect(card.get().phase).toBe('added');
    const character = card.get().character;
    if (character === null) throw new Error('no character');
    // ⑤ Share's first entry for a model character (T11: `prepareExport` on Halo's flow host; no remembered author)
    const record = app.store.get('characters', character);
    if (record === undefined) throw new Error('no record');
    await prepareExport(host, record, null);
    card.dispose();
    return { app, character, fixes, log: log.entries(), outside: log.outside() };
  } finally {
    log.stop();
  }
}

/** Auto-Rig ①–⑤ with the same choices (the wizard's step functions, T5b). */
async function autoRigJ1(model: Model) {
  const app = await kernelApp();
  const log = recordAutoRigFlow(autoRigFlowHost(app));
  try {
    const result = await runAutoRigJourney(log.host, {
      model,
      clips: [...STARTER_SET],
      author: null,
      meta: [{ authors: ['Tester'] }, { licensePreset: 'cc0' }],
    });
    return { app, result, log: log.entries(), outside: log.outside() };
  } finally {
    log.stop();
  }
}

/** The log entries before the step that starts with `op` (or all of them). */
function before(log: readonly AutoRigFlowLogEntry[], op: string): readonly AutoRigFlowLogEntry[] {
  const at = log.findIndex((entry) => entry.op === op);
  return at < 0 ? log : log.slice(0, at);
}

function reference(name: string): readonly AutoRigFlowLogEntry[] {
  return (JSON.parse(readFileSync(new URL(`${name}.json`, LOGS), 'utf8')) as { log: AutoRigFlowLogEntry[] }).log;
}

const sha = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

describe("Halo's J1 issues Auto-Rig's operator log (AS-ST-5, §12.2)", { timeout: 300_000 }, () => {
  const cases: readonly { readonly name: string; readonly model: () => Model; readonly ref: string }[] = [
    { name: 'the Cube Lad (T-pose)', model: () => ({ sample: 'cube-lad' }), ref: 'cube-lad' },
    { name: 'Polybot (A-pose, straightened)', model: () => ({ sample: 'polybot-apose' }), ref: 'polybot-apose' },
    {
      name: 'the Cube Lad in centimetres (① sets its height)',
      model: () => ({ name: 'cube-lad-cm.glb', bytes: centimetreLad() }),
      ref: 'cube-lad-cm',
    },
  ];
  for (const c of cases) {
    it(`${c.name}: ①–④ and ⑤'s first entry equal Auto-Rig's; ⑤'s bytes equal autorig.export's`, async () => {
      const halo = await haloJ1(c.model());
      const auto = await autoRigJ1(c.model());
      expect(auto.result.stopped).toBeNull();
      // nothing ran outside the flow, and every run finished
      expect(halo.outside).toEqual([]);
      expect(halo.log.every((entry) => entry.status === 'finished')).toBe(true);
      // ①–④ and ⑤'s first entry (the thumbnail): the same runs, arguments and document steps, in order
      const autoUpToMeta = before(auto.log, 'char.setVrmMeta');
      expect(halo.log.length).toBeGreaterThanOrEqual(11);
      expect(halo.log).toEqual(autoUpToMeta);
      if (process.env['T9_PRINT_LOGS'] === '1') {
        console.log(
          `${c.ref}: ${halo.log.map((e) => `${e.op}${e.document.length > 0 ? `[${e.document.join(',')}]` : ''}`).join(' → ')}`,
        );
      }
      // T5b's recorded references (①–③, the Walk motion test) equal Halo's first steps
      expect(before(halo.log, 'autorig.clip.add')).toEqual(before(reference(c.ref), 'autorig.clip.add'));
      const rig = halo.log.find((entry) => entry.op === 'autorig.rig');
      expect(rig?.args).toMatchObject({ straighten: c.ref === 'polybot-apose' });
      if (c.ref === 'cube-lad-cm') expect(halo.fixes).toEqual(['scale']);

      // ⑤ Share: the author and the licence (as on Auto-Rig's side), then Studio Pro's Character section request
      for (const patch of [{ authors: ['Tester'] }, { licensePreset: 'cc0' }]) {
        const edited = await halo.app.runUntyped('char.setVrmMeta', { character: halo.character, patch });
        expect(edited.status).toBe('finished');
      }
      const record = halo.app.store.get('characters', halo.character);
      if (record === undefined) throw new Error('no record');
      const shared = await halo.app.runUntyped(
        'file.exportCharacter',
        proCharacterExport(record, SPACE_PROFILE, 'vrm', DEFAULT_OPTIONS),
      );
      expect(shared.status).toBe('finished');
      const halos = (shared as { value: readonly ExportArtifact[] }).value;
      const autos = (auto.result.export?.result as AutoRigExportResult).artifacts;
      expect(halos.length).toBe(1);
      expect(autos.length).toBe(1);
      expect(sha(halos[0]?.bytes ?? new Uint8Array())).toBe(sha(autos[0]?.bytes ?? new Uint8Array()));
    });
  }
});
