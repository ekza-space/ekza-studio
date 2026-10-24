// Plain words of the Generate flow (STUDIO-TOUCH-SPEC §3 P12: say what happened and what to do; DECISIONS M7-GD-*),
// shared by the Pro panel and Halo's *Create with AI* sheet so both say the same thing about the same job. Pure.
import type { GenCaps, GenJob, GenQuote, GenTerms } from '@ekza-studio/gen-core';
import type { GenPresetId } from './presets';

export const GEN_PRESET_LABELS: Readonly<Record<GenPresetId, { readonly label: string; readonly detail: string }>> = {
  prop: { label: 'Prop', detail: 'up to 500 triangles: a flower, a chair, a sword' },
  character: { label: 'Character', detail: 'up to 3,000 triangles, ready to rig' },
  hero: { label: 'Hero', detail: 'up to 10,000 triangles, more detail' },
};

const money = (usd: number): string => `$${usd.toFixed(2)}`;

/** One line about a job's state for the tray. */
export function jobStateText(job: GenJob): string {
  switch (job.state) {
    case 'queued':
      return job.submitted ? 'Waiting at the provider' : 'Waiting in line';
    case 'submitting':
      return 'Sending';
    case 'running':
      return job.progress === null ? 'Generating' : `Generating ${Math.round(job.progress)}%`;
    case 'fetching':
      return 'Downloading the model';
    case 'succeeded':
      return 'Ready';
    case 'failed':
      return job.error?.code === 'timeout' && !job.error.retryable
        ? 'No answer from the provider: check its console before trying again'
        : `Failed: ${job.error?.message ?? 'the provider did not finish'}`;
    case 'blocked':
      return `Refused by the provider's content rules${job.error ? `: ${job.error.message}` : ''}`;
    case 'canceled':
      return 'Stopped';
    case 'expired':
      return 'Expired: the provider no longer has it';
  }
}

/** The quote line shown before anything is spent. */
export function quoteLine(quote: GenQuote): string {
  const price = `${quote.exact ? '' : 'about '}${money(quote.usd)} (${quote.credits} credits)`;
  return `${price} · ${quote.model} · ${capsText(quote.caps)}`;
}

/** What the server's spend caps leave today and this month. */
export function capsText(caps: GenCaps): string {
  return `${money(caps.remainingDailyUsd)} left today, ${money(caps.remainingMonthlyUsd)} this month`;
}

export interface TermsBadge {
  readonly tone: 'good' | 'warn' | 'info';
  readonly text: string;
}

const OWNERSHIP: Readonly<Record<GenTerms['ownership'], TermsBadge>> = {
  user: { tone: 'good', text: 'You own the result' },
  'provider-cc-by': { tone: 'warn', text: 'CC BY: credit the provider' },
  provider: { tone: 'warn', text: 'The provider owns the result' },
  unclear: { tone: 'warn', text: 'Ownership unclear' },
};

/** The provider's terms as badges (ADR 0017 §9): ownership on the attested plan, training, retention, duties. */
export function termsBadges(terms: GenTerms, tier: 'paid' | 'free' | null): readonly TermsBadge[] {
  const ownership = tier === 'free' ? terms.freeTierOwnership : terms.ownership;
  const badges: TermsBadge[] = [
    tier === null ? { tone: 'info', text: `Paid plan: ${OWNERSHIP[terms.ownership].text.toLowerCase()}` } : OWNERSHIP[ownership],
    terms.trainsOnInputs === true
      ? { tone: 'warn', text: 'May train on your inputs' }
      : terms.trainsOnInputs === false
        ? { tone: 'good', text: 'No training on your inputs' }
        : { tone: 'info', text: 'Training on inputs: unknown' },
  ];
  if (terms.retentionDays !== null) badges.push({ tone: 'info', text: `Kept ${terms.retentionDays} days` });
  if (terms.attribution !== null) badges.push({ tone: 'warn', text: `Credit: ${terms.attribution}` });
  if (terms.restrictions.includes('keep-ai-marks')) badges.push({ tone: 'warn', text: 'AI marks must stay' });
  if (terms.territoryExcluded.length > 0)
    badges.push({ tone: 'warn', text: `Not for ${terms.territoryExcluded.join(', ')}` });
  return badges;
}

/** The provenance badge of a generated model. */
export function provenanceBadgeText(badge: {
  readonly service: string;
  readonly model: string;
  readonly tier: 'paid' | 'free' | 'unknown';
}): string {
  const tier = badge.tier === 'paid' ? 'paid plan' : badge.tier === 'free' ? 'free plan' : 'plan not stated';
  return `Made with AI · ${badge.service} ${badge.model} · ${tier}`;
}

export const GEN_TEXT = {
  title: 'Generate with AI',
  imageTab: 'From a picture',
  textTab: 'From words',
  promptPlaceholder: 'A low-poly knight with a round shield, flat colours',
  pickImage: 'Choose a picture…',
  imageNote: 'The picture is re-encoded here (no location or camera data) and sent to your generation server.',
  tooSmall: 'The picture is too small: it needs at least 64 × 64 pixels',
  cannotRead: 'This picture could not be read here: try a PNG or JPEG',
  realPersonQuestion: 'Does the picture show a real person?',
  realPersonYes: 'Yes, and I may use it',
  realPersonNo: 'No',
  provider: 'Service',
  presets: 'Size',
  tierQuestion: (provider: string): string => `Your plan with ${provider}`,
  tierPaid: 'Paid',
  tierFree: 'Free',
  tierWhy: 'The service cannot tell us. On a free plan the result is not yours to publish.',
  keepPrompt: 'Keep the prompt text in the file (otherwise only its fingerprint)',
  maxCost: 'At most',
  quoting: 'Asking the price…',
  generate: 'Generate',
  generating: 'Sending…',
  tray: 'Generations',
  trayEmpty: 'Nothing generated yet.',
  import: 'Bring it in',
  reimport: 'Bring it in again',
  cancel: 'Stop',
  retry: 'Try again',
  dismiss: 'Remove from the list',
  postTitle: 'Clean up',
  postColours: 'Colours',
  postTexture: 'Surface',
  postPalette: 'Flat colours',
  postKeep: 'Keep the texture',
  postRun: 'Clean up',
  postRerun: 'Clean up again with these settings',
  postDone: 'Done',
  rigAuto: 'Rig it',
  rigProvider: (provider: string): string => `Rig with ${provider} (VRM bones)`,
  needsToken: 'This generation server asks for its access token.',
  tokenLabel: 'Access token',
  tokenSave: 'Connect',
  unavailable: 'AI generation is not set up on this server. The guide docs/ai-generation.md says how to turn it on.',
  checking: 'Connecting to the generation server…',
  noProvider: 'No generation service is configured on this server',
  cleanupMissing: 'Clean-up arrives with the intake operators: the model came in as generated',
} as const;
