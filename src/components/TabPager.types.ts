import type { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

export type TabPagerRef = {
  setPage: (index: number) => void;
};

export type TabPagerProps = {
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  children: ReactNode;
};
