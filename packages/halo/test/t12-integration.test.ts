// T12's integration patches (STUDIO-TOUCH-SPEC §21 T12): the floating grammar starts under the session or target bar
// (P-T9-2); the top bar's live AI activity line — the eager slot and what the agent's state puts in it (P-T10-3, §14);
// the front door's flag in Halo's copy (P-T6A-5, ST-INT-1).
import type * as AgentApi from '@ekza-studio/editor/agent';
import { describe, expect, it } from 'vitest';
import { BREADCRUMB_ROW, breadcrumbTop, grammarTop, TOP_BAR_ROW } from '../src/halo/geometry';
import { aiActivity, setAiActivity, subscribeAiActivity } from '../src/history/activity';
import { topBarActivity } from '../src/sheets/ask/activity';
import { HALO_ENTRY } from '../src/shell/entry';

describe('the grammar under the session bar (P-T9-2)', () => {
  it('starts below the top bar, and below the session or target bar while one shows', () => {
    expect(grammarTop(60, false)).toBe(60);
    expect(grammarTop(60, true)).toBe(60 + TOP_BAR_ROW);
    // the bar is a 44 pt control in a padded, bordered cluster: the breadcrumb clears it with air
    expect(TOP_BAR_ROW).toBeGreaterThanOrEqual(44 + 10 + 2);
    // a selection near the top: the breadcrumb and the arc's first petals sit under the bar, never over its hint
    const box = { left: 400, right: 500, top: 70, bottom: 300 };
    const top = breadcrumbTop(box, grammarTop(60, true));
    expect(top).toBeGreaterThanOrEqual(60 + TOP_BAR_ROW);
    expect(top + BREADCRUMB_ROW).toBeGreaterThan(60 + TOP_BAR_ROW);
  });
});

describe('the live AI activity line (§14, P-T10-3)', () => {
  it('is one slot per app: listeners hear a change of words only', () => {
    const app = {};
    const heard: (string | null)[] = [];
    const off = subscribeAiActivity(app, () => heard.push(aiActivity(app)?.text ?? null));
    expect(aiActivity(app)).toBeNull();
    setAiActivity(app, { text: 'AI is editing: Set Key' });
    setAiActivity(app, { text: 'AI is editing: Set Key' });
    setAiActivity(app, null);
    off();
    setAiActivity(app, { text: 'unheard' });
    expect(heard).toEqual(['AI is editing: Set Key', null]);
    expect(aiActivity({})).toBeNull();
  });

  it('shows the agent at work or asking; never when idle, paused, pairing or off', () => {
    const app = {
      session: { getState: () => ({ activeClip: {} }) },
      store: { get: () => undefined },
    };
    const views: Record<string, { text: string; tone: 'busy' | 'idle' | 'muted' | 'error' }> = {
      paired: { text: 'AI is editing: Pose', tone: 'busy' },
      idle: { text: 'AI connected', tone: 'idle' },
      claimed: { text: 'AI asks for access', tone: 'busy' },
      offering: { text: 'AI: code K7Q', tone: 'busy' },
      paused: { text: 'AI paused', tone: 'idle' },
    };
    const module = {
      pillView: (state: { readonly status: string; readonly working?: boolean }) =>
        state.status === 'paired' && state.working !== true ? views['idle'] : views[state.status],
    } as unknown as typeof AgentApi;
    const state = (status: string, working = false) => ({ status, working }) as unknown as AgentApi.AgentSessionState;
    expect(topBarActivity(app, module, null)).toBeNull();
    expect(topBarActivity(app, module, state('paired', true))).toEqual({ text: 'AI is editing: Pose' });
    expect(topBarActivity(app, module, state('paired'))).toBeNull();
    expect(topBarActivity(app, module, state('claimed'))).toEqual({ text: 'AI asks for access' });
    expect(topBarActivity(app, module, state('offering'))).toBeNull();
    expect(topBarActivity(app, module, state('paused'))).toBeNull();
  });
});

describe('the front door (§1.2, P-T6A-5)', () => {
  it('Halo’s copy of HALO_ENTRY is on since T12 (pinned with the others by apps/web’s entry-contract.test.ts)', () => {
    expect(HALO_ENTRY).toBe(true);
  });
});
