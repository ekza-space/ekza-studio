'use client';

import { StudioHost } from '@ekza-studio/editor/host';
import { HaloShell, setGenerationGateway } from '@ekza-studio/halo';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { hostProps } from '../hostProps';
import { useShellEntry } from '../StudioHostIsland';

// T8 (ADR 0017 §2): the build's generation gateway ('' = none; inlined at build time) decides whether Create with AI
// shows (`docs/wp-notes/m7-gbc.md` "Availability").
setGenerationGateway(process.env.NEXT_PUBLIC_EKZA_GEN_GATEWAY);

/** `/app`'s entry group (STUDIO-TOUCH-SPEC §20.1): the page's host and the Halo shell, registered with the layout. */
export function HaloEntry(): null {
  const router = useRouter();
  const entry = useMemo(
    () => ({ Host: StudioHost, Shell: HaloShell, props: hostProps((href) => router.push(href)) }),
    [router],
  );
  useShellEntry(entry);
  return null;
}
