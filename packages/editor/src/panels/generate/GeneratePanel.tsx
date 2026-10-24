// The Generate panel body (MODELING-PLAN §7.2 G-d, §7.3; ADR 0017 §9–§10; DECISIONS M7-GD-*; a lazy chunk): Studio
// Pro's view of the Generate flow (`@ekza-studio/editor-core` `createGenFlow`, the same model Halo's *Create with AI*
// binds). Two tabs, *From a picture* and *From words*; the size presets; the service with its terms badges; the
// attested plan; the quote line before anything is spent and the most it may cost; Generate; the job tray with
// progress, Stop, Try again and Bring it in; the clean-up dialog (`gen.import` → `mesh.intake`: preset, colours,
// surface, height; the live triangle and colour budgets, the steps, the warnings, the provenance badge) and what comes
// next (Rig it: Auto-Rig with the generated meshes; or the provider's VRM-named rig). Every spend and every document
// change is an operator run through the shell; the panel shows the flow's state and nothing else.
import {
  type EditorApp,
  GEN_FLOW_MARKER,
  GEN_PRESET_IDS,
  GEN_PRESET_LABELS,
  GEN_TEXT,
  type GenFlow,
  type GenFlowView,
  genFlowOf,
  type GenJobView,
  type GenPostState,
  type OperatorResult,
  provenanceBadgeText,
  quoteLine,
  type TermsBadge,
} from '@ekza-studio/editor-core';
import { Dialog, DialogContent } from '@ekza-studio/ui';
import { type JSX, type ReactNode, useEffect, useMemo, useReducer, useState } from 'react';
import { useOptionalShell } from '../../shell/context';
import { setGenTray } from '../../shell/genTraySlot';
import { setGenerationToken } from '../../services/generation';
import { BUTTON, CHECK, INPUT, MUTED_TEXT, PANEL_ROOT, PRIMARY_BUTTON, SELECT } from '../channels/kit/styles';
import type { PanelProps } from '../types';

type Run = (op: string, args?: unknown) => Promise<OperatorResult<unknown>>;

/** The shell funnel the flow runs through: the latest panel's (a re-mounted shell gives a new one). */
const funnels = new WeakMap<EditorApp, { run: Run }>();

function useGenFlow(app: EditorApp): GenFlow {
  const shell = useOptionalShell();
  const run: Run = (op, args) => (shell === null ? app.runUntyped(op, args) : shell.runFromUi(op, args));
  let funnel = funnels.get(app);
  if (funnel === undefined) {
    funnel = { run };
    funnels.set(app, funnel);
  } else funnel.run = run;
  const flow = useMemo(
    () =>
      genFlowOf(
        {
          app,
          run: (op, args) => (funnels.get(app)?.run ?? app.runUntyped.bind(app))(op, args),
          quiet: (op, args) => app.runUntyped(op, args),
          setToken: (token) => setGenerationToken(app.services.generation, token),
        },
        'pro',
      ),
    [app],
  );
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => flow.subscribe(bump), [flow]);
  return flow;
}

const TONE: Readonly<Record<TermsBadge['tone'], string>> = {
  good: 'border-[var(--ok,#4caf7d)] text-[var(--ok,#7fd3a3)]',
  warn: 'border-[var(--warn,#e3b34a)] text-[var(--warn,#e3b34a)]',
  info: 'border-line text-fg-2',
};

function Badge({ badge, testId }: { readonly badge: TermsBadge; readonly testId?: string }): JSX.Element {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] leading-4 ${TONE[badge.tone]}`}
    >
      {badge.text}
    </span>
  );
}

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-1 border-b border-line px-2 py-2">
      <h3 className="text-[10px] font-semibold tracking-wide text-fg-3 uppercase">{label}</h3>
      {children}
    </section>
  );
}

/** The help line's tray: what is generating now (a click opens the panel). */
function GenTrayPill({ app }: { readonly app: EditorApp }): JSX.Element | null {
  const flow = useGenFlow(app);
  const view = flow.view();
  const active = view.jobs.filter((job) => job.active);
  const ready = view.jobs.filter(
    (job) => job.canImport && job.imported.meshes.length === 0 && job.imported.character === null,
  );
  if (active.length === 0 && ready.length === 0) return null;
  const lead = active[0];
  const text =
    lead !== undefined
      ? `${active.length > 1 ? `${active.length} generations · ` : ''}${lead.stateText}`
      : `${ready.length} generated model${ready.length === 1 ? '' : 's'} ready`;
  return (
    <button
      type="button"
      data-testid="gen-tray-pill"
      className="flex shrink-0 items-center gap-1.5 rounded px-1 text-fg-2 hover:bg-hover hover:text-fg"
      onClick={() => void flow.host.run('workspace.showPanel', { panel: 'generate' })}
    >
      <span aria-hidden className={lead === undefined ? '' : 'animate-pulse'}>
        ✦
      </span>
      {text}
    </button>
  );
}

function Availability({ flow, view }: { readonly flow: GenFlow; readonly view: GenFlowView }): JSX.Element | null {
  const [token, setToken] = useState('');
  const { availability } = view;
  if (availability.status === 'ready') return null;
  if (availability.status === 'needs-token') {
    return (
      <form
        className="flex flex-col gap-1.5 p-2"
        data-testid="gen-needs-token"
        onSubmit={(event) => {
          event.preventDefault();
          void flow.setToken(token);
        }}
      >
        <p className="text-fg-2">{GEN_TEXT.needsToken}</p>
        <label className="flex items-center gap-1.5">
          <span className={MUTED_TEXT}>{GEN_TEXT.tokenLabel}</span>
          <input
            data-testid="gen-token-input"
            type="password"
            autoComplete="off"
            className={`${INPUT} flex-1`}
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className={PRIMARY_BUTTON} data-testid="gen-token-save" disabled={token.trim() === ''}>
          {GEN_TEXT.tokenSave}
        </button>
      </form>
    );
  }
  const text =
    availability.status === 'checking' || availability.status === 'unknown'
      ? GEN_TEXT.checking
      : 'message' in availability
        ? availability.message
        : GEN_TEXT.unavailable;
  return (
    <div className="flex flex-col gap-2 p-3" data-testid="gen-unavailable" data-status={availability.status}>
      <p className="text-fg-2">{text}</p>
      {availability.status === 'error' ? (
        <button type="button" className={BUTTON} onClick={() => void flow.check()}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

function ImageInput({ flow }: { readonly flow: GenFlow }): JSX.Element {
  const state = flow.getState();
  const { image } = state.image;
  const url = useMemo(
    () =>
      image === null
        ? null
        : URL.createObjectURL(new Blob([image.png as Uint8Array<ArrayBuffer>], { type: 'image/png' })),
    [image],
  );
  useEffect(() => () => (url === null ? undefined : URL.revokeObjectURL(url)), [url]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className={`${BUTTON} cursor-pointer border border-line`}>
          {GEN_TEXT.pickImage}
          <input
            data-testid="gen-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              if (file !== null) void flow.setImage(file, file.name);
            }}
          />
        </label>
        {image === null ? null : (
          <button
            type="button"
            className={BUTTON}
            onClick={() => void flow.setImage(null)}
            aria-label="Remove the picture"
          >
            ✕
          </button>
        )}
      </div>
      {url === null || image === null ? null : (
        <div className="flex items-center gap-2" data-testid="gen-image-preview">
          <div
            aria-hidden
            className="size-14 rounded border border-line bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${url})` }}
          />
          <span className={MUTED_TEXT}>
            {image.name} · {image.width} × {image.height}
            {state.image.status === 'uploading' ? ' · sending…' : state.image.status === 'ready' ? ' · ready' : ''}
          </span>
        </div>
      )}
      {state.image.message === null ? null : (
        <p className="text-[var(--danger,#ef6b6b)]" data-testid="gen-image-error">
          {state.image.message}
        </p>
      )}
      <p className={MUTED_TEXT}>{GEN_TEXT.imageNote}</p>
      {image === null ? null : (
        <fieldset className="flex flex-col gap-0.5" data-testid="gen-real-person">
          <legend className="text-fg-2">{GEN_TEXT.realPersonQuestion}</legend>
          {(
            [
              [true, GEN_TEXT.realPersonYes, 'gen-real-person-yes'],
              [false, GEN_TEXT.realPersonNo, 'gen-real-person-no'],
            ] as const
          ).map(([value, label, id]) => (
            <label key={id} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="gen-real-person"
                className={CHECK}
                data-testid={id}
                checked={state.realPerson === value}
                onChange={() => flow.setRealPerson(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function JobRow({ flow, job }: { readonly flow: GenFlow; readonly job: GenJobView }): JSX.Element {
  const imported = job.imported.meshes.length > 0 || job.imported.character !== null;
  return (
    <li
      className="flex flex-col gap-1 border-b border-line px-2 py-1.5"
      data-testid="gen-job"
      data-job-id={job.id}
      data-state={job.state}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-fg" title={job.title}>
          {job.title}
        </span>
        <span className={MUTED_TEXT}>{job.provider}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-fg-2" data-testid="gen-job-state">
          {job.stateText}
        </span>
        {job.costUsd === null ? null : <span className={MUTED_TEXT}>${job.costUsd.toFixed(2)}</span>}
      </div>
      {job.active ? (
        <div className="h-1 overflow-hidden rounded bg-[var(--bg-field,#17181b)]" aria-hidden>
          <div
            data-testid="gen-job-progress"
            className="h-full bg-accent-fill transition-[width]"
            style={{ width: `${Math.max(4, job.progress ?? (job.state === 'fetching' ? 100 : 4))}%` }}
          />
        </div>
      ) : null}
      {job.watchError === null ? null : <p className="text-[var(--warn,#e3b34a)]">{job.watchError}</p>}
      {job.badge === null ? null : (
        <Badge
          testId="gen-badge"
          badge={{ tone: job.badge.tier === 'paid' ? 'info' : 'warn', text: provenanceBadgeText(job.badge) }}
        />
      )}
      <div className="flex flex-wrap items-center gap-1">
        {job.canCancel ? (
          <button
            type="button"
            className={BUTTON}
            data-testid="gen-job-cancel"
            onClick={() => void flow.cancel(job.id)}
          >
            {GEN_TEXT.cancel}
          </button>
        ) : null}
        {job.canRetry ? (
          <button type="button" className={BUTTON} data-testid="gen-job-retry" onClick={() => void flow.retry(job.id)}>
            {GEN_TEXT.retry}
          </button>
        ) : null}
        {job.canImport ? (
          <button
            type="button"
            className={imported ? BUTTON : PRIMARY_BUTTON}
            data-testid="gen-job-import"
            onClick={() => flow.openPost(job.id)}
          >
            {imported ? GEN_TEXT.reimport : GEN_TEXT.import}
          </button>
        ) : null}
        {job.active ? null : (
          <button
            type="button"
            className={`${BUTTON} ml-auto`}
            data-testid="gen-job-dismiss"
            aria-label={GEN_TEXT.dismiss}
            title={GEN_TEXT.dismiss}
            onClick={() => flow.dismiss(job.id)}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

function Budget({ label, value, limit, testId }: { label: string; value: number; limit: number; testId: string }) {
  const over = value > limit;
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId} data-value={value} data-limit={limit}>
      <div className="flex justify-between">
        <span className="text-fg-2">{label}</span>
        <span className={over ? 'text-[var(--danger,#ef6b6b)]' : 'text-fg'}>
          {value.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-[var(--bg-field,#17181b)]" aria-hidden>
        <div
          className={over ? 'h-full bg-[var(--danger,#ef6b6b)]' : 'h-full bg-accent-fill'}
          style={{ width: `${Math.min(100, (value / Math.max(1, limit)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function PostDialog({
  flow,
  post,
  job,
}: {
  readonly flow: GenFlow;
  readonly post: GenPostState;
  readonly job: GenJobView | undefined;
}): JSX.Element {
  const result = post.result;
  const outcome = result?.outcome ?? null;
  const offers = flow.rigOffers(post.job);
  const running = post.status === 'running';
  const budget = { prop: 500, character: 3000, hero: 10_000 }[post.preset];
  const rigQuote = post.rigQuote;
  useEffect(() => {
    if (post.status === 'done' && offers.includes('provider') && rigQuote === null)
      void flow.quoteProviderRig(post.job);
  }, [flow, post.status, post.job, offers, rigQuote]);
  return (
    <DialogContent
      title={`${GEN_TEXT.postTitle}: ${job?.title ?? 'generated model'}`}
      description="Stand it up, keep it within its triangle budget and give it flat colours. One undo step."
      width="md"
      data-testid="gen-post"
    >
      <div className="flex flex-col gap-3 text-ui">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-2">{GEN_TEXT.presets}</span>
          {GEN_PRESET_IDS.map((id) => (
            <label key={id} className="flex items-center gap-1">
              <input
                type="radio"
                name="gen-post-preset"
                className={CHECK}
                data-testid={`gen-post-preset-${id}`}
                checked={post.preset === id}
                disabled={running}
                onChange={() => flow.setPost({ preset: id })}
              />
              {GEN_PRESET_LABELS[id].label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-fg-2">{GEN_TEXT.postColours}</span>
            <input
              type="number"
              min={2}
              max={64}
              data-testid="gen-post-colours"
              className={`${INPUT} w-14`}
              value={post.colours}
              disabled={running}
              onChange={(event) => flow.setPost({ colours: Math.round(Number(event.currentTarget.value) || 16) })}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-fg-2">{GEN_TEXT.postTexture}</span>
            <select
              data-testid="gen-post-texture"
              className={SELECT}
              value={post.texture}
              disabled={running}
              onChange={(event) => flow.setPost({ texture: event.currentTarget.value as 'palette' | 'keep' })}
            >
              <option value="palette">{GEN_TEXT.postPalette}</option>
              <option value="keep">{GEN_TEXT.postKeep}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-fg-2">Height (m)</span>
            <input
              type="number"
              min={0.05}
              max={100}
              step={0.05}
              placeholder="auto"
              data-testid="gen-post-height"
              className={`${INPUT} w-16`}
              value={post.height ?? ''}
              disabled={running}
              onChange={(event) => {
                const value = Number(event.currentTarget.value);
                flow.setPost({ height: event.currentTarget.value === '' || !(value > 0) ? null : value });
              }}
            />
          </label>
        </div>
        {outcome === null ? null : (
          <div className="flex flex-col gap-2 rounded border border-line p-2" data-testid="gen-post-result">
            <Budget label="Triangles" value={outcome.triangles.after} limit={budget} testId="gen-post-triangles" />
            {outcome.colours === null ? null : (
              <Budget label="Colours" value={outcome.colours} limit={16} testId="gen-post-colours-count" />
            )}
            <p className={MUTED_TEXT}>
              {outcome.triangles.before.toLocaleString('en-US')} → {outcome.triangles.after.toLocaleString('en-US')}{' '}
              triangles · {outcome.steps.map((step) => `${step.kind} ${Math.round(step.ms)} ms`).join(' · ')}
            </p>
          </div>
        )}
        {result === null || result.warnings.length === 0 ? null : (
          <ul className="flex flex-col gap-0.5 text-[var(--warn,#e3b34a)]" data-testid="gen-post-warnings">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {job === undefined || job.badge === null || result === null ? null : (
          <Badge testId="gen-post-badge" badge={{ tone: 'info', text: provenanceBadgeText(job.badge) }} />
        )}
        {post.message === null ? null : (
          <p className="text-[var(--danger,#ef6b6b)]" data-testid="gen-post-error">
            {post.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={PRIMARY_BUTTON}
            data-testid="gen-post-run"
            disabled={running}
            onClick={() => void flow.runPost()}
          >
            {running ? 'Cleaning up…' : result === null ? GEN_TEXT.postRun : GEN_TEXT.postRerun}
          </button>
          {result !== null && offers.includes('auto-rig') && result.meshes.length > 0 ? (
            <button
              type="button"
              className={BUTTON}
              data-testid="gen-post-rig-auto"
              onClick={() =>
                void (async () => {
                  await flow.host.quiet?.('select.objects', { ids: result.meshes, mode: 'replace' });
                  flow.closePost();
                  await flow.host.run('shell.autoRig', { subject: true });
                })()
              }
            >
              {GEN_TEXT.rigAuto}
            </button>
          ) : null}
          {result !== null && offers.includes('provider') ? (
            <button
              type="button"
              className={BUTTON}
              data-testid="gen-post-rig-provider"
              disabled={rigQuote?.status !== 'ready'}
              title={rigQuote?.message ?? undefined}
              onClick={() => void flow.providerRig(post.job).then(() => flow.closePost())}
            >
              {GEN_TEXT.rigProvider(job?.provider ?? 'the provider')}
              {rigQuote?.quote ? ` · ${quoteLine(rigQuote.quote).split(' · ')[0]}` : ''}
            </button>
          ) : null}
          <button
            type="button"
            className={`${BUTTON} ml-auto`}
            data-testid="gen-post-done"
            onClick={() => flow.closePost()}
          >
            {GEN_TEXT.postDone}
          </button>
        </div>
      </div>
    </DialogContent>
  );
}

export default function GeneratePanel({ app }: PanelProps): JSX.Element {
  const flow = useGenFlow(app);
  const state = flow.getState();
  const view = flow.view();
  useEffect(() => {
    const status = flow.session.getState().availability.status;
    if (status === 'unknown' || status === 'error') void flow.check();
  }, [flow]);
  useEffect(() => {
    // The help line's tray stays once the chunk has loaded (jobs go on while the panel is closed).
    setGenTray(() => <GenTrayPill app={app} />);
  }, [app]);
  const provider = view.provider;
  const ready = view.availability.status === 'ready';
  const postJob = state.post === null ? undefined : view.jobs.find((job) => job.id === state.post?.job);
  return (
    <div className={`${PANEL_ROOT} overflow-y-auto`} data-testid="gen-panel" data-ekza={GEN_FLOW_MARKER}>
      <Availability flow={flow} view={view} />
      {!ready ? null : (
        <>
          <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-2">
            {(
              [
                ['image-to-model', GEN_TEXT.imageTab, 'gen-tab-image'],
                ['text-to-model', GEN_TEXT.textTab, 'gen-tab-text'],
              ] as const
            ).map(([mode, label, id]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={state.mode === mode}
                data-testid={id}
                className={`rounded-t px-2 py-1 ${state.mode === mode ? 'bg-header text-fg' : 'text-fg-3 hover:text-fg'}`}
                onClick={() => flow.setMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <Section label={state.mode === 'image-to-model' ? GEN_TEXT.imageTab : GEN_TEXT.textTab}>
            {state.mode === 'image-to-model' ? (
              <ImageInput flow={flow} />
            ) : (
              <>
                <textarea
                  data-testid="gen-prompt"
                  aria-label="What to make"
                  rows={3}
                  maxLength={1000}
                  placeholder={GEN_TEXT.promptPlaceholder}
                  className={`${INPUT} h-auto resize-y py-1`}
                  value={state.prompt}
                  onChange={(event) => flow.setPrompt(event.currentTarget.value)}
                />
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className={CHECK}
                    data-testid="gen-keep-prompt"
                    checked={state.keepPrompt}
                    onChange={(event) => flow.setKeepPrompt(event.currentTarget.checked)}
                  />
                  <span className="text-fg-2">{GEN_TEXT.keepPrompt}</span>
                </label>
              </>
            )}
          </Section>
          <Section label={GEN_TEXT.presets}>
            <div className="flex flex-col gap-0.5">
              {GEN_PRESET_IDS.map((id) => (
                <label key={id} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="gen-preset"
                    className={CHECK}
                    data-testid={`gen-preset-${id}`}
                    checked={state.preset === id}
                    onChange={() => flow.setPreset(id)}
                  />
                  <span className="text-fg">{GEN_PRESET_LABELS[id].label}</span>
                  <span className={MUTED_TEXT}>{GEN_PRESET_LABELS[id].detail}</span>
                </label>
              ))}
            </div>
          </Section>
          <Section label={GEN_TEXT.provider}>
            <select
              data-testid="gen-provider"
              className={SELECT}
              value={provider?.info.id ?? ''}
              onChange={(event) =>
                flow.setProvider(event.currentTarget.value === '' ? null : event.currentTarget.value)
              }
            >
              {view.providers.map((p) => (
                <option key={p.info.id} value={p.info.id} disabled={!(p.info.configured || p.info.byoAllowed)}>
                  {p.info.label}
                  {p.info.configured ? '' : ' (not configured)'}
                </option>
              ))}
            </select>
            {provider === null ? null : (
              <>
                <div className="flex flex-wrap gap-1" data-testid="gen-terms">
                  {provider.terms.map((badge) => (
                    <Badge key={badge.text} badge={badge} />
                  ))}
                  <a
                    href={provider.info.terms.termsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[10px] text-fg-3 underline"
                  >
                    Terms
                  </a>
                </div>
                <fieldset className="flex flex-wrap items-center gap-2" data-testid="gen-tier">
                  <legend className="text-fg-2">{GEN_TEXT.tierQuestion(provider.info.label)}</legend>
                  {(
                    [
                      ['paid', GEN_TEXT.tierPaid],
                      ['free', GEN_TEXT.tierFree],
                    ] as const
                  ).map(([tier, label]) => (
                    <label key={tier} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`gen-tier-${provider.info.id}`}
                        className={CHECK}
                        data-testid={`gen-tier-${tier}`}
                        checked={provider.tier === tier}
                        onChange={() => flow.attest(provider.info.id, tier)}
                      />
                      {label}
                    </label>
                  ))}
                  <span className={MUTED_TEXT}>{GEN_TEXT.tierWhy}</span>
                </fieldset>
              </>
            )}
          </Section>
          <Section label="Price">
            <p className="text-fg" data-testid="gen-quote" data-status={state.quote.status}>
              {view.quoteLine ?? (state.quote.status === 'loading' ? GEN_TEXT.quoting : '—')}
            </p>
            <label className="flex items-center gap-1.5">
              <span className="text-fg-2">{GEN_TEXT.maxCost} $</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                data-testid="gen-max-cost"
                className={`${INPUT} w-16`}
                value={state.maxCostUsd}
                onChange={(event) => flow.setMaxCost(Number(event.currentTarget.value))}
              />
            </label>
            <button
              type="button"
              className={`${PRIMARY_BUTTON} mt-1`}
              data-testid="gen-submit"
              disabled={view.blocked !== null}
              title={view.blocked ?? undefined}
              onClick={() => void flow.submit()}
            >
              {state.submitting ? GEN_TEXT.generating : GEN_TEXT.generate}
            </button>
            {view.blocked === null ? null : (
              <p className={MUTED_TEXT} data-testid="gen-blocked">
                {view.blocked}
              </p>
            )}
            {state.message === null ? null : (
              <p
                data-testid="gen-message"
                className={state.message.tone === 'error' ? 'text-[var(--danger,#ef6b6b)]' : 'text-fg-2'}
              >
                {state.message.text}
              </p>
            )}
          </Section>
        </>
      )}
      <section className="flex min-h-0 flex-col" data-testid="gen-tray">
        <h3 className="px-2 pt-2 text-[10px] font-semibold tracking-wide text-fg-3 uppercase">{GEN_TEXT.tray}</h3>
        {view.jobs.length === 0 ? (
          <p className={`${MUTED_TEXT} px-2 py-1`}>{GEN_TEXT.trayEmpty}</p>
        ) : (
          <ul>
            {view.jobs.map((job) => (
              <JobRow key={job.id} flow={flow} job={job} />
            ))}
          </ul>
        )}
      </section>
      <Dialog open={state.post !== null} onOpenChange={(open) => (open ? undefined : flow.closePost())}>
        {state.post === null ? null : <PostDialog flow={flow} post={state.post} job={postJob} />}
      </Dialog>
    </div>
  );
}
