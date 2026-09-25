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
import AddAttachmentScreen from '../screens/AddAttachmentScreen';
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
import LocalDraftsScreen from '../screens/LocalDraftsScreen';
import ContentFiltersScreen from '../screens/ContentFiltersScreen';
import ContentFilterFormScreen from '../screens/ContentFilterFormScreen';
import ContentFilterDetailScreen from '../screens/ContentFilterDetailScreen';
import AppInfoScreen from '../screens/AppInfoScreen';
import FollowListSelectionScreen from '../screens/FollowListSelectionScreen';
import CacheManagementScreen from '../screens/CacheManagementScreen';
import SettingsChoiceScreen from '../screens/settings/SettingsChoiceScreen';
import ApiKeySettingsScreen from '../screens/settings/ApiKeySettingsScreen';
import DataSourceWeightsScreen from '../screens/settings/DataSourceWeightsScreen';
import HomeTabWeightsScreen from '../screens/settings/HomeTabWeightsScreen';
import ExportDataScreen from '../screens/ExportDataScreen';
import ArweaveProfileScreen from '../arweave/screens/ArweaveProfileScreen';
import ArweaveWalletDetailScreen from '../arweave/screens/ArweaveWalletDetailScreen';
import ArweaveAddInfoSelectScreen from '../arweave/screens/wallet/AddInfoSelectScreen';
import ArweaveCreateDisclaimerScreen from '../arweave/screens/wallet/CreateDisclaimerScreen';
import ArweaveImportDisclaimerScreen from '../arweave/screens/wallet/ImportDisclaimerScreen';
import ArweaveJwkBackupScreen from '../arweave/screens/wallet/JwkBackupScreen';
import ArweaveJwkInputScreen from '../arweave/screens/wallet/JwkInputScreen';
import ArweaveJwkVerifyScreen from '../arweave/screens/wallet/JwkVerifyScreen';
import ArweavePasswordSetupScreen from '../arweave/screens/wallet/ArweavePasswordSetupScreen';
import ArweaveUploadScreen from '../arweave/upload/screens/UploadScreen';
import ArweaveDataDetailScreen from '../arweave/list/screens/ArweaveDataDetailScreen';
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
  const { centered, gutterWidth } = useListColumnLayout();

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
        ...(centered
          ? {
              headerLeftContainerStyle: { marginStart: gutterWidth },
              headerRightContainerStyle: { marginEnd: gutterWidth },
            }
          : {}),
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
  const { centered, gutterWidth } = useListColumnLayout();

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
          ...(centered
            ? {
                headerLeftContainerStyle: { marginStart: gutterWidth },
                headerRightContainerStyle: { marginEnd: gutterWidth },
              }
            : {}),
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
          name="AddAttachment"
          component={AddAttachmentScreen}
          options={{
            title: t('send.addAttachment'),
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
          name="LocalDrafts"
          component={LocalDraftsScreen}
          options={{
            title: t('nav.localDrafts'),
          }}
        />
        <Stack.Screen
          name="ContentFilters"
          component={ContentFiltersScreen}
          options={{
            title: t('nav.contentFilters'),
          }}
        />
        <Stack.Screen
          name="ContentFilterForm"
          component={ContentFilterFormScreen}
          options={({ route }) => ({
            title:
              route.params?.mode === 'add'
                ? t('form.addContentFilter')
                : t('form.editContentFilter'),
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="ContentFilterDetail"
          component={ContentFilterDetailScreen}
          options={{
            title: t('nav.contentFilterDetail'),
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
        <Stack.Screen
          name="SettingsChoice"
          component={SettingsChoiceScreen}
          options={({ route }) => ({
            title:
              route.params.type === 'language'
                ? t('nav.language')
                : route.params.type === 'appearance'
                  ? t('nav.appearance')
                  : t('nav.fontSize'),
          })}
        />
        <Stack.Screen
          name="ApiKeySettings"
          component={ApiKeySettingsScreen}
          options={{ title: t('nav.apiKeySettings') }}
        />
        <Stack.Screen
          name="DataSourceWeights"
          component={DataSourceWeightsScreen}
          options={{ title: t('nav.dataSourceWeights') }}
        />
        <Stack.Screen
          name="HomeTabWeights"
          component={HomeTabWeightsScreen}
          options={{ title: t('nav.homeTabWeights') }}
        />
        <Stack.Screen
          name="CacheManagement"
          component={CacheManagementScreen}
          options={{
            title: t('profile.cacheManagement'),
          }}
        />
        <Stack.Screen
          name="ExportData"
          component={ExportDataScreen}
          options={{
            title: t('nav.exportData'),
          }}
        />
        <Stack.Screen
          name="FollowListSelection"
          component={FollowListSelectionScreen}
          options={{
            title: t('send.recipientFollowingTitle'),
          }}
        />
        <Stack.Screen
          name="ArweaveProfile"
          component={ArweaveProfileScreen}
          options={{ title: t('nav.arweaveProfile') }}
        />
        <Stack.Screen
          name="ArweaveWalletDetail"
          component={ArweaveWalletDetailScreen}
          options={{ title: t('nav.arweaveWalletDetail') }}
        />
        <Stack.Screen
          name="ArweaveAddInfoSelect"
          component={ArweaveAddInfoSelectScreen}
          options={{ title: t('nav.arweaveAddInfoSelect') }}
        />
        <Stack.Screen
          name="ArweaveCreateDisclaimer"
          component={ArweaveCreateDisclaimerScreen}
          options={{ title: t('nav.arweaveCreateDisclaimer') }}
        />
        <Stack.Screen
          name="ArweaveImportDisclaimer"
          component={ArweaveImportDisclaimerScreen}
          options={{ title: t('nav.arweaveImportDisclaimer') }}
        />
        <Stack.Screen
          name="ArweaveJwkBackup"
          component={ArweaveJwkBackupScreen}
          options={{ title: t('nav.arweaveJwkBackup') }}
        />
        <Stack.Screen
          name="ArweaveJwkInput"
          component={ArweaveJwkInputScreen}
          options={{ title: t('nav.arweaveJwkInput') }}
        />
        <Stack.Screen
          name="ArweaveJwkVerify"
          component={ArweaveJwkVerifyScreen}
          options={{ title: t('nav.arweaveJwkVerify') }}
        />
        <Stack.Screen
          name="ArweavePasswordSetup"
          component={ArweavePasswordSetupScreen}
          options={{ title: t('nav.arweavePasswordSetup') }}
        />
        <Stack.Screen
          name="ArweaveUpload"
          component={ArweaveUploadScreen}
          options={{ title: t('nav.arweaveUpload') }}
        />
        <Stack.Screen
          name="ArweaveDataDetail"
          component={ArweaveDataDetailScreen}
          options={{ title: t('nav.arweaveDataDetail') }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
