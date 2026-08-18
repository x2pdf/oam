import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

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
import { RootStackParamList, MainTabParamList } from '../types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/* ------------------------------------------------------------------ */
/*  底部 Tab 导航                                                      */
/* ------------------------------------------------------------------ */

function MainTabNavigator() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
          height: 48 + insets.top,
        },
        headerTitleAlign: 'center',
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 16,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline + '20',
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

  return (
    <NavigationContainer>
      <Stack.Navigator>
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
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '600' },
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="AddInfoSelect"
          component={AddInfoSelectScreen}
          options={{
            title: t('nav.addInfoSelect'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '600' },
          }}
        />
        <Stack.Screen
          name="AddAddressForm"
          component={AddAddressFormScreen}
          options={({ route }) => ({
            title: route.params?.mode === 'add' ? t('nav.addAddressForm') : t('nav.editAddressForm'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '600' },
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="WalletDisclaimer"
          component={WalletDisclaimerScreen}
          options={{
            title: t('nav.walletDisclaimer'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="RecoverDisclaimer"
          component={RecoverDisclaimerScreen}
          options={{
            title: t('nav.recoverDisclaimer'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="MnemonicBackup"
          component={MnemonicBackupScreen}
          options={{
            title: t('nav.mnemonicBackup'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="MnemonicInput"
          component={MnemonicInputScreen}
          options={{
            title: t('nav.mnemonicInput'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="WalletVerify"
          component={WalletVerifyScreen}
          options={{
            title: t('nav.walletVerify'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="WalletSetup"
          component={WalletSetupScreen}
          options={{
            title: t('nav.walletSetup'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="PrivateKeyDisclaimer"
          component={PrivateKeyDisclaimerScreen}
          options={{
            title: t('nav.privateKeyDisclaimer'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="PrivateKeyInput"
          component={PrivateKeyInputScreen}
          options={{
            title: t('nav.privateKeyInput'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="PrivateKeyVerify"
          component={PrivateKeyVerifyScreen}
          options={{
            title: t('nav.privateKeyVerify'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="PrivateKeySetup"
          component={PrivateKeySetupScreen}
          options={{
            title: t('nav.privateKeySetup'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="SendData"
          component={SendDataScreen}
          options={{
            title: t('nav.sendData'),
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#FFFFFF',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
