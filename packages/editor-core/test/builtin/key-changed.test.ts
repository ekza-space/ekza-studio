// `key.set {channels: 'changed'}` (ST-KEY-3, the Simple layout's ◆ Key › Only changed channels; MVP-SPEC §4.11.1
// rule 2): the channels 'all' would key, filtered to the ones that changed since they were keyed — a session override
// (an unkeyed change on a keyed channel) or an unkeyed channel off its default (the static value Auto Key off writes);
// a changed rotation still keys all three; nothing changed is a refusal with a reason; one undo step.
import type { ChannelId, ControlId, LayerId } from '@ekza-studio/doc';
import { describe, expect, it } from 'vitest';
import type { EditorApp } from '../../src/types';
import { curveOf as waveCurve } from '../kernel/support';
import { cid, ikApp } from './ikFixture';
import { DEG, expectUndoRedoExact, opsApp, runOk, runResult, setSceneFrame, WAVE } from './support';

type App = EditorApp;

function select(app: App, ids: readonly ControlId[], channels: readonly [ControlId, ChannelId][] = []): void {
  app.session.setState({
    selection: {
      ...app.session.getState().selection,
      controls: ids,
      channels: channels.map(([control, channel]) => ({ control, channel })),
    },
  });
}

function keyFrames(app: App, control: ControlId, channel: string): number[] {
  const curve = waveCurve(app, control, channel);
  return curve === undefined ? [] : app.store.query.keysOfCurve(curve.id).map((k) => k.t);
}

describe("key.set {channels: 'changed'}", () => {
  it('keys an unkeyed change on a keyed channel (an override), with all three rotations, as one undo step', async () => {
    const app = opsApp();
    select(app, [WAVE.lowerArmL]);
    setSceneFrame(app, 5);
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.lowerArmL, channel: 'rz', value: 12 * DEG }] });
    expect(app.session.getState().overrides.get(WAVE.lowerArmL)).toEqual({ rz: 12 * DEG });
    const { value } = await expectUndoRedoExact(app, 'key.set', { channels: 'changed' });
    expect(value).toEqual({ count: 3 });
    expect(app.history.peekUndo()?.label).toBe('Key Changed Channels');
    expect(keyFrames(app, WAVE.lowerArmL, 'rz')).toEqual([0, 5, 15, 30]);
    expect(keyFrames(app, WAVE.lowerArmL, 'rx')).toEqual([5]);
    expect(keyFrames(app, WAVE.lowerArmL, 'ry')).toEqual([5]);
    // the override is consumed, as by every key.set
    expect(app.session.getState().overrides.size).toBe(0);
  });

  it('keys a change Auto Key off wrote as the static value, and nothing else of the control', async () => {
    const app = opsApp();
    expect(app.prefs.getState().autoKey).toBe(false);
    select(app, [WAVE.cog]);
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.cog, channel: 'tx', value: 0.2 }] });
    expect(waveCurve(app, WAVE.cog, 'tx')?.staticValue).toBeCloseTo(0.2, 12);
    expect(await runOk(app, 'key.set', { channels: 'changed' })).toEqual({ count: 1 });
    expect(keyFrames(app, WAVE.cog, 'tx')).toEqual([0]);
    for (const channel of ['ty', 'tz', 'rx', 'ry', 'rz']) expect(keyFrames(app, WAVE.cog, channel)).toEqual([]);
  });

  it('only the target controls that changed are keyed; the others are left alone', async () => {
    const app = opsApp();
    select(app, [WAVE.cog, WAVE.hips]);
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.hips, channel: 'rx', value: 5 * DEG }] });
    expect(await runOk(app, 'key.set', { channels: 'changed' })).toEqual({ count: 3 });
    for (const channel of ['rx', 'ry', 'rz']) expect(keyFrames(app, WAVE.hips, channel)).toEqual([0]);
    for (const channel of ['tx', 'rx']) expect(keyFrames(app, WAVE.cog, channel)).toEqual([]);
  });

  it('nothing changed: refused with a reason; after a key, nothing is changed any more', async () => {
    const app = opsApp();
    select(app, [WAVE.lowerArmL]);
    setSceneFrame(app, 5);
    expect(await runResult(app, 'key.set', { channels: 'changed' })).toEqual({
      status: 'cancelled',
      reason: 'Nothing changed since the last key',
    });
    // 'all' still keys the same selection
    expect(await runOk(app, 'key.set', { channels: 'all' })).toEqual({ count: 3 });
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.lowerArmL, channel: 'rx', value: 3 * DEG }] });
    await runOk(app, 'key.set', { channels: 'changed' });
    expect((await runResult(app, 'key.set', { channels: 'changed' })).status).toBe('cancelled');
  });

  it('a locked channel is never keyed, changed or not', async () => {
    const app = opsApp();
    select(app, [WAVE.cog]);
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.cog, channel: 'ty', value: 0.1 }] });
    await runOk(app, 'channel.toggleLock', { refs: [{ control: WAVE.cog, channel: 'ty' }], locked: true });
    expect(await runResult(app, 'key.set', { channels: 'changed' })).toMatchObject({ status: 'cancelled' });
  });

  it("attributes follow 'all': a changed foot roll keys; a changed @ikFk only when it is a selected channel", async () => {
    const { app } = ikApp();
    const foot = cid('ik.leg.L');
    select(app, [foot]);
    // a fresh foot: nothing changed (its rest values are its defaults)
    expect((await runResult(app, 'key.set', { channels: 'changed' })).status).toBe('cancelled');
    await runOk(app, 'channel.setValues', { edits: [{ control: foot, channel: '@roll', value: 20 * DEG }] });
    expect(await runOk(app, 'key.set', { channels: 'changed' })).toEqual({ count: 1 });
    const roll = app.store.query.curveFor(WAVE.clip, WAVE.layer, foot, '@roll');
    expect(roll === undefined ? [] : app.store.query.keysOfCurve(roll.id).map((k) => k.t)).toEqual([0]);
    // @ikFk is keyAll: false — a change keys it only while it is selected in the Channels panel
    setSceneFrame(app, 4);
    await runOk(app, 'channel.setValues', { edits: [{ control: foot, channel: '@ikFk', value: 0 }] });
    expect((await runResult(app, 'key.set', { channels: 'changed' })).status).toBe('cancelled');
    select(app, [foot], [[foot, '@ikFk']]);
    expect(await runOk(app, 'key.set', { channels: 'changed' })).toEqual({ count: 1 });
  });

  it('rejects an unknown channel set', async () => {
    const app = opsApp();
    select(app, [WAVE.cog]);
    expect(await runResult(app, 'key.set', { channels: 'moved' })).toMatchObject({ status: 'cancelled' });
  });

  it('ANIM-LAYERS: reads the layer key.set keys into — a static fix on the active layer, not the base composite', async () => {
    const app = opsApp();
    const fixes = ((await runOk(app, 'clip.adjustOnLayer')) as { layer: LayerId }).layer;
    select(app, [WAVE.cog]);
    // Nothing changed on Fixes yet, though the composite (the base's pose) is not the defaults everywhere.
    expect((await runResult(app, 'key.set', { channels: 'changed' })).status).toBe('cancelled');
    // Auto Key off writes a key-less change as the layer's static value: that channel (only) is changed.
    await runOk(app, 'channel.setValues', { edits: [{ control: WAVE.cog, channel: 'tx', value: 0.2 }] });
    const curve = app.store.query.curveFor(WAVE.clip, fixes, WAVE.cog, 'tx');
    expect(curve?.staticValue).toBeCloseTo(0.2, 14);
    expect(app.store.query.curveFor(WAVE.clip, WAVE.layer, WAVE.cog, 'tx')).toBeUndefined();
    setSceneFrame(app, 12);
    const { value } = await expectUndoRedoExact(app, 'key.set', { channels: 'changed' });
    expect(value).toEqual({ count: 1 });
    expect(app.store.query.keysOfCurve(curve?.id as never).map((k) => [k.t, k.v])).toEqual([
      [12, expect.closeTo(0.2, 14)],
    ]);
    // On the base the same change would read the composite: switching back, nothing on the base changed.
    await runOk(app, 'layer.setActive', { layer: WAVE.layer });
    expect((await runResult(app, 'key.set', { channels: 'changed' })).status).toBe('cancelled');
  });
});
