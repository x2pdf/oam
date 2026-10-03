import {
  createNoKeystoreError,
  runGuardedPasswordAttempt,
} from '../../wallet/passwordGuard';
import type { ArweaveJwk } from './jwk';
import { decryptJwk, loadEncryptedArKeystore } from './keystore';

/**
 * Decrypts the AR keystore with the payment password under the shared lockout.
 * Throws NO_KEYSTORE, INVALID_PASSWORD or PASSWORD_LOCKED (see passwordGuard).
 */
export async function unlockArJwk(password: string): Promise<ArweaveJwk> {
  return runGuardedPasswordAttempt(async () => {
    const keystoreJson = await loadEncryptedArKeystore();
    if (!keystoreJson) {
      throw createNoKeystoreError();
    }
    return decryptJwk(keystoreJson, password);
  });
}
