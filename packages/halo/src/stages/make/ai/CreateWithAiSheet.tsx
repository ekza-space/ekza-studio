// *Create with AI* (the owner's AI pipeline, 2026-10-24: "a tool that works together with AI", a character from
// scratch, turnkey; MODELING-PLAN §7.2 G-d; T8 placeholder): a prompt, a photo (on an iPad the file picker offers the
// camera, the photo library and Files), and the size presets of §7.2 — Prop ≤ 500, Character ≤ 3,000, Hero ≤ 10,000
// triangles. The model that comes back lands in Make for clean-up, then goes to Rig and Animate. G-d wires *Create* to
// the `gen.*` operators through G-b/G-c's `GenerationClient`; until then the sheet says plainly whether the gateway
// answers (§3 P12, ST-T8-18) and *Create* stays off. Nothing here writes the document.
import { Segmented, SheetGroup, TouchButton } from '@ekza-studio/ui/touch';
import { type JSX, useRef, useState } from 'react';
import { makeWords } from '../../../i18n/make';
import type { HaloSheetProps } from '../../../manifest/sheets';
import { HaloSheet } from '../../../sheets/more/kit';
import { REDUCE_BUDGETS } from '../cleanup';
import { useAiAvailability } from './availability';
import { CREATE_AI_SHEET } from './open';

type Budget = (typeof REDUCE_BUDGETS)[number]['id'];
const w = makeWords.ai;

export default function CreateWithAiSheet({ ctx }: HaloSheetProps): JSX.Element {
  const app = ctx.host.app;
  const availability = useAiAvailability(app);
  const [prompt, setPrompt] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [budget, setBudget] = useState<Budget>('character');
  const file = useRef<HTMLInputElement>(null);
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
            // G-d wires the Generate flow; until then the status says why Create is off
            disabled
            aria-describedby="halo-ai-status"
          >
            {w.create}
          </TouchButton>
        </>
      }
    >
      <output
        id="halo-ai-status"
        data-testid="halo-ai-status"
        data-state={availability.state}
        className="block rounded-touch border border-line px-3 py-2 text-touch-label text-fg-2"
      >
        {availability.state === 'ready'
          ? `${w.connected(availability.providers.join(', '))} ${w.connectedDetail}`
          : `${w.notConnected} ${w.notConnectedDetail}`}
      </output>
      <SheetGroup>{w.prompt}</SheetGroup>
      <textarea
        data-testid="halo-ai-prompt"
        aria-label={w.prompt}
        value={prompt}
        placeholder={w.promptPlaceholder}
        rows={3}
        className="w-full resize-none rounded-touch border border-line bg-field px-3 py-2 text-[16px] text-fg"
        onChange={(event) => setPrompt(event.currentTarget.value)}
      />
      <div className="flex flex-wrap items-center gap-2 py-2">
        <TouchButton data-testid="halo-ai-photo" onClick={() => file.current?.click()}>
          {w.photo}
        </TouchButton>
        {photo === null ? null : (
          <>
            <span className="min-w-0 truncate text-touch-label text-fg-2" data-testid="halo-ai-photo-name">
              {w.photoAttached(photo.name)}
            </span>
            <TouchButton variant="ghost" onClick={() => setPhoto(null)}>
              {w.removePhoto}
            </TouchButton>
          </>
        )}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          hidden
          onChange={(event) => {
            const picked = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = '';
            if (picked !== null) setPhoto(picked);
          }}
        />
      </div>
      <SheetGroup>{w.budget}</SheetGroup>
      <Segmented<Budget>
        label={w.budget}
        data-testid="halo-ai-budget"
        value={budget}
        onValueChange={setBudget}
        items={REDUCE_BUDGETS.map((b) => ({ value: b.id, label: w[b.id] }))}
      />
    </HaloSheet>
  );
}
