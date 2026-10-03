import { ethers } from 'ethers';
import { encryptWallet } from './walletManager';
import { lockSession } from './session';
import { clearPaymentPasswordContext } from './paymentPasswordContext';
import {
  commitKeystoreChange,
  PASSWORD_CHANGE_FAILED_ERROR,
  PASSWORD_CHANGE_INCOMPLETE_ERROR,
  PasswordChangeError,
  readCurrentSnapshot,
  recoverPendingKeystoreChange,
  type KeystoreSnapshot,
} from './keystoreTransaction';
import { decryptJwk, encryptJwk } from '../arweave/wallet/keystore';
import { serializeJwk } from '../arweave/wallet/jwk';
import { verifyEthPassword } from '../arweave/wallet/ethPasswordVerify';

export {
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
} from '../arweave/wallet/ethPasswordVerify';
export { PASSWORD_CHANGE_FAILED_ERROR, PASSWORD_CHANGE_INCOMPLETE_ERROR, PasswordChangeError };

/** New password equals the old one. */
export const PASSWORD_UNCHANGED_ERROR = 'PASSWORD_UNCHANGED';

/** Decrypts with the old password, re-encrypts with the new one and proves the result opens — all in memory. */
async function prepareNextSnapshot(
  old: KeystoreSnapshot & { eth: string },
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
 * 1. Verify the old password (shares the wrong-password lockout with every other gate).
 * 2. Decrypt every keystore and re-encrypt it in memory; prove each new ciphertext opens.
 *    Any failure here aborts with nothing written.
 * 3. Commit through the keystore journal (see keystoreTransaction).
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
      await recoverPendingKeystoreChange();
    } catch (cause) {
      throw new PasswordChangeError(
        PASSWORD_CHANGE_INCOMPLETE_ERROR,
        'A previous keystore change could not be restored',
        cause,
      );
    }

    // Throws NO_KEYSTORE / INVALID_PASSWORD / PASSWORD_LOCKED.
    await verifyEthPassword(oldPassword);

    let old: KeystoreSnapshot;
    let next: KeystoreSnapshot;
    try {
      old = await readCurrentSnapshot();
      if (!old.eth) {
        throw new Error('ETH keystore missing');
      }
      next = await prepareNextSnapshot({ eth: old.eth, ar: old.ar }, oldPassword, newPassword);
    } catch (cause) {
      throw new PasswordChangeError(PASSWORD_CHANGE_FAILED_ERROR, 'Password change failed before writing', cause);
    }

    await commitKeystoreChange(old, next);

    lockSession();
    clearPaymentPasswordContext();
  } finally {
    inFlight = false;
  }
}
