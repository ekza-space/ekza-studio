'use client';

import { type ChangeEvent, type JSX, type ReactNode, useEffect, useRef, useState } from 'react';
import styles from './AvatarBuilder.module.css';
import { loadStyleDraft, preserveLegacyDraft, restoreActiveDraft, saveDraft, selectActiveStyle } from './drafts';
import { PREVIEW_MOTIONS, Preview, type PreviewMotion } from './Preview';
import {
  type AvatarRecipe,
  createRecipe,
  getArchetypes,
  getPalettes,
  getParts,
  getSlots,
  getStyle,
  listStyles,
  parseRecipe,
  randomize,
  selectPalette,
  selectPart,
} from './style';

type DraftState = 'loading' | 'ready' | 'saved' | 'unavailable';

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
  const [draftState, setDraftState] = useState<DraftState>('loading');
  const [unreadableDraft, setUnreadableDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ readonly error: boolean; readonly text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Read device storage after hydration. This also skips the discarded Strict Mode mount.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const draft = restoreActiveDraft(window.localStorage);
        setRecipe(draft.recipe);
        setDraftState(draft.state);
        setUnreadableDraft(draft.unreadable);
        if (draft.unreadable !== null) {
          setNotice({
            error: true,
            text: 'This draft could not be restored. Download it or open a valid recipe to continue.',
          });
        }
      } catch {
        setDraftState('unavailable');
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

  const style = getStyle(recipe);
  const availableStyles = listStyles();
  const archetypes = getArchetypes(recipe);
  const archetype = archetypes.find((entry) => entry.id === recipe.archetypeId);
  const filename = `${recipe.styleId}-${recipe.archetypeId}`;
  const controlsDisabled = busy !== null || !draftReady;

  function preserveCurrentDraft(storage: Storage): void {
    if (draftState === 'saved' || unreadableDraft !== null) {
      preserveLegacyDraft(storage, recipe, unreadableDraft);
    }
  }

  function replaceRecipe(next: AvatarRecipe): void {
    setRecipe(next);
    try {
      const storage = window.localStorage;
      if (next.styleId !== recipe.styleId) preserveCurrentDraft(storage);
      saveDraft(storage, next);
      setUnreadableDraft(null);
      setDraftState('saved');
    } catch {
      setDraftState('unavailable');
    }
  }

  function pickStyle(styleId: string): void {
    if (styleId === recipe.styleId) return;
    setLocked([]);
    try {
      const storage = window.localStorage;
      preserveCurrentDraft(storage);
      const next = loadStyleDraft(storage, styleId);
      selectActiveStyle(storage, styleId);
      setRecipe(next.recipe);
      setUnreadableDraft(next.unreadable);
      setDraftState(next.state);
      setNotice(
        next.unreadable === null
          ? null
          : {
              error: true,
              text: 'This style’s draft could not be restored. The default is open and the previous draft can be downloaded.',
            },
      );
    } catch {
      setRecipe(createRecipe(undefined, styleId));
      setUnreadableDraft(null);
      setDraftState('unavailable');
      setNotice(null);
    }
  }

  function pickArchetype(id: string): void {
    if (id === recipe.archetypeId) return;
    replaceRecipe(createRecipe(id, recipe.styleId, recipe.styleVersion));
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
            <p>{availableStyles.length > 1 ? style.description : `${style.label} · ${style.description}`}</p>
          </div>
          <div className={styles.introActions}>
            {availableStyles.length > 1 ? (
              <div className={`${styles.field} ${styles.stylePicker}`}>
                <label htmlFor="avatar-style">Style</label>
                <div className={styles.selectWrap}>
                  <select
                    id="avatar-style"
                    disabled={controlsDisabled}
                    value={recipe.styleId}
                    onChange={(event) => pickStyle(event.currentTarget.value)}
                  >
                    {availableStyles.map((pack) => (
                      <option key={pack.styleId} value={pack.styleId}>
                        {pack.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className={styles.primary}
              disabled={controlsDisabled}
              onClick={() => void downloadVrm()}
            >
              <span aria-hidden="true" className={styles.downloadIcon}>
                ↓
              </span>
              {busy === 'vrm' ? 'Exporting…' : 'Export VRM'}
            </button>
          </div>
        </div>

        <fieldset className={styles.presets} aria-label="Character presets">
          {archetypes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.preset}
              aria-pressed={entry.id === recipe.archetypeId}
              disabled={controlsDisabled}
              onClick={() => pickArchetype(entry.id)}
            >
              <span className={styles.sigil} data-sigil={entry.sigil} aria-hidden="true">
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
                disabled={controlsDisabled}
                onClick={() => void shuffle()}
              >
                <span aria-hidden="true" className={styles.shuffleIcon}>
                  ⤨
                </span>
                {busy === 'shuffle' ? 'Shuffling…' : 'Shuffle'}
              </button>
            </div>

            <fieldset className={styles.fields} disabled={controlsDisabled} aria-label="Character parts">
              {getSlots(recipe).map((slot) => {
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

            <fieldset className={styles.palettes} disabled={controlsDisabled}>
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
                disabled={controlsDisabled}
                onClick={() => fileInput.current?.click()}
              >
                Open recipe
              </button>
              <button
                className={styles.textButton}
                type="button"
                disabled={controlsDisabled}
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
