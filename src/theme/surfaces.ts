import { useMemo } from 'react';
import { ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

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
