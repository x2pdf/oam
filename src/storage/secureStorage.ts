import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Key/value storage for secrets (keystore ciphertext, the password-change journal).
 *
 * Native: iOS Keychain / Android Keystore-wrapped preferences via expo-secure-store.
 * Entries are `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS, so they stay out of backups
 * and are not migrated to another device (Android ignores the option).
 *
 * Web / Tauri desktop: there is no SecureStore, so this falls back to AsyncStorage
 * (WebView localStorage). That is NOT system-level protection; the stored
 * ciphertext is only as strong as the payment password.
 */
const USE_ASYNC_STORAGE = Platform.OS === 'web';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function secureGet(key: string): Promise<string | null> {
  if (USE_ASYNC_STORAGE) {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key, OPTIONS);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  // Overwriting an existing Keychain item only replaces its value and keeps the
  // accessibility it was created with, so delete first to apply the current one.
  await SecureStore.deleteItemAsync(key, OPTIONS);
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  }
}

export async function secureDelete(key: string): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key, OPTIONS);
}
