import { decryptKeystore } from './session';
import { encryptWallet, saveEncryptedKeystore } from './walletManager';
import {
  decryptJwk,
  encryptJwk,
  loadEncryptedArKeystore,
  saveEncryptedArKeystore,
} from '../arweave/wallet/keystore';
import { loadEthEncryptedKeystore } from '../arweave/wallet/ethKeystore';

export const PEER_REENCRYPT_FAILED_ERROR = 'PEER_REENCRYPT_FAILED';

export class PeerReencryptError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = PEER_REENCRYPT_FAILED_ERROR;
  }
}

export function isPeerReencryptError(error: unknown): boolean {
  return error instanceof PeerReencryptError;
}

/**
 * Re-encrypt AR keystore from oldPassword to newPassword.
 * Returns encrypted payload ready to save, or null if no AR keystore exists.
 */
export async function reencryptArKeystore(
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  const keystoreJson = await loadEncryptedArKeystore();
  if (!keystoreJson) {
    return null;
  }

  try {
    const jwk = await decryptJwk(keystoreJson, oldPassword);
    return await encryptJwk(jwk, newPassword);
  } catch (cause) {
    throw new PeerReencryptError(
      'AR keystore could not be re-encrypted with the new payment password.',
      cause,
    );
  }
}

/**
 * Re-encrypt ETH keystore from oldPassword to newPassword.
 * Returns encrypted payload ready to save, or null if no ETH keystore exists.
 */
export async function reencryptEthKeystore(
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  const keystoreJson = await loadEthEncryptedKeystore();
  if (!keystoreJson) {
    return null;
  }

  try {
    const wallet = await decryptKeystore(oldPassword);
    return await encryptWallet(
      { address: wallet.address, privateKey: wallet.privateKey },
      newPassword,
    );
  } catch (cause) {
    throw new PeerReencryptError(
      'ETH keystore could not be re-encrypted with the new payment password.',
      cause,
    );
  }
}

/**
 * After ETH wallet replacement: re-encrypt AR keystore with the new password.
 * Prepares ciphertext in memory; caller saves after primary keystore is ready.
 */
export async function syncPeerAfterEthReplace(
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  return reencryptArKeystore(oldPassword, newPassword);
}

/**
 * After AR wallet replacement: re-encrypt ETH keystore with the new password.
 */
export async function syncPeerAfterArReplace(
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  return reencryptEthKeystore(oldPassword, newPassword);
}

export async function savePreparedArKeystore(encrypted: string): Promise<void> {
  await saveEncryptedArKeystore(encrypted);
}

export async function savePreparedEthKeystore(encrypted: string): Promise<void> {
  await saveEncryptedKeystore(encrypted);
}
