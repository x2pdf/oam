import { secureDelete, secureGet, secureSet } from '../storage/secureStorage';
import {
  loadEncryptedKeystore,
  removeEncryptedKeystore,
  saveEncryptedKeystore,
} from './walletManager';
import {
  loadEncryptedArKeystore,
  removeEncryptedArKeystore,
  saveEncryptedArKeystore,
} from '../arweave/wallet/keystore';

/** Nothing was changed: re-encrypt / write failed and storage is back to the old state. */
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

/** The full keystore state; `null` means "no such keystore". */
export interface KeystoreSnapshot {
  eth: string | null;
  ar: string | null;
}

/**
 * Write-ahead record of a keystore change (password change, wallet replacement, ...).
 * The journal is one storage write, holds both the old and the new ciphertexts, and is
 * removed only after every keystore is switched. A leftover journal means the process
 * died mid-change; `recoverPendingKeystoreChange` then restores a consistent state.
 */
interface KeystoreJournal {
  v: 1;
  old: KeystoreSnapshot;
  next: KeystoreSnapshot;
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

async function readJournal(): Promise<KeystoreJournal | null> {
  const raw = await secureGet(JOURNAL_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KeystoreJournal;
    if (
      parsed?.v !== 1
      || !isNullableString(parsed.old?.eth)
      || !isNullableString(parsed.old?.ar)
      || !isNullableString(parsed.next?.eth)
      || !isNullableString(parsed.next?.ar)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeJournal(journal: KeystoreJournal): Promise<void> {
  await secureSet(JOURNAL_STORAGE_KEY, JSON.stringify(journal));
}

/** The journal holds old-password ciphertext, so make sure it really goes away. */
async function clearJournal(): Promise<void> {
  try {
    await secureDelete(JOURNAL_STORAGE_KEY);
  } catch (e) {
    // Blank it instead: readJournal treats an empty value as "no journal".
    await secureSet(JOURNAL_STORAGE_KEY, '');
    console.warn('Deleting the keystore journal failed; blanked it instead:', e);
  }
}

export async function readCurrentSnapshot(): Promise<KeystoreSnapshot> {
  const [eth, ar] = await Promise.all([loadEncryptedKeystore(), loadEncryptedArKeystore()]);
  return { eth, ar };
}

async function applyOne(
  current: string | null,
  target: string | null,
  save: (value: string) => Promise<void>,
  remove: () => Promise<void>,
): Promise<void> {
  if (target === null) {
    if (current !== null) await remove();
  } else if (current !== target) {
    await save(target);
  }
}

/** Makes storage equal `target` (null removes), then reads back to verify. */
async function applySnapshot(target: KeystoreSnapshot): Promise<void> {
  const current = await readCurrentSnapshot();
  await applyOne(current.eth, target.eth, saveEncryptedKeystore, removeEncryptedKeystore);
  await applyOne(current.ar, target.ar, saveEncryptedArKeystore, removeEncryptedArKeystore);

  const after = await readCurrentSnapshot();
  if (after.eth !== target.eth || after.ar !== target.ar) {
    throw new Error('Keystore read-back mismatch');
  }
}

type FieldState = 'same' | 'old' | 'new' | 'missing' | 'unknown';

function classify(current: string | null, oldValue: string | null, nextValue: string | null): FieldState {
  if (current === oldValue && current === nextValue) return 'same';
  if (current === oldValue) return 'old';
  if (current === nextValue) return 'new';
  if (current === null) return 'missing';
  return 'unknown';
}

/**
 * Heals an interrupted keystore change. State-based, so it is safe to call at any
 * time and any number of times:
 *   - every changed keystore still old, or every one already new → just drop the journal
 *   - a mix of old and new (torn write), or one deleted mid-rewrite → restore the old snapshot
 *   - a keystore matching neither (changed by something else) → leave storage alone
 */
export async function recoverPendingKeystoreChange(): Promise<'none' | 'cleared' | 'rolled_back'> {
  const journal = await readJournal();
  if (!journal) return 'none';

  const current = await readCurrentSnapshot();
  const states = [
    classify(current.eth, journal.old.eth, journal.next.eth),
    classify(current.ar, journal.old.ar, journal.next.ar),
  ].filter((state) => state !== 'same');

  if (states.includes('unknown')) {
    console.warn('Keystore journal does not match stored keystores; leaving them untouched.');
    await clearJournal();
    return 'cleared';
  }
  if (!states.includes('missing') && states.every((state) => state === states[0])) {
    await clearJournal();
    return 'cleared';
  }

  await applySnapshot(journal.old);
  await clearJournal();
  return 'rolled_back';
}

/**
 * Switches storage from `old` to `next` atomically: either every keystore ends up as in
 * `next` or all stay as in `old`.
 *
 * Persists a journal holding old + next, switches the keystores and reads them back.
 * Any failure restores `old`; if even that fails the journal stays and
 * `recoverPendingKeystoreChange` finishes the restore on next launch.
 *
 * Throws PasswordChangeError (FAILED: nothing changed, INCOMPLETE: needs recovery).
 */
export async function commitKeystoreChange(
  old: KeystoreSnapshot,
  next: KeystoreSnapshot,
): Promise<void> {
  try {
    await writeJournal({ v: 1, old, next });
  } catch (cause) {
    // Nothing has been modified yet (a journal write that failed is a no-op).
    await clearJournal().catch(() => {});
    throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'Keystore change failed before writing', cause);
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
        'Keystore change failed and the old keystores could not be fully restored',
        rollbackCause,
      );
    }
    throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'Keystore change failed and was rolled back', cause);
  }

  // Committed. A leftover journal is harmless: recovery sees only-new state and drops it.
  await clearJournal().catch((e) => console.warn('Failed to clear keystore journal:', e));
}

/**
 * Removes both keystores (wallet deleted or replaced by a read-only address).
 * Runs through the journal, so a crash cannot leave one of the two behind.
 */
export async function wipeKeystores(): Promise<void> {
  const old = await readCurrentSnapshot();
  if (old.eth === null && old.ar === null) return;
  await commitKeystoreChange(old, { eth: null, ar: null });
}
