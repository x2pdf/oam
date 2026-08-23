import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import { useThemePreference } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useListColumnLayout } from '../theme/layout';

import HomeScreen from '../screens/HomeScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SendDataScreen from '../screens/SendDataScreen';
import SubscriptionFormScreen from '../screens/SubscriptionFormScreen';
import AddInfoSelectScreen from '../screens/AddInfoSelectScreen';
import AddAddressFormScreen from '../screens/AddAddressFormScreen';
import WalletDisclaimerScreen from '../screens/WalletDisclaimerScreen';
import RecoverDisclaimerScreen from '../screens/RecoverDisclaimerScreen';
import MnemonicBackupScreen from '../screens/MnemonicBackupScreen';
import MnemonicInputScreen from '../screens/MnemonicInputScreen';
import WalletVerifyScreen from '../screens/WalletVerifyScreen';
import WalletSetupScreen from '../screens/WalletSetupScreen';
import PrivateKeyDisclaimerScreen from '../screens/PrivateKeyDisclaimerScreen';
import PrivateKeyInputScreen from '../screens/PrivateKeyInputScreen';
import PrivateKeyVerifyScreen from '../screens/PrivateKeyVerifyScreen';
import PrivateKeySetupScreen from '../screens/PrivateKeySetupScreen';
import InputDataDetailScreen from '../screens/InputDataDetailScreen';
import AddressDataListScreen from '../screens/AddressDataListScreen';
import SubscriptionDetailScreen from '../screens/SubscriptionDetailScreen';
import LocalFavoritesScreen from '../screens/LocalFavoritesScreen';
import AppInfoScreen from '../screens/AppInfoScreen';
import { RootStackParamList, MainTabParamList } from '../types';
import { getHeaderChrome } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/* ------------------------------------------------------------------ */
/*  底部 Tab 导航                                                      */
/* ------------------------------------------------------------------ */

function MainTabNavigator() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const headerChrome = getHeaderChrome(theme);
  const { centered } = useListColumnLayout();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: headerChrome.backgroundColor,
          height: 48 + insets.top,
        },
        headerTitleAlign: 'center',
        headerTintColor: headerChrome.tintColor,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: Math.round(16 * fontScale),
        },
        headerShadowVisible: !theme.dark,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline + '20',
          ...(centered ? { width: '50%', alignSelf: 'center' } : {}),
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarLabel: t('nav.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Subscriptions"
        component={SubscriptionsScreen}
        options={{
          title: t('nav.subscriptions'),
          tabBarLabel: t('nav.subscriptions'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('nav.profile'),
          tabBarLabel: t('nav.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/* ------------------------------------------------------------------ */
/*  根 Stack（Tab + 表单页）                                           */
/* ------------------------------------------------------------------ */

export default function AppNavigator() {
  const theme = useTheme();
  const { t } = useTranslation();
  const headerChrome = getHeaderChrome(theme);

  const navigationTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme : DefaultTheme).colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outline,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: headerChrome.backgroundColor },
          headerTintColor: headerChrome.tintColor,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: !theme.dark,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SubscriptionForm"
          component={SubscriptionFormScreen}
          options={({ route }) => ({
            title:
              route.params?.mode === 'add'
                ? t('form.addSubscription')
                : t('form.editSubscription'),
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="AddInfoSelect"
          component={AddInfoSelectScreen}
          options={{
            title: t('nav.addInfoSelect'),
          }}
        />
        <Stack.Screen
          name="AddAddressForm"
          component={AddAddressFormScreen}
          options={({ route }) => ({
            title: route.params?.mode === 'add' ? t('nav.addAddressForm') : t('nav.editAddressForm'),
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="WalletDisclaimer"
          component={WalletDisclaimerScreen}
          options={{
            title: t('nav.walletDisclaimer'),
          }}
        />
        <Stack.Screen
          name="RecoverDisclaimer"
          component={RecoverDisclaimerScreen}
          options={{
            title: t('nav.recoverDisclaimer'),
          }}
        />
        <Stack.Screen
          name="MnemonicBackup"
          component={MnemonicBackupScreen}
          options={{
            title: t('nav.mnemonicBackup'),
          }}
        />
        <Stack.Screen
          name="MnemonicInput"
          component={MnemonicInputScreen}
          options={{
            title: t('nav.mnemonicInput'),
          }}
        />
        <Stack.Screen
          name="WalletVerify"
          component={WalletVerifyScreen}
          options={{
            title: t('nav.walletVerify'),
          }}
        />
        <Stack.Screen
          name="WalletSetup"
          component={WalletSetupScreen}
          options={{
            title: t('nav.walletSetup'),
          }}
        />
        <Stack.Screen
          name="PrivateKeyDisclaimer"
          component={PrivateKeyDisclaimerScreen}
          options={{
            title: t('nav.privateKeyDisclaimer'),
          }}
        />
        <Stack.Screen
          name="PrivateKeyInput"
          component={PrivateKeyInputScreen}
          options={{
            title: t('nav.privateKeyInput'),
          }}
        />
        <Stack.Screen
          name="PrivateKeyVerify"
          component={PrivateKeyVerifyScreen}
          options={{
            title: t('nav.privateKeyVerify'),
          }}
        />
        <Stack.Screen
          name="PrivateKeySetup"
          component={PrivateKeySetupScreen}
          options={{
            title: t('nav.privateKeySetup'),
          }}
        />
        <Stack.Screen
          name="SendData"
          component={SendDataScreen}
          options={{
            title: t('nav.sendData'),
          }}
        />
        <Stack.Screen
          name="InputDataDetail"
          component={InputDataDetailScreen}
          options={{
            title: t('nav.inputDataDetail'),
          }}
        />
        <Stack.Screen
          name="SubscriptionDetail"
          component={SubscriptionDetailScreen}
          options={{
            title: t('nav.subscriptionDetail'),
          }}
        />
        <Stack.Screen
          name="LocalFavorites"
          component={LocalFavoritesScreen}
          options={{
            title: t('nav.localFavorites'),
          }}
        />
        <Stack.Screen
          name="AddressDataList"
          component={AddressDataListScreen}
          options={({ route }) => ({
            title: route.params?.peerAddress
              ? t('nav.conversation')
              : route.params?.title || t('nav.addressDataList'),
          })}
        />
        <Stack.Screen
          name="AppInfo"
          component={AppInfoScreen}
          options={{
            title: t('nav.appInfo'),
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
