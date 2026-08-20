import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TabPagerProps, TabPagerRef } from './TabPager.types';

export type { TabPagerProps, TabPagerRef };

const TabPager = forwardRef<TabPagerRef, TabPagerProps>(function TabPager(
  { style, initialPage = 0, onPageSelected, children },
  ref,
) {
  const [page, setPage] = useState(initialPage);

  useImperativeHandle(ref, () => ({
    setPage: (index: number) => {
      setPage(index);
      onPageSelected?.({ nativeEvent: { position: index } });
    },
  }));

  return (
    <View style={[styles.root, style]}>
      {React.Children.map(children, (child, index) => (
        <View style={[styles.page, index === page ? styles.visible : styles.hidden]}>
          {child}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  page: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  visible: {
    display: 'flex',
  },
  hidden: {
    display: 'none',
  },
});

export default TabPager;
