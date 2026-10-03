import { ethers } from 'ethers';
import {
  createNoKeystoreError,
  getPasswordLockRemainingMs,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
  runGuardedPasswordAttempt,
} from '../../wallet/passwordGuard';
import { loadEthEncryptedKeystore } from './ethKeystore';

export { INVALID_PASSWORD_ERROR, NO_KEYSTORE_ERROR, PASSWORD_LOCKED_ERROR };

export function getEthPasswordLockRemainingMs(): number {
  return getPasswordLockRemainingMs();
}

/**
 * Verifies the payment password by decrypting the local ETH keystore.
 * Shares one lockout counter with every other password entry point.
 * Does not unlock the global ETH session.
 */
export async function verifyEthPassword(password: string): Promise<void> {
  await runGuardedPasswordAttempt(async () => {
    const keystoreJson = await loadEthEncryptedKeystore();
    if (!keystoreJson) {
      throw createNoKeystoreError();
    }
    await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
  });
}
