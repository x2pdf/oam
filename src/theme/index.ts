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

/**
 * 暗色中性灰 elevation 阶梯（Lights Out 风格，无 MD3 紫调）。
 * background #121316 → surface #1A1C1E → level1…level5 逐级提亮。
 */
const darkElevation = {
  level0: 'transparent',
  level1: '#1E2024',
  level2: '#24262A',
  level3: '#25282C',
  level4: '#2E3034',
  level5: '#36393E',
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
    outlineVariant: '#3A3D42',
    backdrop: 'rgba(0, 0, 0, 0.6)',
    surfaceVariant: darkElevation.level4,
    elevation: { ...darkElevation },
    /** 弹窗壳，对齐 elevation.level3 */
    modalSurface: darkElevation.level3,
    /** 弹窗内列表行 / 信息区块，对齐 elevation.level4 */
    modalInset: darkElevation.level4,
  },
  roundness: 12,
};

type ModalThemeColors = {
  surface: string;
  surfaceVariant: string;
  modalSurface?: string;
  modalInset?: string;
};

/** 弹窗壳背景色（浅色沿用 surface，暗色用中性灰 modalSurface） */
export function getModalSurfaceColor(colors: ModalThemeColors, dark: boolean): string {
  if (!dark) return colors.surface;
  return colors.modalSurface ?? colors.surface;
}

/** 弹窗内嵌区块背景色（浅色透明，暗色用中性灰 modalInset） */
export function getModalInsetColor(colors: ModalThemeColors, dark: boolean): string {
  if (!dark) return 'transparent';
  return colors.modalInset ?? colors.surfaceVariant;
}

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
