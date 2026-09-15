import { encryptWallet } from './walletManager';
import { lockSession } from './session';
import { clearPaymentPasswordContext } from './paymentPasswordContext';
import {
  isPeerReencryptError,
  savePreparedArKeystore,
  savePreparedEthKeystore,
  syncPeerAfterEthReplace,
} from './reencryptPeerKeystore';

interface WalletKeyMaterial {
  address: string;
  privateKey: string;
}

/**
 * Encrypt and persist a new ETH wallet. When replacing an existing full wallet,
 * re-encrypts the AR peer keystore with the new payment password first.
 */
export async function finalizeEthWalletSetup(
  wallet: WalletKeyMaterial,
  newPassword: string,
  oldPassword: string | null,
): Promise<void> {
  let reencryptedAr: string | null = null;
  if (oldPassword) {
    reencryptedAr = await syncPeerAfterEthReplace(oldPassword, newPassword);
  }

  const ethKeystoreJson = await encryptWallet(wallet, newPassword);

  if (reencryptedAr) {
    await savePreparedArKeystore(reencryptedAr);
  }
  await savePreparedEthKeystore(ethKeystoreJson);

  lockSession();
  clearPaymentPasswordContext();
}

export { isPeerReencryptError };
