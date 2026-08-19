import { encryptKeystoreJson, HDNodeWallet, Mnemonic, Wallet, randomBytes } from 'ethers';
import * as SecureStore from 'expo-secure-store';

export { EthereumWalletManager } from './ethereum';

export const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/** Mobile-friendly scrypt cost. Default ethers N=2^17 is too slow on Android emulators. */
const KEYSTORE_SCRYPT_N = 8192;

/**
 * Generates a 24-word mnemonic phrase.
 */
export function generate24WordMnemonic(): string {
  // 32 bytes of entropy = 256 bits = 24 words in BIP39
  const entropy = randomBytes(32);
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
 */
export async function saveEncryptedKeystore(keystoreJson: string): Promise<void> {
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, keystoreJson);
}
