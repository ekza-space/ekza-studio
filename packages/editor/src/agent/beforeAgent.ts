// "Restore the project as it was before the agent" (MCP-SPEC §5.11, §5.13; STUDIO-TOUCH-SPEC §14; T12, P-T10-4): the
// session keeps the document as it was right before the agent's first edit of a pairing — in memory, never the
// document or autosave — so a shell can put it back with `edit.restoreDocument`, also past steps that left the undo
// stack. The live session and the e2e fake take it the same way.
import type { DocSnapshot } from '@ekza-studio/doc';
import type { EditorApp } from '@ekza-studio/editor-core';

export interface BeforeAgent {
  readonly snapshot: DocSnapshot;
  readonly at: number;
  /** A rough size (a shallow walk: typed arrays by their bytes, arrays and records by count), for display only. */
  readonly approxBytes: number;
}

const FIELD_BYTES = 16;

function approxValueBytes(value: unknown): number {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length * FIELD_BYTES;
  return FIELD_BYTES;
}

/** A cheap estimate of a snapshot's size: every record's top-level fields. */
export function approxSnapshotBytes(snapshot: DocSnapshot): number {
  let bytes = 0;
  for (const table of Object.values(snapshot.tables)) {
    for (const record of Object.values(table)) {
      if (typeof record !== 'object' || record === null) continue;
      for (const value of Object.values(record as Record<string, unknown>)) bytes += approxValueBytes(value);
    }
  }
  return bytes;
}

/** The document now, as the state before the agent's first edit. */
export function takeBeforeAgent(app: EditorApp, now = Date.now()): BeforeAgent {
  const snapshot = app.store.snapshot();
  return { snapshot, at: now, approxBytes: approxSnapshotBytes(snapshot) };
}
