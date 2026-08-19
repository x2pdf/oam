import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/i18n'; // Initialize i18n
import { AppProvider, useAppContext } from './src/context/AppContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { WalletSessionProvider } from './src/wallet/WalletSessionContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/components/SplashScreen';

const SPLASH_MIN_DURATION_MS = 2000;

function AppContent() {
  const { state } = useAppContext();
  const theme = useTheme();
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDurationElapsed(true), SPLASH_MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  const showSplash = state.isLoading || !minDurationElapsed;

  if (showSplash) {
    return <SplashScreen isDark={theme.dark} />;
  }

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

/**
 * Onchain Data — 应用根组件
 *
 * Provider 层次（由外到内）：
 *   SafeAreaProvider → ThemeProvider → AppProvider → WalletSessionProvider → AppContent
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <WalletSessionProvider>
            <AppContent />
          </WalletSessionProvider>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
