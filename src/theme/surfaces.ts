import { useMemo } from 'react';
import { ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';
import { getModalInsetColor } from './index';

/** 透明底细线框，边框样式对齐 InputDataCard kindBadge，颜色更淡 */
export function useOutlineFrameStyle(): ViewStyle {
  const theme = useTheme();

  return useMemo(
    () => ({
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.outline + (theme.dark ? '50' : '40'),
      borderRadius: theme.roundness,
      overflow: 'hidden',
    }),
    [theme.colors.outline, theme.dark, theme.roundness],
  );
}

/** 弹窗内列表行（单选、权重编辑等） */
export function useModalListRowStyle(): ViewStyle {
  const theme = useTheme();

  return useMemo(
    () =>
      theme.dark
        ? {
            backgroundColor: getModalInsetColor(theme.colors, true),
            borderRadius: theme.roundness,
            marginBottom: 4,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }
        : {},
    [theme.colors, theme.dark, theme.roundness],
  );
}

/** 弹窗内嵌信息区块（确认发送、手续费详情等） */
export function useModalInsetFrameStyle(): ViewStyle {
  const theme = useTheme();

  return useMemo(
    () => ({
      backgroundColor: getModalInsetColor(theme.colors, theme.dark),
      borderWidth: 1,
      borderColor: theme.colors.outline + (theme.dark ? '50' : '40'),
      borderRadius: theme.roundness,
      overflow: 'hidden',
    }),
    [theme.colors, theme.dark, theme.roundness],
  );
}
