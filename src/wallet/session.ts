import { ethers } from 'ethers';
import { loadEncryptedKeystore } from './walletManager';

export const NO_KEYSTORE_ERROR = 'NO_KEYSTORE';
export const INVALID_PASSWORD_ERROR = 'INVALID_PASSWORD';

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
    const err = new Error(NO_KEYSTORE_ERROR);
    err.name = NO_KEYSTORE_ERROR;
    throw err;
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
  const wallet = await decryptKeystore(password);
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
