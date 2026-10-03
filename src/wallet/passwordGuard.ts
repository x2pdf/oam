import AsyncStorage from '@react-native-async-storage/async-storage';

export const NO_KEYSTORE_ERROR = 'NO_KEYSTORE';
export const INVALID_PASSWORD_ERROR = 'INVALID_PASSWORD';
export const PASSWORD_LOCKED_ERROR = 'PASSWORD_LOCKED';

const GUARD_STORAGE_KEY = 'oam_password_guard_v1';

/** Wrong passwords allowed per round; the round then locks, and each next round locks twice as long. */
const ATTEMPTS_PER_ROUND = 5;
const BASE_LOCK_MS = 60_000;
const MAX_LOCK_MS = 60 * 60_000;

/**
 * One counter for every place that can open a keystore with the payment password
 * (send, unlock, export, AR upload, password change, wallet gates). Failures are
 * persisted, so restarting the app does not hand out fresh attempts, and the lock
 * grows with consecutive failures. A correct password resets everything.
 *
 * This only slows down guessing through the UI. It cannot stop an offline attack
 * on a stolen keystore; that is what the KDF cost and password length are for.
 */
let consecutiveFailures = 0;
let lockUntil = 0;

function persist(): void {
  // Best effort: a storage problem must never change the outcome of a password attempt.
  try {
    AsyncStorage.setItem(GUARD_STORAGE_KEY, JSON.stringify({ consecutiveFailures, lockUntil })).catch(() => {});
  } catch {
    // ignore
  }
}

/** Loads the persisted counter. Call once at startup, before any password prompt can open. */
export async function hydratePasswordGuard(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GUARD_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { consecutiveFailures?: unknown; lockUntil?: unknown };
    if (typeof parsed.consecutiveFailures === 'number' && parsed.consecutiveFailures > consecutiveFailures) {
      consecutiveFailures = parsed.consecutiveFailures;
    }
    if (typeof parsed.lockUntil === 'number' && parsed.lockUntil > lockUntil) {
      lockUntil = Math.min(parsed.lockUntil, Date.now() + MAX_LOCK_MS);
    }
  } catch {
    // Unreadable guard state must not block the wallet.
  }
}

export function getPasswordLockRemainingMs(): number {
  return Math.max(0, lockUntil - Date.now());
}

function namedError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures % ATTEMPTS_PER_ROUND === 0) {
    const round = consecutiveFailures / ATTEMPTS_PER_ROUND;
    lockUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** (round - 1), MAX_LOCK_MS);
  }
  persist();
}

function recordSuccess(): void {
  if (consecutiveFailures === 0 && lockUntil === 0) return;
  consecutiveFailures = 0;
  lockUntil = 0;
  persist();
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs one password attempt under the shared lockout.
 *
 * Attempts are serialized, so parallel calls cannot get several guesses past a
 * single lock check. `attempt` must throw a NO_KEYSTORE error when there is
 * nothing to unlock (not counted as a failure); any other throw means a wrong
 * password.
 */
export function runGuardedPasswordAttempt<T>(attempt: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (getPasswordLockRemainingMs() > 0) {
      throw namedError(PASSWORD_LOCKED_ERROR);
    }
    try {
      const result = await attempt();
      recordSuccess();
      return result;
    } catch (e: any) {
      if (e?.name === NO_KEYSTORE_ERROR) {
        throw e;
      }
      recordFailure();
      throw namedError(getPasswordLockRemainingMs() > 0 ? PASSWORD_LOCKED_ERROR : INVALID_PASSWORD_ERROR);
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

export function createNoKeystoreError(): Error {
  return namedError(NO_KEYSTORE_ERROR);
}
