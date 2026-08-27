import { ethers } from 'ethers';
import { loadEncryptedKeystore } from './walletManager';

export const NO_KEYSTORE_ERROR = 'NO_KEYSTORE';
export const INVALID_PASSWORD_ERROR = 'INVALID_PASSWORD';
export const PASSWORD_LOCKED_ERROR = 'PASSWORD_LOCKED';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60_000;

let failedAttempts = 0;
let lockUntil = 0;

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

export function getPasswordLockRemainingMs(): number {
  return Math.max(0, lockUntil - Date.now());
}

function throwPasswordLocked(): never {
  const err = new Error(PASSWORD_LOCKED_ERROR);
  err.name = PASSWORD_LOCKED_ERROR;
  throw err;
}

function assertNotPasswordLocked(): void {
  if (getPasswordLockRemainingMs() > 0) {
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
  assertNotPasswordLocked();
  try {
    const wallet = await decryptKeystore(password);
    failedAttempts = 0;
    lockUntil = 0;
    unlockedWallet = wallet;
    notify();
    return wallet;
  } catch (e: any) {
    if (e?.name === INVALID_PASSWORD_ERROR) {
      recordPasswordFailure();
      if (getPasswordLockRemainingMs() > 0) {
        throwPasswordLocked();
      }
    }
    throw e;
  }
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
