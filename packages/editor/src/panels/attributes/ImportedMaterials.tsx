import { type CharacterId, type TableName } from '@ekza-studio/doc';
import { type EditorApp, MATERIAL_OVERRIDES_TABLE, materialOverrides, PANEL } from '@ekza-studio/editor-core';
import { importedMaterialTargets, type MaterialColor } from '@ekza-studio/io';
import { type JSX, useCallback } from 'react';
import { useDocQuery } from '../../hooks';
import { useCharactersVersion } from '../channels/kit/hooks';
import { runOperator } from '../channels/kit/run';
import { BUTTON, MUTED_TEXT } from '../channels/kit/styles';

const srgb = (linear: number) => (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);
const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const hex = (factor: MaterialColor): string =>
  `#${factor
    .slice(0, 3)
    .map((n) =>
      Math.round(srgb(n) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Deliberately separate from authored palette shaders. An imported material keeps its source texture and alpha. */
export default function ImportedMaterials({
  app,
  character,
}: {
  readonly app: EditorApp;
  readonly character: CharacterId;
}): JSX.Element {
  useCharactersVersion(app);
  const read = useCallback(() => materialOverrides(app.store, character), [app, character]);
  const rows = useDocQuery(read, [MATERIAL_OVERRIDES_TABLE as TableName]);
  const runtime = app.characters.get(character);
  const targets = runtime === undefined ? [] : importedMaterialTargets(runtime.container);
  const record = app.store.get('characters', character);
  if (record?.source.kind !== 'asset') return <p className={MUTED_TEXT}>Authored meshes use Palette materials.</p>;
  const request = {
    kind: 'bake-into-model',
    character,
    clips: [],
    fileNamePattern: '{character}_colour',
    profile: null,
    closeLoop: false,
    includeConstantTracks: false,
    acknowledgeLicense: false,
  } as const;
  const poll = app.operators.poll('file.export', { panel: PANEL.attributes }, request);
  return (
    <div className="space-y-3" data-testid="imported-materials">
      <p className={MUTED_TEXT}>
        Base colour multiplies the existing texture. Source opacity stays unchanged. PBR/unlit only; game use requires a
        separate review.
      </p>
      {targets.length === 0 ? (
        <p className={MUTED_TEXT}>No imported materials available.</p>
      ) : (
        targets.map((target) => {
          const edited = rows.find((row) => row.material === target.material);
          const factor = edited?.baseColorFactor ?? target.baseColorFactor;
          const commit = (value: string): void => {
            if (!/^#[0-9a-f]{6}$/i.test(value)) return;
            const color: MaterialColor = [
              linear(Number.parseInt(value.slice(1, 3), 16) / 255),
              linear(Number.parseInt(value.slice(3, 5), 16) / 255),
              linear(Number.parseInt(value.slice(5, 7), 16) / 255),
              target.baseColorFactor[3],
            ];
            void runOperator(app, PANEL.attributes, 'material.setBaseColor', {
              character,
              baseSha256: target.baseSha256,
              material: target.material,
              materialSha256: target.materialSha256,
              baseColorFactor: color,
            });
          };
          return (
            <div key={target.material} className="space-y-1">
              <label className="flex items-center justify-between gap-2">
                <span>{target.name}</span>
                <input
                  type="color"
                  className="min-h-11 min-w-11"
                  aria-label={`${target.name} base colour`}
                  value={hex(factor)}
                  disabled={!target.supported || app.store.readOnly}
                  title={target.reason ?? 'Base colour (sRGB picker; linear glTF values)'}
                  onChange={(event) => commit(event.currentTarget.value)}
                />
              </label>
              {target.supported ? (
                <input
                  key={hex(factor)}
                  type="text"
                  aria-label={`${target.name} colour hex`}
                  className="min-h-11 w-28 rounded border border-line bg-field px-2"
                  defaultValue={hex(factor)}
                  maxLength={7}
                  disabled={app.store.readOnly}
                  onBlur={(event) => {
                    const value = event.currentTarget.value;
                    if (/^#[0-9a-f]{6}$/i.test(value) && value.toLowerCase() !== hex(factor)) commit(value);
                    else event.currentTarget.value = hex(factor);
                  }}
                />
              ) : null}
              {target.reason === null ? (
                <button
                  type="button"
                  className={`${BUTTON} min-h-11`}
                  disabled={edited === undefined || app.store.readOnly}
                  onClick={() => {
                    void runOperator(app, PANEL.attributes, 'material.resetBaseColor', {
                      character,
                      material: target.material,
                    });
                  }}
                >
                  Reset colour
                </button>
              ) : (
                <p className={MUTED_TEXT}>{target.reason}</p>
              )}
            </div>
          );
        })
      )}
      <button
        type="button"
        className={`${BUTTON} min-h-11`}
        disabled={rows.length === 0 || poll !== true}
        title={poll === true ? 'Downloads a colour variant; preserves source animations' : poll.reason}
        onClick={() => {
          void runOperator(app, PANEL.attributes, 'file.export', request);
        }}
      >
        Export colour variant
      </button>
      {rows.length > 0 && poll !== true ? (
        <p className={MUTED_TEXT}>{poll.reason}. File › Export offers additional options.</p>
      ) : null}
      <p className={MUTED_TEXT}>
        Save .ekzanim to keep these editable colours. Animation-only exports do not include materials.
      </p>
    </div>
  );
}
