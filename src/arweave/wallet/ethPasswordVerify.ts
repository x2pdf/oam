import { ethers } from 'ethers';
import { loadEthEncryptedKeystore } from './ethKeystore';

export const NO_KEYSTORE_ERROR = 'NO_KEYSTORE';
export const INVALID_PASSWORD_ERROR = 'INVALID_PASSWORD';
export const PASSWORD_LOCKED_ERROR = 'PASSWORD_LOCKED';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60_000;

let failedAttempts = 0;
let lockUntil = 0;

export function getEthPasswordLockRemainingMs(): number {
  return Math.max(0, lockUntil - Date.now());
}

function throwPasswordLocked(): never {
  const err = new Error(PASSWORD_LOCKED_ERROR);
  err.name = PASSWORD_LOCKED_ERROR;
  throw err;
}

function assertNotPasswordLocked(): void {
  if (getEthPasswordLockRemainingMs() > 0) {
    throwPasswordLocked();
  }
  lockUntil = 0;
}

function recordPasswordFailure(): void {
  failedAttempts += 1;
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    failedAttempts = 0;
    lockUntil = Date.now() + LOCK_DURATION_MS;
  }
}

/**
 * Verifies ETH payment password by decrypting the local keystore.
 * Does not unlock the global ETH session.
 */
export async function verifyEthPassword(password: string): Promise<void> {
  assertNotPasswordLocked();

  const keystoreJson = await loadEthEncryptedKeystore();
  if (!keystoreJson) {
    const err = new Error(NO_KEYSTORE_ERROR);
    err.name = NO_KEYSTORE_ERROR;
    throw err;
  }

  try {
    await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
    failedAttempts = 0;
    lockUntil = 0;
  } catch (e: any) {
    if (e?.name === NO_KEYSTORE_ERROR) {
      throw e;
    }
    recordPasswordFailure();
    if (getEthPasswordLockRemainingMs() > 0) {
      throwPasswordLocked();
    }
    const err = new Error(INVALID_PASSWORD_ERROR);
    err.name = INVALID_PASSWORD_ERROR;
    throw err;
  }
}
