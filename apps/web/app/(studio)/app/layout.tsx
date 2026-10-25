import type { Metadata, Viewport } from 'next';
import type { JSX, ReactNode } from 'react';

// STUDIO-TOUCH-SPEC §20.1, §19 (T2; ST-22): `/app` only. The page draws under the iPad's rounded corners and home
// indicator (`viewport-fit=cover`; the shell keeps its targets inside the safe areas) and links the web manifest
// scoped to `/app` (T0 ships `public/manifest.webmanifest`). `/editor` and `/autorig` keep the root viewport.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#1b1c1f',
};

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Ekza Studio', statusBarStyle: 'black-translucent' },
  // A segment's `icons` replaces the root's file-convention icon (`app/icon.svg`), so it is named again here: without
  // it `/app` had no icon link and every first visit logged a `/favicon.ico` 404 (T12, ST-INT-4).
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
};

/** A segment layout below the shared `(studio)` one: it adds head tags only, so a switch keeps the host mounted. */
export default function HaloLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  return <>{children}</>;
}
