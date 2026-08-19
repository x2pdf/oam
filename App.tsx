import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/i18n'; // Initialize i18n
import { AppProvider } from './src/context/AppContext';
import { WalletSessionProvider } from './src/wallet/WalletSessionContext';
import AppNavigator from './src/navigation/AppNavigator';
import { lightTheme } from './src/theme';

/**
 * Onchain Data — 应用根组件
 *
 * Provider 层次（由外到内）：
 *   SafeAreaProvider → PaperProvider → AppProvider → WalletSessionProvider → AppNavigator
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={lightTheme}>
        <AppProvider>
          <WalletSessionProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </WalletSessionProvider>
        </AppProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
