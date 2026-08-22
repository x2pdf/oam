import { encryptKeystoreJson, HDNodeWallet, Mnemonic, Wallet, randomBytes } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export { EthereumWalletManager } from './ethereum';

export const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/** Web/Tauri 环境下 SecureStore 不可用，回退到 AsyncStorage */
const USE_ASYNC_STORAGE = Platform.OS === 'web';

/** Mobile-friendly scrypt cost. Default ethers N=2^17 is too slow on Android emulators. */
const KEYSTORE_SCRYPT_N = 8192;

/**
 * Generates a 12-word mnemonic phrase.
 */
export function generate12WordMnemonic(): string {
  // 16 bytes of entropy = 128 bits = 12 words in BIP39
  const entropy = randomBytes(16);
  const mnemonic = Mnemonic.fromEntropy(entropy);
  return mnemonic.phrase;
}

/**
 * Derives a wallet from a mnemonic phrase.
 */
export function deriveWalletFromMnemonic(mnemonic: string): HDNodeWallet {
  return Wallet.fromPhrase(mnemonic.trim());
}

/**
 * Validates if a string is a valid BIP39 mnemonic.
 */
export function validateMnemonic(phrase: string): boolean {
  return Mnemonic.isValidMnemonic(phrase.trim());
}

/**
 * Encrypts a wallet into Ethereum keystore JSON using a lowered scrypt N.
 */
export async function encryptWallet(
  wallet: { address: string; privateKey: string },
  password: string,
): Promise<string> {
  return await encryptKeystoreJson(
    { address: wallet.address, privateKey: wallet.privateKey },
    password,
    { scrypt: { N: KEYSTORE_SCRYPT_N } },
  );
}

/**
 * Persists keystore ciphertext only. Never store a plaintext private key.
 * Web/Tauri: SecureStore stub 为空，回退到 AsyncStorage。
 */
export async function saveEncryptedKeystore(keystoreJson: string): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.setItem(PRIVATE_KEY_STORAGE_KEY, keystoreJson);
  } else {
    await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, keystoreJson);
  }
}

/**
 * Reads the stored keystore ciphertext.
 * Web/Tauri: 从 AsyncStorage 读取。
 */
export async function loadEncryptedKeystore(): Promise<string | null> {
  if (USE_ASYNC_STORAGE) {
    return AsyncStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
}

/**
 * Removes the stored keystore ciphertext.
 */
export async function removeEncryptedKeystore(): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  } else {
    await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);
  }
}
