import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

/** 应用主色调 */
const PRIMARY_COLOR = '#4A90D9';
const SECONDARY_COLOR = '#7B68EE';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: PRIMARY_COLOR,
    primaryContainer: '#D6E8F7',
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
    primary: '#8BB8E8',
    primaryContainer: '#2A5A8A',
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
