// A value projected onto the canvas that follows the camera (STUDIO-TOUCH-SPEC §4.1: handles and chips sit beside
// the work): recomputed every animation frame while active, and stored only when it moved, so an idle handle costs
// one projection per frame and no render.
import { useEffect, useState } from 'react';

export function useProjected<T>(active: boolean, compute: () => T, same: (a: T, b: T) => boolean): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!active) {
      setValue(null);
      return undefined;
    }
    let frame = 0;
    let last: T | null = null;
    const step = (): void => {
      const next = compute();
      if (last === null || next === null || !same(last, next)) {
        last = next;
        setValue(next);
      }
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
    // `compute` and `same` are read each frame; the loop restarts only when it turns on or off
    // oxlint-disable-next-line react/exhaustive-deps
  }, [active]);
  return active ? value : null;
}

/** Two points within half a CSS px. */
export const nearPoint = (
  a: { readonly x: number; readonly y: number } | null,
  b: { readonly x: number; readonly y: number } | null,
): boolean => (a === null || b === null ? a === b : Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5);
