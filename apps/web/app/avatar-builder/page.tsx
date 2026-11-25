import { AvatarBuilder } from '@ekza-studio/avatar-builder';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { JSX } from 'react';

export const metadata: Metadata = {
  title: 'Avatar Builder',
  description: 'Build and export modular VRM characters in Ekza Studio.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#171816',
};

export default function AvatarBuilderPage(): JSX.Element {
  return (
    <AvatarBuilder
      studioLink={<Link href="/?chooser=1">Ekza Studio</Link>}
      toolsLink={
        <Link href="/?chooser=1">
          <span aria-hidden="true">←</span> All tools
        </Link>
      }
    />
  );
}
