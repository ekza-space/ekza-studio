// The Thread's ◆ Key (STUDIO-TOUCH-SPEC §10.2, §10.3; ST-KEY-1 … ST-KEY-6, owner 2026-10-25: "an explicit Key button
// beside Rec") on Polybot's production kernel: greyed with "Select a body part to key" until something is selected; a
// tap is one `key.set` of every channel of the selected controls at the playhead (one undo step), with Rec on or off;
// the diamond fills on a key of the selection; the long-press offers All · Only changed · Selected channels; the toast
// names the part and the frame (or the seconds under Settings › Time).
import type { ControlId } from '@ekza-studio/doc';
import { overridePrefs } from '@ekza-studio/editor-core';
import { describe, expect, it } from 'vitest';
import { animateWords } from '../src/i18n/animate';
import { DISCLOSURE } from '../src/manifest/disclosure';
import { PLAIN_LABELS } from '../src/manifest/labels';
import { recPatch } from '../src/stages/animate/rec';
import { keyButtonState, keyCall, keyChoices, keyedText } from '../src/thread/strip/key';
import { polybotApp, runOk } from './support';

const w = animateWords.thread;

async function freshAnimation() {
  const { app, character } = await polybotApp();
  await runOk(app, 'clip.new', { character, name: 'Keyed', range: { start: 0, end: 60 } });
  const control = (key: string): ControlId => {
    const found = app.store.list('controls').find((c) => c.key === key);
    if (found === undefined) throw new Error(`no ${key}`);
    return found.id;
  };
  const select = (ids: readonly ControlId[], channels: readonly { control: ControlId; channel: string }[] = []) =>
    app.session.setState({
      selection: { ...app.session.getState().selection, controls: ids, channels: channels as never },
    });
  const frame = async (f: number) => runOk(app, 'time.setFrame', { frame: f });
  const keysOf = (id: ControlId) => {
    const clip = app.session.getState().activeClip[character];
    return app.store.query
      .curvesOfClip(clip as never)
      .filter((curve) => curve.control === id)
      .flatMap((curve) => app.store.query.keysOfCurve(curve.id).map((k) => ({ channel: curve.channel, t: k.t })));
  };
  return { app, control, select, frame, keysOf };
}

async function run(app: Awaited<ReturnType<typeof polybotApp>>['app'], call: ReturnType<typeof keyCall>) {
  return app.runUntyped(call.op, call.args);
}

describe('◆ Key in the Thread', () => {
  it('is greyed without a selection, and says to select a body part', async () => {
    const { app } = await freshAnimation();
    const state = keyButtonState(app);
    expect(state).toMatchObject({ reason: w.keySelectFirst, onKey: false, controls: [] });
    expect(w.keySelectFirst).toBe('Select a body part to key');
    expect(keyChoices(app, state).every((c) => c.reason === w.keySelectFirst)).toBe(true);
    app.dispose();
  });

  it('a tap keys every channel of the selection at the playhead as one undo step; the diamond fills there', async () => {
    const { app, control, select, frame, keysOf } = await freshAnimation();
    const arm = control('fk.upperArm.L');
    select([arm]);
    await frame(24);
    let state = keyButtonState(app);
    expect(state).toMatchObject({ reason: null, onKey: false, frame: 24, controls: [arm] });
    expect(state.subject).toBe(app.store.get('controls', arm)?.name);
    const steps = app.history.entries().undo.length;
    const result = await run(app, keyCall());
    expect(result.status).toBe('finished');
    expect(app.history.entries().undo.length).toBe(steps + 1);
    // every keyable channel of the upper arm (its three rotations at least), all at frame 24
    const keys = keysOf(arm);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(new Set(keys.map((k) => k.t))).toEqual(new Set([24]));
    state = keyButtonState(app);
    expect(state.onKey).toBe(true);
    // the toast: "Keyed L Upper Arm · frame 24", seconds under Settings › Time
    expect(keyedText(state, 'all', 'frames')).toBe(`Keyed ${state.subject} · frame 24`);
    expect(keyedText(state, 'all', 'seconds')).toBe(`Keyed ${state.subject} · 0.80 s`);
    // off the key: hollow again
    await frame(30);
    expect(keyButtonState(app).onKey).toBe(false);
    // one undo takes the whole key back
    await runOk(app, 'edit.undo');
    expect(keysOf(arm)).toEqual([]);
    app.dispose();
  });

  it('several parts: "3 parts", and every one of them is keyed', async () => {
    const { app, control, select, keysOf } = await freshAnimation();
    const ids = ['fk.upperArm.L', 'fk.lowerArm.L', 'fk.hand.L'].map(control);
    select(ids);
    const state = keyButtonState(app);
    expect(state.subject).toBe(w.keyParts(3));
    await run(app, keyCall());
    for (const id of ids) expect(keysOf(id).length).toBeGreaterThan(0);
    app.dispose();
  });

  it('with Rec on it still keys everything selected; Rec keys only what changed', async () => {
    const { app, control, select, frame, keysOf } = await freshAnimation();
    const off = overridePrefs(app.prefs, 'shell', recPatch(true));
    const arm = control('fk.upperArm.L');
    select([arm]);
    await frame(10);
    // Rec: a turn keys the channel it changed
    await runOk(app, 'channel.setValues', { edits: [{ control: arm, channel: 'rz', value: 0.3 }] });
    expect(keysOf(arm).map((k) => k.channel)).toEqual(['rz']);
    // nothing is left unkeyed: Only changed channels has nothing to key
    const changed = keyChoices(app, keyButtonState(app)).find((c) => c.choice === 'changed');
    expect(changed?.reason).toBe('Nothing changed since the last key');
    // ◆ Key: every channel of the selection
    expect((await run(app, keyCall('all'))).status).toBe('finished');
    expect(keysOf(arm).length).toBeGreaterThan(1);
    off();
    app.dispose();
  });

  it('with Rec off, Only changed channels keys the turned rotation (as a triple) and nothing else', async () => {
    const { app, control, select, frame, keysOf } = await freshAnimation();
    const off = overridePrefs(app.prefs, 'shell', recPatch(false));
    const arm = control('fk.upperArm.L');
    const hand = control('fk.hand.L');
    select([arm, hand]);
    await frame(12);
    await runOk(app, 'channel.setValues', { edits: [{ control: arm, channel: 'rx', value: 0.25 }] });
    expect(keysOf(arm)).toEqual([]);
    const changed = keyChoices(app, keyButtonState(app)).find((c) => c.choice === 'changed');
    expect(changed?.reason).toBeNull();
    expect((await run(app, keyCall('changed'))).status).toBe('finished');
    expect(
      keysOf(arm)
        .map((k) => k.channel)
        .sort(),
    ).toEqual(['rx', 'ry', 'rz']);
    expect(keysOf(hand)).toEqual([]);
    expect(app.history.peekUndo()?.label).toBe('Key Changed Channels');
    off();
    app.dispose();
  });

  it('the long-press: All and Only changed always; Selected channels only while channels are selected', async () => {
    const { app, control, select, keysOf } = await freshAnimation();
    const arm = control('fk.upperArm.L');
    select([arm]);
    expect(keyChoices(app, keyButtonState(app)).map((c) => [c.choice, c.label])).toEqual([
      ['all', 'All channels'],
      ['changed', 'Only changed channels'],
    ]);
    select([arm], [{ control: arm, channel: 'rx' }]);
    const choices = keyChoices(app, keyButtonState(app));
    expect(choices.map((c) => c.choice)).toEqual(['all', 'changed', 'selected']);
    expect(choices.find((c) => c.choice === 'selected')?.reason).toBeNull();
    expect((await run(app, keyCall('selected'))).status).toBe('finished');
    // a selected rotation keys all three, nothing else
    expect(
      keysOf(arm)
        .map((k) => k.channel)
        .sort(),
    ).toEqual(['rx', 'ry', 'rz']);
    expect(keyedText(keyButtonState(app), 'selected', 'frames')).toMatch(
      /^Keyed the selected channels of .+ · frame 0$/,
    );
    app.dispose();
  });

  it('its word is the plain name More and search show for key.set; the Thread is a depth-0 surface', () => {
    expect(w.key).toBe(PLAIN_LABELS['key.set']);
    const entry = DISCLOSURE['key.set'];
    expect(entry !== undefined && 'surfaces' in entry ? entry.depth : null).toBe(0);
    expect(entry !== undefined && 'surfaces' in entry ? entry.surfaces[0] : null).toEqual({ chrome: 'thread' });
  });

  it('keys only the selection, never the whole character', () => {
    expect(keyCall()).toEqual({ op: 'key.set', args: { channels: 'all', target: 'selected' } });
    expect(keyCall('changed').args.channels).toBe('changed');
  });

  it('ANIM-LAYERS: the diamond reads the layer ◆ Key keys into', async () => {
    const { app, control, select, frame } = await freshAnimation();
    const arm = control('fk.upperArm.L');
    select([arm]);
    await frame(24);
    await run(app, keyCall('all'));
    expect(keyButtonState(app).onKey).toBe(true);
    // A fix layer has no key at 24 yet: hollow; a key on it at 30 fills the diamond there, not at 24.
    await runOk(app, 'clip.adjustOnLayer');
    expect(keyButtonState(app).onKey).toBe(false);
    await frame(30);
    await run(app, keyCall('all'));
    expect(keyButtonState(app).onKey).toBe(true);
    await frame(24);
    expect(keyButtonState(app).onKey).toBe(false);
    app.dispose();
  });
});
