import { lockSession } from './session';
import { clearPaymentPasswordContext } from './paymentPasswordContext';
import { wipeKeystores } from './keystoreTransaction';

/**
 * Forgets the full wallet on this device: drops the unlocked session and any password
 * held in memory, then deletes the ETH and AR keystores (journaled, all or nothing).
 * The AR wallet shares the payment password and requires the ETH wallet, so it goes too.
 * Throws if the keystores could not be removed; callers must then keep the profile.
 */
export async function wipeWalletKeys(): Promise<void> {
  lockSession();
  clearPaymentPasswordContext();
  await wipeKeystores();
}
