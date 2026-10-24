// *Create with AI*'s binding (M7 G-d; DECISIONS M7-GD-16): the sheet's status words follow the flow's availability
// (T8's `data-state` names, ST-T8-18), the flow runs through the sheet that is open now and hands the token to the
// host's client, and *Rig it* hands the cleaned meshes to Auto-Rig's flow and goes to Rig.
import type { MeshId } from '@ekza-studio/doc';
import type { OperatorResult } from '@ekza-studio/editor-core';
import { describe, expect, it } from 'vitest';
import { haloGenFlow, haloGenHost, rigIt, statusOf } from '../src/generate/binding';
import { haloFlowStore } from '../src/intake/flowHost';
import { everyOperator, runOk } from './support';

describe('Create with AI: the binding (M7 G-d)', () => {
  it('maps the flow availability to the sheet status', () => {
    expect(statusOf({ status: 'ready' })).toBe('ready');
    expect(statusOf({ status: 'needs-token', message: '' })).toBe('token');
    expect(statusOf({ status: 'unavailable', message: '' })).toBe('hidden');
    expect(statusOf({ status: 'off' })).toBe('hidden');
    expect(statusOf({ status: 'checking' })).toBe('checking');
    expect(statusOf({ status: 'unknown' })).toBe('checking');
    expect(statusOf({ status: 'error', message: '' })).toBe('offline');
  });

  it('one flow per app, run through the sheet that is open now', async () => {
    const app = await everyOperator();
    const calls: string[] = [];
    const ctx = (name: string) => ({
      host: { app },
      run: (op: string): Promise<OperatorResult<unknown>> => {
        calls.push(`${name}:${op}`);
        return Promise.resolve({ status: 'finished', value: { job: { id: 'j' } } });
      },
      setStage: () => {},
    });
    const first = haloGenFlow(ctx('first'));
    const second = haloGenFlow(ctx('second'));
    expect(second).toBe(first);
    await first.host.run('gen.cancel', { job: 'x' });
    expect(calls).toEqual(['second:gen.cancel']);
    expect(haloGenHost(ctx('third')).app).toBe(app);
  });

  it('Rig it: the cleaned meshes become Auto-Rig’s subject and Halo goes to Rig', async () => {
    const app = await everyOperator();
    await runOk(app, 'workspace.set', { workspace: 'model' });
    const { mesh } = await runOk<{ mesh: MeshId }>(app, 'mesh.create.cube');
    const stages: string[] = [];
    const done = await rigIt(
      { host: { app }, run: (op, args) => app.runUntyped(op, args), setStage: (stage) => stages.push(stage) },
      { asset: 'a'.repeat(64) as never, meshes: [mesh], character: null, outcome: null, rig: 'auto-rig', warnings: [] },
    );
    expect(done).toBe(true);
    expect(stages).toEqual(['rig']);
    expect(haloFlowStore(app).get().subject).toEqual({ character: null, meshes: [mesh] });
    expect(app.session.getState().selection.objects).toEqual([mesh]);
  });
});
