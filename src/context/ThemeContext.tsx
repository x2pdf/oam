import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaperProvider } from 'react-native-paper';
import { lightTheme, darkTheme, buildScaledTheme } from '../theme';
import { STORAGE_KEYS } from '../constants';
import { migrateLegacyStorage } from '../storage/migrate';

export type ThemeMode = 'light' | 'dark' | 'auto';

/** 字体缩放预设档位 */
export const FONT_SCALE_PRESETS = [
  { value: 0.8, labelKey: 'profile.fontSizeSmaller' },
  { value: 0.9, labelKey: 'profile.fontSizeSmall' },
  { value: 1.0, labelKey: 'profile.fontSizeDefault' },
  { value: 1.15, labelKey: 'profile.fontSizeLarge' },
  { value: 1.3, labelKey: 'profile.fontSizeLarger' },
] as const;

/** 默认字体缩放因子 */
const DEFAULT_FONT_SCALE = 1.0;

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export const ThemeProvider: React.FC<Props> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto');
  const [fontScale, setFontScaleState] = useState<number>(DEFAULT_FONT_SCALE);

  useEffect(() => {
    (async () => {
      try {
        await migrateLegacyStorage();
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
        if (saved === 'light' || saved === 'dark' || saved === 'auto') {
          setThemeModeState(saved as ThemeMode);
        }
        const savedScale = await AsyncStorage.getItem(STORAGE_KEYS.FONT_SCALE);
        if (savedScale !== null) {
          const parsed = parseFloat(savedScale);
          if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2.0) {
            setFontScaleState(parsed);
          }
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      }
    })();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.THEME, mode);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  }, []);

  const setFontScale = useCallback(async (scale: number) => {
    setFontScaleState(scale);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.FONT_SCALE, String(scale));
    } catch (error) {
      console.warn('Failed to save font scale:', error);
    }
  }, []);

  const isDark = themeMode === 'auto' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const baseTheme = isDark ? darkTheme : lightTheme;

  const scaledTheme = useMemo(
    () => buildScaledTheme(baseTheme, fontScale),
    [baseTheme, fontScale],
  );

  const value = useMemo<ThemeContextType>(
    () => ({ themeMode, setThemeMode, fontScale, setFontScale, isDark }),
    [themeMode, setThemeMode, fontScale, setFontScale, isDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={scaledTheme}>{children}</PaperProvider>
    </ThemeContext.Provider>
  );
};

export const useThemePreference = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference must be used within a ThemeProvider');
  }
  return context;
};
