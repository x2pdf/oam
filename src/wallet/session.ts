import { ethers } from 'ethers';
import { loadEncryptedKeystore } from './walletManager';
import {
  createNoKeystoreError,
  getPasswordLockRemainingMs,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
  runGuardedPasswordAttempt,
} from './passwordGuard';

export { getPasswordLockRemainingMs, INVALID_PASSWORD_ERROR, NO_KEYSTORE_ERROR, PASSWORD_LOCKED_ERROR };

type SessionListener = () => void;

let unlockedWallet: ethers.Wallet | null = null;
const listeners = new Set<SessionListener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Decrypts the locally stored keystore with the payment password.
 * Does not persist the password or write the session.
 */
export async function decryptKeystore(password: string): Promise<ethers.Wallet> {
  const keystoreJson = await loadEncryptedKeystore();
  if (!keystoreJson) {
    throw createNoKeystoreError();
  }

  try {
    const decrypted = await ethers.Wallet.fromEncryptedJson(keystoreJson, password);
    // Normalize HDNodeWallet | Wallet to Wallet so callers share one type.
    return new ethers.Wallet(decrypted.privateKey);
  } catch {
    const err = new Error(INVALID_PASSWORD_ERROR);
    err.name = INVALID_PASSWORD_ERROR;
    throw err;
  }
}

export async function unlockSession(password: string): Promise<ethers.Wallet> {
  const wallet = await runGuardedPasswordAttempt(() => decryptKeystore(password));
  unlockedWallet = wallet;
  notify();
  return wallet;
}

export function lockSession(): void {
  if (!unlockedWallet) return;
  unlockedWallet = null;
  notify();
}

export function getUnlockedWallet(): ethers.Wallet | null {
  return unlockedWallet;
}

export function isSessionUnlocked(): boolean {
  return unlockedWallet !== null;
}
