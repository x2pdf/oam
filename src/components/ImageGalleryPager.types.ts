import type { ReactNode } from 'react';

export type ImageGalleryPagerProps = {
  initialPage: number;
  scrollEnabled: boolean;
  onPageSelected: (position: number) => void;
  children: ReactNode;
};
