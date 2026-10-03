import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { encryptWallet, loadEncryptedKeystore, saveEncryptedKeystore } from './walletManager';
import { lockSession } from './session';
import { clearPaymentPasswordContext } from './paymentPasswordContext';
import {
  decryptJwk,
  encryptJwk,
  loadEncryptedArKeystore,
  saveEncryptedArKeystore,
} from '../arweave/wallet/keystore';
import { serializeJwk } from '../arweave/wallet/jwk';
import { verifyEthPassword } from '../arweave/wallet/ethPasswordVerify';

export {
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
} from '../arweave/wallet/ethPasswordVerify';

/** New password equals the old one. */
export const PASSWORD_UNCHANGED_ERROR = 'PASSWORD_UNCHANGED';
/** Nothing was changed: decrypt / re-encrypt / write failed and storage is back to the old state. */
export const PASSWORD_CHANGE_FAILED_ERROR = 'PASSWORD_CHANGE_FAILED';
/** A write failed and the restore also failed; the journal is kept and healed on next launch. */
export const PASSWORD_CHANGE_INCOMPLETE_ERROR = 'PASSWORD_CHANGE_INCOMPLETE';

export class PasswordChangeError extends Error {
  constructor(
    name: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = name;
  }
}

const JOURNAL_STORAGE_KEY = 'oam_payment_password_change_journal';
const USE_ASYNC_STORAGE = Platform.OS === 'web';

/** `ar` is null when the user has no AR wallet; `eth` is always present for a full wallet. */
interface KeystoreSnapshot {
  eth: string;
  ar: string | null;
}

/**
 * Write-ahead record of a password change. The journal is one storage write
 * (atomic), holds both the old and the new ciphertexts, and is removed only after
 * every keystore is switched. A leftover journal means the process died
 * mid-change; `recoverPendingPasswordChange` then restores a consistent state.
 */
interface PasswordChangeJournal {
  v: 1;
  old: KeystoreSnapshot;
  next: KeystoreSnapshot;
}

async function readJournal(): Promise<PasswordChangeJournal | null> {
  const raw = USE_ASYNC_STORAGE
    ? await AsyncStorage.getItem(JOURNAL_STORAGE_KEY)
    : await SecureStore.getItemAsync(JOURNAL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PasswordChangeJournal;
    if (parsed?.v !== 1 || typeof parsed.old?.eth !== 'string' || typeof parsed.next?.eth !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeJournal(journal: PasswordChangeJournal): Promise<void> {
  const raw = JSON.stringify(journal);
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.setItem(JOURNAL_STORAGE_KEY, raw);
  } else {
    await SecureStore.setItemAsync(JOURNAL_STORAGE_KEY, raw);
  }
}

async function clearJournal(): Promise<void> {
  if (USE_ASYNC_STORAGE) {
    await AsyncStorage.removeItem(JOURNAL_STORAGE_KEY);
  } else {
    await SecureStore.deleteItemAsync(JOURNAL_STORAGE_KEY);
  }
}

async function readCurrent(): Promise<{ eth: string | null; ar: string | null }> {
  const [eth, ar] = await Promise.all([loadEncryptedKeystore(), loadEncryptedArKeystore()]);
  return { eth, ar };
}

/** Sets every keystore in `target` that does not already hold that value, then reads back to verify. */
async function applySnapshot(target: KeystoreSnapshot): Promise<void> {
  const current = await readCurrent();
  if (current.eth !== target.eth) {
    await saveEncryptedKeystore(target.eth);
  }
  if (target.ar !== null && current.ar !== target.ar) {
    await saveEncryptedArKeystore(target.ar);
  }

  const after = await readCurrent();
  if (after.eth !== target.eth || (target.ar !== null && after.ar !== target.ar)) {
    throw new Error('Keystore read-back mismatch');
  }
}

/**
 * Heals an interrupted password change. State-based, so it is safe to call at any
 * time and any number of times:
 *   - every keystore still old, or every keystore already new → just drop the journal
 *   - a mix of old and new (torn write) → roll back to the old snapshot
 *   - a keystore matching neither (changed by something else) → leave storage alone
 */
export async function recoverPendingPasswordChange(): Promise<'none' | 'cleared' | 'rolled_back'> {
  const journal = await readJournal();
  if (!journal) return 'none';

  const current = await readCurrent();
  const entries: Array<[string | null, string | null, string | null]> = [
    [current.eth, journal.old.eth, journal.next.eth],
  ];
  if (journal.old.ar !== null && journal.next.ar !== null) {
    entries.push([current.ar, journal.old.ar, journal.next.ar]);
  }

  const states = entries.map(([cur, oldValue, nextValue]) =>
    cur === oldValue ? 'old' : cur === nextValue ? 'new' : 'unknown',
  );

  if (states.includes('unknown')) {
    console.warn('Password change journal does not match stored keystores; leaving them untouched.');
    await clearJournal();
    return 'cleared';
  }
  if (states.every((s) => s === states[0])) {
    await clearJournal();
    return 'cleared';
  }

  await applySnapshot(journal.old);
  await clearJournal();
  return 'rolled_back';
}

/** Decrypts with the old password, re-encrypts with the new one and proves the result opens — all in memory. */
async function prepareNextSnapshot(
  old: KeystoreSnapshot,
  oldPassword: string,
  newPassword: string,
): Promise<KeystoreSnapshot> {
  const ethWallet = await ethers.Wallet.fromEncryptedJson(old.eth, oldPassword);
  const nextEth = await encryptWallet(
    { address: ethWallet.address, privateKey: ethWallet.privateKey },
    newPassword,
  );
  const ethCheck = await ethers.Wallet.fromEncryptedJson(nextEth, newPassword);
  if (ethCheck.privateKey !== ethWallet.privateKey || ethCheck.address !== ethWallet.address) {
    throw new Error('ETH keystore verification failed');
  }

  let nextAr: string | null = null;
  if (old.ar !== null) {
    const jwk = await decryptJwk(old.ar, oldPassword);
    nextAr = await encryptJwk(jwk, newPassword);
    const jwkCheck = await decryptJwk(nextAr, newPassword);
    if (serializeJwk(jwkCheck) !== serializeJwk(jwk)) {
      throw new Error('AR keystore verification failed');
    }
  }

  return { eth: nextEth, ar: nextAr };
}

let inFlight = false;

/**
 * Changes the payment password shared by the ETH and AR keystores, atomically:
 * either both keystores end up under the new password or both stay under the old one.
 *
 * 1. Verify the old password (shares the wrong-password lockout with the other gates).
 * 2. Decrypt every keystore and re-encrypt it in memory; prove each new ciphertext opens.
 *    Any failure here aborts with nothing written.
 * 3. Persist a journal holding old + new ciphertexts, then switch the keystores and
 *    read them back. Any failure restores the old ciphertexts; if even that fails the
 *    journal stays and `recoverPendingPasswordChange` finishes the restore on next launch.
 */
export async function changePaymentPassword(oldPassword: string, newPassword: string): Promise<void> {
  if (oldPassword === newPassword) {
    throw new PasswordChangeError(PASSWORD_UNCHANGED_ERROR, 'New password must differ from the old password');
  }
  if (inFlight) {
    throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'A password change is already running');
  }
  inFlight = true;
  try {
    try {
      await recoverPendingPasswordChange();
    } catch (cause) {
      throw new PasswordChangeError(
        PASSWORD_CHANGE_INCOMPLETE_ERROR,
        'A previous password change could not be restored',
        cause,
      );
    }

    // Throws NO_KEYSTORE / INVALID_PASSWORD / PASSWORD_LOCKED.
    await verifyEthPassword(oldPassword);

    let old: KeystoreSnapshot;
    let next: KeystoreSnapshot;
    try {
      const current = await readCurrent();
      if (!current.eth) {
        throw new Error('ETH keystore missing');
      }
      old = { eth: current.eth, ar: current.ar };
      next = await prepareNextSnapshot(old, oldPassword, newPassword);
      await writeJournal({ v: 1, old, next });
    } catch (cause) {
      // Nothing has been modified yet (a journal write that failed is a no-op).
      await clearJournal().catch(() => {});
      throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'Password change failed before writing', cause);
    }

    try {
      await applySnapshot(next);
    } catch (cause) {
      try {
        await applySnapshot(old);
        await clearJournal();
      } catch (rollbackCause) {
        throw new PasswordChangeError(
          PASSWORD_CHANGE_INCOMPLETE_ERROR,
          'Password change failed and the old keystores could not be fully restored',
          rollbackCause,
        );
      }
      throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'Password change failed and was rolled back', cause);
    }

    // Committed. A leftover journal is harmless: recovery sees only-new state and drops it.
    await clearJournal().catch((e) => console.warn('Failed to clear password change journal:', e));

    lockSession();
    clearPaymentPasswordContext();
  } finally {
    inFlight = false;
  }
}
