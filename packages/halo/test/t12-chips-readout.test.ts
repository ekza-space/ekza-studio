// AS-ST-19 (STUDIO-TOUCH-SPEC §22; recorded at T12): every chip value Ekza Studio shows for a control — the Numbers
// sheet's fields and the Echo channel chips' values (`i18n/channels.ts`) — equals Studio Pro's Channels readout
// (`channelText`, the panel's own formatting), sign included, for every control of Polybot and Seed-san, on a pose with
// turns and moves of both signs written through the operator Pro's Channels panel runs (`channel.setValues`).
import type { ChannelId, CharacterId, ControlRecord } from '@ekza-studio/doc';
import { type EditorApp, fromDisplayValue, channelUnit } from '@ekza-studio/editor-core';
import { channelText } from '@ekza-studio/editor/models';
import { describe, expect, it, vi } from 'vitest';
import { shownValue } from '../src/i18n/channels';
import { controlChannels, numbersSections } from '../src/sheets/numbers/model';
import type { Noun } from '../src/verbs/nouns';
import { everyOperator, runOk } from './support';

// Headless apps with every chunk load slowly on a busy machine.
vi.setConfig({ testTimeout: 120_000 });

async function sampleApp(sample: 'polybot' | 'seed-san'): Promise<{ app: EditorApp; character: CharacterId }> {
  const app = await everyOperator();
  const { character } = await runOk<{ character: CharacterId }>(app, 'file.loadSample', { sample });
  if (app.characters.get(character) === undefined) {
    await new Promise<void>((resolve) => {
      const off = app.characters.subscribe(() => {
        if (app.characters.get(character) === undefined) return;
        off();
        resolve();
      });
    });
  }
  await runOk(app, 'workspace.set', { workspace: 'animate' });
  return { app, character };
}

/** A shown value of both signs per channel: turns −15…+15°, moves −0.06…+0.06 m, scales 0.9…1.1. */
function shownFor(channel: ChannelId, k: number): number {
  const step = (k % 5) - 2;
  if (channel.startsWith('r')) return step * 7.5;
  if (channel.startsWith('t')) return step * 0.03;
  return 1 + step * 0.05;
}

const controlNoun = (control: ControlRecord, character: CharacterId): Noun => ({
  kind: 'control',
  id: control.id,
  ids: [control.id],
  label: control.name,
  count: 1,
  character,
});

describe('AS-ST-19: every chip value equals the Channels readout, sign included', () => {
  for (const sample of ['polybot', 'seed-san'] as const) {
    it(`on every control of ${sample}`, async () => {
      const { app, character } = await sampleApp(sample);
      const controls = app.store.list('controls').filter((c) => c.deleted === null);
      expect(controls.length).toBeGreaterThan(10);
      // the pose: every TRS channel of every control, through Pro's Channels operator
      const edits: { control: string; channel: ChannelId; value: number }[] = [];
      let k = 0;
      for (const control of controls) {
        for (const channel of controlChannels(control)) {
          if (channel.startsWith('@')) continue;
          edits.push({
            control: control.id,
            channel,
            value: fromDisplayValue(channel, shownFor(channel, k++), channelUnit(control, channel)),
          });
        }
      }
      await runOk(app, 'channel.setValues', { edits, key: 'auto', label: 'Pose' });
      const mismatches: string[] = [];
      let negatives = 0;
      let checked = 0;
      for (const control of controls) {
        const fields = numbersSections(app, controlNoun(control, character)).find((s) => s.id === 'channels')?.fields;
        for (const channel of controlChannels(control)) {
          if (channel.startsWith('@')) continue;
          const field = fields?.find((f) => f.id === `${control.id}/${channel}`);
          const stored = app.evaluation.channelValue(control.id, channel);
          const pro = Number(channelText(control, channel, stored));
          const chip = shownValue(channel as never, stored);
          const sheet = typeof field?.value === 'number' ? field.value : Number.NaN;
          checked++;
          if (pro < 0) negatives++;
          const same = (a: number) =>
            Math.abs(a - pro) <= 0.0005 && (Math.abs(pro) < 0.0005 || Math.sign(a) === Math.sign(pro));
          if (!same(sheet) || !same(chip)) {
            mismatches.push(`${control.name} ${channel}: Pro ${pro}, Numbers ${sheet}, chip ${chip}`);
          }
        }
      }
      expect(mismatches).toEqual([]);
      // the pose really had both signs, on many channels
      expect(checked).toBeGreaterThan(30);
      expect(negatives).toBeGreaterThan(5);
    });
  }
});
