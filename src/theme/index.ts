import { MD3LightTheme, MD3DarkTheme, MD3Theme } from 'react-native-paper';

/** 应用主色调（Twitter / X 经典蓝） */
const PRIMARY_COLOR = '#1DA1F2';
const SECONDARY_COLOR = '#7B68EE';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: PRIMARY_COLOR,
    primaryContainer: '#D0EFFF',
    secondary: SECONDARY_COLOR,
    secondaryContainer: '#E8E0FF',
    surface: '#FAFBFC',
    background: '#F0F2F5',
    onSurface: '#1A1C1E',
    onSurfaceVariant: '#43474E',
    outline: '#73777F',
  },
  roundness: 12,
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: PRIMARY_COLOR,
    primaryContainer: '#0B5A94',
    secondary: '#B0A0FF',
    secondaryContainer: '#4A3A8A',
    surface: '#1A1C1E',
    background: '#121316',
    onSurface: '#E2E2E5',
    onSurfaceVariant: '#C3C7CE',
    outline: '#8D9199',
  },
  roundness: 12,
};

/** 顶栏：浅色用品牌蓝，暗色跟页面背景走（推特 Lights out 做法） */
export function getHeaderChrome(theme: {
  dark: boolean;
  colors: { primary: string; background: string; onSurface: string };
}) {
  return {
    backgroundColor: theme.dark ? theme.colors.background : theme.colors.primary,
    tintColor: theme.dark ? theme.colors.onSurface : '#FFFFFF',
  };
}

/**
 * 基于基础主题与缩放因子生成字体缩放后的主题。
 * 仅缩放 typography variants 的 fontSize 与 lineHeight，
 * `default` 条目（无 fontSize/lineHeight）保持不变。
 */
export function buildScaledTheme(base: typeof lightTheme, fontScale: number): MD3Theme {
  if (fontScale === 1) return base as unknown as MD3Theme;
  const scaledFonts = { ...(base as any).fonts };
  for (const key of Object.keys(scaledFonts)) {
    if (key === 'default') continue;
    const entry = scaledFonts[key];
    if (entry && typeof entry.fontSize === 'number') {
      scaledFonts[key] = {
        ...entry,
        fontSize: Math.round(entry.fontSize * fontScale),
        lineHeight: Math.round((entry.lineHeight || 0) * fontScale),
      };
    }
  }
  return { ...base, fonts: scaledFonts } as unknown as MD3Theme;
}
