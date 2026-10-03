import { encryptKeystoreJson, HDNodeWallet, Mnemonic, Wallet, randomBytes } from 'ethers';
import { secureDelete, secureGet, secureSet } from '../storage/secureStorage';

export { EthereumWalletManager } from './ethereum';

export const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/**
 * scrypt cost for new keystores (ethers default, 128 MiB). Native builds run it
 * through react-native-quick-crypto (see crypto-polyfill.js); web/desktop use the
 * pure-JS fallback. Decryption reads N from the keystore JSON.
 */
export const KEYSTORE_SCRYPT_N = 131072;

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
 * Web/Tauri 下 SecureStore 不可用，secureStorage 会回退到 AsyncStorage（无系统级保护）。
 */
export async function saveEncryptedKeystore(keystoreJson: string): Promise<void> {
  await secureSet(PRIVATE_KEY_STORAGE_KEY, keystoreJson);
}

/** Reads the stored keystore ciphertext. */
export async function loadEncryptedKeystore(): Promise<string | null> {
  return secureGet(PRIVATE_KEY_STORAGE_KEY);
}

/** Removes the stored keystore ciphertext. */
export async function removeEncryptedKeystore(): Promise<void> {
  await secureDelete(PRIVATE_KEY_STORAGE_KEY);
}
