import React from 'react';
import {
  Platform,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

const LIST_GUTTER = 16;

export function isDesktopOs(): boolean {
  return Platform.OS === 'web' || Platform.OS === 'windows' || Platform.OS === 'macos';
}

/**
 * 桌面端（web / Windows / macOS）且横屏时，列表卡片居中占 50% 宽，左右各留 25%。
 * 手机与竖屏保持原先全宽 + 16 边距。
 */
export function useListColumnLayout() {
  const { width, height } = useWindowDimensions();
  const centered = isDesktopOs() && width > height;
  const cardWidth = centered ? width * 0.5 : width - LIST_GUTTER * 2;
  const listContentStyle: ViewStyle = centered
    ? { alignItems: 'center', paddingHorizontal: 0 }
    : { paddingHorizontal: LIST_GUTTER };
  const columnStyle: ViewStyle = {
    width: cardWidth,
    maxWidth: cardWidth,
    alignSelf: 'center',
  };
  /** 桌面横屏时顶栏返回/右侧按钮与中间 50% 内容列对齐的左右留白。 */
  const gutterWidth = centered ? width * 0.25 : 0;

  return { centered, cardWidth, listContentStyle, columnStyle, gutterWidth };
}

export function ListColumn({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { columnStyle } = useListColumnLayout();
  return <View style={[columnStyle, style]}>{children}</View>;
}
