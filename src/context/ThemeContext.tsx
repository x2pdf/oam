import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaperProvider, MD3Theme } from 'react-native-paper';
import { lightTheme, darkTheme } from '../theme';
import { STORAGE_KEYS } from '../constants';
import { migrateLegacyStorage } from '../storage/migrate';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  theme: MD3Theme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export const ThemeProvider: React.FC<Props> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      try {
        await migrateLegacyStorage();
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
        if (saved === 'light' || saved === 'dark') {
          setThemeModeState(saved);
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

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;
  const isDark = themeMode === 'dark';

  const value = useMemo<ThemeContextType>(
    () => ({ themeMode, setThemeMode, theme, isDark }),
    [themeMode, setThemeMode, theme, isDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
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
