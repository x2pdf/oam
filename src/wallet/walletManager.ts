import { ethers } from 'ethers';
// Note: User needs to ensure expo-secure-store is installed: npx expo install expo-secure-store
import * as SecureStore from 'expo-secure-store';

export const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/**
 * Generates a 24-word mnemonic phrase.
 */
export function generate24WordMnemonic(): string {
  // 32 bytes of entropy = 256 bits = 24 words in BIP39
  const entropy = ethers.randomBytes(32);
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
  return mnemonic.phrase;
}

/**
 * Derives a wallet from a mnemonic phrase.
 */
export function deriveWalletFromMnemonic(mnemonic: string): ethers.HDNodeWallet {
  return ethers.Wallet.fromPhrase(mnemonic.trim());
}

/**
 * Validates if a string is a valid BIP39 mnemonic.
 */
export function validateMnemonic(phrase: string): boolean {
  return ethers.Mnemonic.isValidMnemonic(phrase.trim());
}

/**
 * Saves the private key securely.
 */
export async function saveWalletSecured(privateKey: string, address: string, name: string) {
  // Save private key in SecureStore
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKey);
}

/**
 * Retrieves the private key securely.
 */
export async function getPrivateKeySecured(): Promise<string | null> {
  return await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
}

/**
 * Encrypts data using a simple password-based scheme (e.g. ethers keystore)
 * and returns the JSON string.
 */
export async function encryptWallet(wallet: ethers.Wallet, password: string): Promise<string> {
  return await wallet.encrypt(password);
}
