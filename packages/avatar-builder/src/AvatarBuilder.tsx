'use client';

import { type ChangeEvent, type JSX, type ReactNode, useEffect, useRef, useState } from 'react';
import styles from './AvatarBuilder.module.css';
import { PREVIEW_MOTIONS, Preview, type PreviewMotion } from './Preview';
import {
  ARCHETYPES,
  type AvatarRecipe,
  createRecipe,
  getPalettes,
  getParts,
  parseRecipe,
  randomize,
  SLOTS,
  selectPalette,
  selectPart,
} from './style';

const DRAFT_KEY = 'ekza-avatar-builder-draft-v1';

function saveDownload(file: Blob, filename: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AvatarBuilder({
  studioLink,
  toolsLink,
}: {
  readonly studioLink: ReactNode;
  readonly toolsLink: ReactNode;
}): JSX.Element {
  const [recipe, setRecipe] = useState(createRecipe);
  const [motion, setMotion] = useState<PreviewMotion>('Idle');
  const [locked, setLocked] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<'shuffle' | 'vrm' | 'import' | null>(null);
  const [draftState, setDraftState] = useState<'loading' | 'ready' | 'saved' | 'unavailable'>('loading');
  const [unreadableDraft, setUnreadableDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ readonly error: boolean; readonly text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Read device storage after hydration. This also skips the discarded Strict Mode mount.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let draft: string | null = null;
      try {
        draft = window.localStorage.getItem(DRAFT_KEY);
        if (draft !== null) setRecipe(parseRecipe(draft));
        setDraftState(draft === null ? 'ready' : 'saved');
      } catch {
        setDraftState(draft === null ? 'unavailable' : 'ready');
        if (draft !== null) {
          setUnreadableDraft(draft);
          setNotice({
            error: true,
            text: 'This draft could not be restored. Download it or open a valid recipe to continue.',
          });
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const draftReady = draftState !== 'loading';
  const draftMessage =
    unreadableDraft !== null
      ? 'Previous draft kept on this device'
      : {
          loading: '',
          ready: 'Edits are saved on this device',
          saved: 'Draft saved on this device',
          unavailable: 'Draft storage unavailable',
        }[draftState];

  const archetype = ARCHETYPES.find((entry) => entry.id === recipe.archetypeId);
  const filename = `faceless-${recipe.archetypeId}`;

  function replaceRecipe(next: AvatarRecipe): void {
    setRecipe(next);
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      setUnreadableDraft(null);
      setDraftState('saved');
    } catch {
      setDraftState('unavailable');
    }
  }

  function pickArchetype(id: string): void {
    if (id === recipe.archetypeId) return;
    replaceRecipe(createRecipe(id));
    setLocked([]);
    setNotice(null);
  }

  function changePart(event: ChangeEvent<HTMLSelectElement>, slotId: string): void {
    try {
      replaceRecipe(selectPart(recipe, slotId, event.currentTarget.value || null));
      setNotice(null);
    } catch (error) {
      setNotice({ error: true, text: describeError(error) });
    }
  }

  async function shuffle(): Promise<void> {
    setBusy('shuffle');
    setNotice(null);
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      replaceRecipe(await randomize(recipe, seed, locked));
    } catch (error) {
      setNotice({ error: true, text: `Could not generate a variant. ${describeError(error)}` });
    } finally {
      setBusy(null);
    }
  }

  async function downloadVrm(): Promise<void> {
    setBusy('vrm');
    setNotice(null);
    try {
      const { exportAvatar } = await import('./exportAvatar');
      const bytes = await exportAvatar(recipe);
      const buffer = new Uint8Array(bytes).buffer;
      saveDownload(new Blob([buffer], { type: 'model/gltf-binary' }), `${filename}.vrm`);
      setNotice({ error: false, text: 'VRM exported.' });
    } catch (error) {
      setNotice({ error: true, text: `Could not export the VRM. ${describeError(error)}` });
    } finally {
      setBusy(null);
    }
  }

  async function loadRecipe(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    setBusy('import');
    try {
      replaceRecipe(parseRecipe(await file.text()));
      setLocked([]);
      setNotice({ error: false, text: 'Recipe loaded.' });
    } catch (error) {
      setNotice({ error: true, text: `Could not open the recipe. ${describeError(error)}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.workshop}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.brand}>{studioLink}</div>
          <div className={styles.back}>{toolsLink}</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <div>
            <h1>Avatar Builder</h1>
            <p>Assemble a Faceless Fantasy character and export it as VRM.</p>
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={busy !== null || !draftReady}
            onClick={() => void downloadVrm()}
          >
            <span aria-hidden="true" className={styles.downloadIcon}>
              ↓
            </span>
            {busy === 'vrm' ? 'Exporting…' : 'Export VRM'}
          </button>
        </div>

        <fieldset className={styles.presets} aria-label="Character presets">
          {ARCHETYPES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.preset}
              aria-pressed={entry.id === recipe.archetypeId}
              disabled={busy !== null || !draftReady}
              onClick={() => pickArchetype(entry.id)}
            >
              <span className={styles.sigil} data-archetype={entry.id} aria-hidden="true">
                <span />
              </span>
              <span className={styles.presetLabel}>{entry.label}</span>
            </button>
          ))}
        </fieldset>

        <div className={styles.editor}>
          <section className={styles.stage} aria-label="Avatar preview">
            <Preview recipe={recipe} motion={motion} />
            <div className={styles.stageInfo}>
              <h2>{archetype?.label}</h2>
              <p>{archetype?.description}</p>
            </div>
            <div className={styles.stageBar}>
              <fieldset className={styles.motion} aria-label="Preview animation">
                {PREVIEW_MOTIONS.map((mode) => (
                  <button key={mode} type="button" aria-pressed={mode === motion} onClick={() => setMotion(mode)}>
                    {mode}
                  </button>
                ))}
              </fieldset>
              <span className={styles.orbitHint}>Drag to orbit · Scroll to zoom</span>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="customize-heading">
            <div className={styles.panelHead}>
              <h2 id="customize-heading">Customize</h2>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy !== null || !draftReady}
                onClick={() => void shuffle()}
              >
                <span aria-hidden="true" className={styles.shuffleIcon}>
                  ⤨
                </span>
                {busy === 'shuffle' ? 'Shuffling…' : 'Shuffle'}
              </button>
            </div>

            <fieldset className={styles.fields} disabled={busy !== null || !draftReady} aria-label="Character parts">
              {SLOTS.map((slot) => {
                const isLocked = locked.includes(slot.id);
                return (
                  <div key={slot.id} className={styles.field}>
                    <label htmlFor={`avatar-part-${slot.id}`}>{slot.label}</label>
                    <div className={styles.fieldControls}>
                      <div className={styles.selectWrap}>
                        <select
                          id={`avatar-part-${slot.id}`}
                          value={recipe.parts[slot.id] ?? ''}
                          onChange={(event) => changePart(event, slot.id)}
                        >
                          {getParts(recipe, slot.id).map((part) => (
                            <option key={part.id ?? ''} value={part.id ?? ''}>
                              {part.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className={styles.lock}
                        aria-label={`Keep ${slot.label.toLowerCase()} when shuffling`}
                        aria-pressed={isLocked}
                        title={isLocked ? 'Release this part for shuffling' : 'Keep this part when shuffling'}
                        onClick={() =>
                          setLocked((current) =>
                            isLocked ? current.filter((id) => id !== slot.id) : [...current, slot.id],
                          )
                        }
                      >
                        <span aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </fieldset>

            <fieldset className={styles.palettes} disabled={busy !== null || !draftReady}>
              <legend>Palette</legend>
              <div className={styles.paletteList}>
                {getPalettes(recipe).map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    aria-label={palette.label}
                    aria-pressed={recipe.paletteId === palette.id}
                    className={styles.palette}
                    onClick={() => {
                      replaceRecipe(selectPalette(recipe, palette.id));
                      setNotice(null);
                    }}
                  >
                    <span className={styles.swatches} aria-hidden="true">
                      <span style={{ backgroundColor: palette.primary }} />
                      <span style={{ backgroundColor: palette.secondary }} />
                      <span style={{ backgroundColor: palette.accent }} />
                    </span>
                    <span>{palette.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className={styles.recipeTools}>
              <input
                hidden
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="Recipe file"
                onChange={(event) => void loadRecipe(event)}
              />
              <button
                className={styles.textButton}
                type="button"
                disabled={busy !== null || !draftReady}
                onClick={() => fileInput.current?.click()}
              >
                Open recipe
              </button>
              <button
                className={styles.textButton}
                type="button"
                disabled={busy !== null || !draftReady}
                onClick={() => {
                  saveDownload(
                    new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }),
                    `${filename}.json`,
                  );
                  setNotice({ error: false, text: 'Recipe downloaded.' });
                }}
              >
                Save recipe
              </button>
              {unreadableDraft === null ? null : (
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => {
                    saveDownload(new Blob([unreadableDraft], { type: 'application/json' }), 'avatar-draft.json');
                  }}
                >
                  Download old draft
                </button>
              )}
            </div>
            <output className={styles.draftStatus}>{draftMessage}</output>
          </section>
        </div>
        {notice?.error === true ? (
          <p className={styles.notice} data-error="true" role="alert">
            {notice.text}
          </p>
        ) : notice !== null ? (
          <output className={styles.notice}>{notice.text}</output>
        ) : null}
      </main>
    </div>
  );
}
