import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/** Web/Tauri 环境下 SecureStore 不可用，回退到 AsyncStorage */
const USE_ASYNC_STORAGE = Platform.OS === 'web';

/**
 * Reads the stored ETH keystore ciphertext.
 * Copied for AR wallet gate — does not import from src/wallet.
 */
export async function loadEthEncryptedKeystore(): Promise<string | null> {
  if (USE_ASYNC_STORAGE) {
    return AsyncStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
}
