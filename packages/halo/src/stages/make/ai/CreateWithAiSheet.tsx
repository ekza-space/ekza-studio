// *Create with AI* (the owner's AI pipeline, 2026-10-24: "a tool that works together with AI", a character or a prop
// from scratch, turnkey; MODELING-PLAN §7.2 G-d; T8's sheet, made real by G-d): describe the thing or attach a photo
// (on an iPad the file picker offers the camera, the photo library and Files), choose a size (Prop ≤ 500, Character ≤
// 3,000, Hero ≤ 10,000 triangles) and the service, state your plan with it, see the price, *Create*. The job shows here
// with its progress; *Bring it in* cleans it up in Make (one undo step) and shows its triangles, colours and the
// made-with-AI badge; *Rig it* goes to Rig with it. Everything runs through editor-core's Generate flow — the same model
// and the same `gen.*` operators as Studio Pro's Generate panel — bound by `generate/binding.ts`. A gateway that asks
// for its token gets it here (P-T8 G-d); one that does not answer keeps the sheet's "not connected" line (ST-T8-18).
import { type GenJobView, type GenPresetId, provenanceBadgeText } from '@ekza-studio/editor-core';
import { Segmented, SheetGroup, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useEffect, useRef, useState } from 'react';
import { CREATE_WITH_AI_PRESETS, type CreateWithAi, useCreateWithAi } from '../../../generate/binding';
import { makeWords } from '../../../i18n/make';
import type { HaloSheetProps } from '../../../manifest/sheets';
import { HaloSheet } from '../../../sheets/more/kit';
import { CREATE_AI_SHEET } from './open';

const w = makeWords.ai;
const PRESET_LABEL: Readonly<Record<GenPresetId, string>> = { prop: w.prop, character: w.character, hero: w.hero };
const BUDGET: Readonly<Record<GenPresetId, number>> = { prop: 500, character: 3000, hero: 10_000 };

function Status({ ai }: { readonly ai: CreateWithAi }): JSX.Element {
  const [token, setToken] = useState('');
  const names = ai.view.providers.map((p) => p.info.label).join(', ');
  const text =
    ai.status === 'ready'
      ? `${w.connected(names)} ${w.connectedDetail}`
      : ai.status === 'checking'
        ? w.checking
        : ai.status === 'token'
          ? w.tokenAsk
          : `${w.notConnected} ${w.notConnectedDetail}`;
  return (
    <>
      <output
        id="halo-ai-status"
        data-testid="halo-ai-status"
        data-state={ai.status}
        className="block rounded-touch border border-line px-3 py-2 text-touch-label text-fg-2"
      >
        {text}
      </output>
      {ai.status !== 'token' ? null : (
        <form
          className="flex items-center gap-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ai.flow.setToken(token);
          }}
        >
          <input
            data-testid="halo-ai-token"
            type="password"
            autoComplete="off"
            aria-label={w.token}
            placeholder={w.token}
            value={token}
            className="min-w-0 flex-1 rounded-touch border border-line bg-field px-3 py-2 text-[16px] text-fg"
            onChange={(event) => setToken(event.currentTarget.value)}
          />
          <TouchButton type="submit" variant="primary" data-testid="halo-ai-connect" disabled={token.trim() === ''}>
            {w.connect}
          </TouchButton>
        </form>
      )}
    </>
  );
}

function JobRow({ ai, job }: { readonly ai: CreateWithAi; readonly job: GenJobView }): JSX.Element {
  const imported = job.imported.meshes.length > 0 || job.imported.character !== null;
  const [busy, setBusy] = useState(false);
  return (
    <li
      className="flex flex-col gap-1 border-b border-line py-2"
      data-testid="halo-ai-job"
      data-job-id={job.id}
      data-state={job.state}
    >
      <div className="flex items-center gap-2 text-touch-label">
        <span className="min-w-0 flex-1 truncate text-fg">{job.title}</span>
        <span className="text-fg-3">{job.provider}</span>
      </div>
      <span className="text-touch-label text-fg-2" data-testid="halo-ai-job-state">
        {job.stateText}
      </span>
      {job.active ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-field" aria-hidden>
          <div
            data-testid="halo-ai-job-progress"
            className="h-full bg-accent-fill transition-[width]"
            style={{ width: `${Math.max(4, job.progress ?? (job.state === 'fetching' ? 100 : 4))}%` }}
          />
        </div>
      ) : null}
      {job.badge === null ? null : (
        <span className="text-touch-label text-fg-3" data-testid="halo-ai-job-badge">
          {provenanceBadgeText(job.badge)}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {job.canCancel ? (
          <TouchButton data-testid="halo-ai-job-stop" onClick={() => void ai.flow.cancel(job.id)}>
            {w.stop}
          </TouchButton>
        ) : null}
        {job.canRetry ? (
          <TouchButton data-testid="halo-ai-job-retry" onClick={() => void ai.flow.retry(job.id)}>
            {w.retry}
          </TouchButton>
        ) : null}
        {job.canImport ? (
          <TouchButton
            variant={imported ? 'default' : 'primary'}
            data-testid="halo-ai-job-bring"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void ai.bringIn(job.id).finally(() => setBusy(false));
            }}
          >
            {imported ? w.again : w.bringIn}
          </TouchButton>
        ) : null}
      </div>
    </li>
  );
}

function Result({ ai }: { readonly ai: CreateWithAi }): JSX.Element | null {
  const post = ai.state.post;
  const job = post === null ? undefined : ai.view.jobs.find((j) => j.id === post.job);
  const offers = post === null ? [] : ai.flow.rigOffers(post.job);
  const rigQuote = post?.rigQuote ?? null;
  const providerRig = offers.includes('provider');
  useEffect(() => {
    if (post?.status === 'done' && providerRig && rigQuote === null) void ai.flow.quoteProviderRig(post.job);
  }, [ai.flow, post?.status, post?.job, providerRig, rigQuote]);
  if (post === null) return null;
  if (post.status === 'running') {
    return (
      <p className="py-2 text-touch-label text-fg-2" data-testid="halo-ai-result" data-state="running">
        {w.cleaning}
      </p>
    );
  }
  if (post.status === 'error') {
    return (
      <p className="py-2 text-touch-label text-danger" data-testid="halo-ai-result" data-state="error">
        {post.message}
      </p>
    );
  }
  const result = post.result;
  if (result === null) return null;
  const outcome = result.outcome;
  return (
    <section
      className="flex flex-col gap-2 rounded-touch border border-line p-3"
      data-testid="halo-ai-result"
      data-state="done"
    >
      <h3 className="text-touch-label font-semibold text-fg">{w.result}</h3>
      {outcome === null ? null : (
        <p
          className="text-touch-label text-fg-2"
          data-testid="halo-ai-result-triangles"
          data-value={outcome.triangles.after}
          data-limit={BUDGET[post.preset]}
        >
          {w.triangles(
            `${outcome.triangles.after.toLocaleString('en-US')} of ${BUDGET[post.preset].toLocaleString('en-US')}`,
          )}
          {outcome.colours === null ? '' : ` · ${w.colours(outcome.colours)}`}
        </p>
      )}
      {result.warnings.map((warning) => (
        <p key={warning} className="text-touch-label text-warn">
          {warning}
        </p>
      ))}
      {job === undefined || job.badge === null ? null : (
        <p className="text-touch-label text-fg-3" data-testid="halo-ai-result-badge">
          {provenanceBadgeText(job.badge)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {offers.includes('auto-rig') && result.meshes.length > 0 ? (
          <TouchButton variant="primary" data-testid="halo-ai-rig" onClick={() => void ai.rigIt(result)}>
            {w.rigIt}
          </TouchButton>
        ) : null}
        {offers.includes('provider') ? (
          <TouchButton
            data-testid="halo-ai-rig-provider"
            disabled={rigQuote?.status !== 'ready'}
            onClick={() => void ai.flow.providerRig(post.job).then(() => ai.flow.closePost())}
          >
            {w.rigProvider(`${job?.provider ?? ''} (${rigQuote?.quote ? `$${rigQuote.quote.usd.toFixed(2)}` : '…'})`)}
          </TouchButton>
        ) : null}
        <TouchButton data-testid="halo-ai-result-done" onClick={() => ai.flow.closePost()}>
          {w.done}
        </TouchButton>
      </div>
    </section>
  );
}

export default function CreateWithAiSheet({ ctx }: HaloSheetProps): JSX.Element {
  const ai = useCreateWithAi(ctx);
  const { flow, state, view } = ai;
  const [photo, setPhoto] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  // A photo makes a picture request; words alone a text one.
  const mode = photo === null ? 'text-to-model' : 'image-to-model';
  useEffect(() => {
    if (state.mode !== mode) flow.setMode(mode);
  }, [flow, mode, state.mode]);
  const ready = ai.status === 'ready';
  const provider = view.provider;
  const usable = view.providers.filter((p) => p.info.configured || p.info.byoAllowed);
  return (
    <HaloSheet
      ctx={ctx}
      id={CREATE_AI_SHEET}
      title={w.title}
      footer={
        <>
          <TouchButton className="flex-1" data-testid="halo-ai-close" onClick={() => ctx.close()}>
            {w.close}
          </TouchButton>
          <TouchButton
            variant="primary"
            className="flex-1"
            data-testid="halo-ai-create"
            disabled={ai.blocked !== null}
            aria-describedby="halo-ai-blocked"
            onClick={() => void ai.create()}
          >
            {w.create}
          </TouchButton>
        </>
      }
    >
      <Status ai={ai} />
      <SheetGroup>{w.prompt}</SheetGroup>
      <textarea
        data-testid="halo-ai-prompt"
        aria-label={w.prompt}
        value={state.prompt}
        placeholder={w.promptPlaceholder}
        rows={3}
        className="w-full resize-none rounded-touch border border-line bg-field px-3 py-2 text-[16px] text-fg"
        onChange={(event) => flow.setPrompt(event.currentTarget.value)}
      />
      <div className="flex flex-wrap items-center gap-2 py-2">
        <TouchButton data-testid="halo-ai-photo" onClick={() => file.current?.click()}>
          {w.photo}
        </TouchButton>
        {photo === null ? null : (
          <>
            <span className="min-w-0 truncate text-touch-label text-fg-2" data-testid="halo-ai-photo-name">
              {w.photoAttached(photo)}
              {state.image.status === 'reading' || state.image.status === 'uploading' ? ' …' : ''}
            </span>
            <TouchButton
              variant="ghost"
              onClick={() => {
                setPhoto(null);
                void flow.setImage(null);
              }}
            >
              {w.removePhoto}
            </TouchButton>
          </>
        )}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          hidden
          data-testid="halo-ai-photo-input"
          onChange={(event) => {
            const picked = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = '';
            if (picked === null) return;
            setPhoto(picked.name);
            void flow.setImage(picked, picked.name);
          }}
        />
      </div>
      {photo === null ? null : (
        <>
          {state.image.message === null ? null : (
            <p className="text-touch-label text-danger" data-testid="halo-ai-photo-error">
              {state.image.message}
            </p>
          )}
          <p className="text-touch-label text-fg-3">{w.photoNote}</p>
          {state.image.status !== 'ready' ? null : (
            <>
              <SheetGroup>{w.personQuestion}</SheetGroup>
              <Segmented<'yes' | 'no' | 'unset'>
                label={w.personQuestion}
                data-testid="halo-ai-person"
                value={state.realPerson === null ? 'unset' : state.realPerson ? 'yes' : 'no'}
                onValueChange={(value) => flow.setRealPerson(value === 'unset' ? null : value === 'yes')}
                items={[
                  { value: 'yes', label: w.personYes },
                  { value: 'no', label: w.personNo },
                ]}
              />
            </>
          )}
        </>
      )}
      <SheetGroup>{w.budget}</SheetGroup>
      <Segmented<GenPresetId>
        label={w.budget}
        data-testid="halo-ai-budget"
        value={state.preset}
        onValueChange={(preset) => flow.setPreset(preset)}
        items={CREATE_WITH_AI_PRESETS.map((preset) => ({ value: preset.id, label: PRESET_LABEL[preset.id] }))}
      />
      {!ready || provider === null ? null : (
        <>
          <SheetGroup>{w.service}</SheetGroup>
          <Segmented<string>
            label={w.service}
            data-testid="halo-ai-service"
            value={provider.info.id}
            onValueChange={(id) => flow.setProvider(id)}
            items={usable.map((p) => ({ value: p.info.id, label: p.info.label }))}
          />
          <div className="flex flex-wrap gap-1.5 py-2" data-testid="halo-ai-terms">
            {provider.terms.map((badge) => (
              <span
                key={badge.text}
                className={`rounded-full border px-2 py-0.5 text-[12px] ${badge.tone === 'warn' ? 'border-warn text-warn' : 'border-line text-fg-2'}`}
              >
                {badge.text}
              </span>
            ))}
          </div>
          <SheetGroup>{w.plan(provider.info.label)}</SheetGroup>
          <Segmented<'paid' | 'free' | 'unset'>
            label={w.plan(provider.info.label)}
            data-testid="halo-ai-plan"
            value={provider.tier ?? 'unset'}
            onValueChange={(tier) => (tier === 'unset' ? undefined : flow.attest(provider.info.id, tier))}
            items={[
              { value: 'paid', label: w.paid },
              { value: 'free', label: w.free },
            ]}
          />
          <p className="pt-1 text-touch-label text-fg-3">{w.planWhy}</p>
          <SheetGroup>{w.price}</SheetGroup>
          <p className="text-touch-label text-fg" data-testid="halo-ai-quote" data-status={state.quote.status}>
            {view.quoteLine ?? '—'}
          </p>
        </>
      )}
      {ai.blocked === null && state.message === null ? null : (
        <p
          id="halo-ai-blocked"
          className={`pt-2 text-touch-label ${state.message?.tone === 'error' ? 'text-danger' : 'text-fg-2'}`}
          data-testid="halo-ai-blocked"
        >
          {state.message?.text ?? ai.blocked}
        </p>
      )}
      <Result ai={ai} />
      {view.jobs.length === 0 ? null : (
        <>
          <SheetGroup>{w.jobs}</SheetGroup>
          <ul data-testid="halo-ai-jobs">
            {view.jobs.map((job) => (
              <JobRow key={job.id} ai={ai} job={job} />
            ))}
          </ul>
        </>
      )}
    </HaloSheet>
  );
}
