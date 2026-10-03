import { encryptWallet } from './walletManager';
import { lockSession } from './session';
import { clearPaymentPasswordContext } from './paymentPasswordContext';
import { commitKeystoreChange, readCurrentSnapshot } from './keystoreTransaction';
import { isPeerReencryptError, syncPeerAfterEthReplace } from './reencryptPeerKeystore';

interface WalletKeyMaterial {
  address: string;
  privateKey: string;
}

/**
 * Encrypt and persist a new ETH wallet. When replacing an existing full wallet,
 * re-encrypts the AR peer keystore with the new payment password first. Both
 * keystores are switched in one journaled commit, so a crash cannot leave them
 * under different passwords.
 */
export async function finalizeEthWalletSetup(
  wallet: WalletKeyMaterial,
  newPassword: string,
  oldPassword: string | null,
): Promise<void> {
  const old = await readCurrentSnapshot();

  let nextAr = old.ar;
  if (oldPassword) {
    nextAr = (await syncPeerAfterEthReplace(oldPassword, newPassword)) ?? old.ar;
  }

  const nextEth = await encryptWallet(wallet, newPassword);

  await commitKeystoreChange(old, { eth: nextEth, ar: nextAr });

  lockSession();
  clearPaymentPasswordContext();
}

export { isPeerReencryptError };
