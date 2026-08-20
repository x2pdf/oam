import React, { forwardRef } from 'react';
import PagerView from 'react-native-pager-view';
import type { TabPagerProps, TabPagerRef } from './TabPager.types';

export type { TabPagerProps, TabPagerRef };

const TabPager = forwardRef<TabPagerRef, TabPagerProps>(function TabPager(
  { style, initialPage = 0, onPageSelected, children },
  ref,
) {
  return (
    <PagerView
      ref={ref as React.Ref<PagerView>}
      style={style}
      initialPage={initialPage}
      onPageSelected={onPageSelected}
    >
      {children}
    </PagerView>
  );
});

export default TabPager;
