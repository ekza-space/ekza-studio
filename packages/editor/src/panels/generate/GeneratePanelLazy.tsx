// The Generate panel behind a React.lazy boundary (the agent panel's pattern): the route loads nothing of the flow.
import { type JSX, lazy, Suspense } from 'react';
import type { PanelProps } from '../types';

const GeneratePanel = lazy(() => import('./GeneratePanel'));

export function GeneratePanelLazy(props: PanelProps): JSX.Element {
  return (
    <Suspense fallback={<div className="p-3 text-ui text-fg-3">Loading…</div>}>
      <GeneratePanel {...props} />
    </Suspense>
  );
}
