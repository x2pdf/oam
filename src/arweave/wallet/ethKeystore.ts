import { secureGet } from '../../storage/secureStorage';

const PRIVATE_KEY_STORAGE_KEY = 'user_wallet_private_key';

/**
 * Reads the stored ETH keystore ciphertext.
 * Copied for AR wallet gate — does not import from src/wallet.
 */
export async function loadEthEncryptedKeystore(): Promise<string | null> {
  return secureGet(PRIVATE_KEY_STORAGE_KEY);
}
