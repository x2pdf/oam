import { Subscription } from '../../types';
import { lockSession } from '../../wallet/session';
import {
  clearPaymentPasswordContext,
  getPendingNewPassword,
  getVerifiedOldPassword,
} from '../../wallet/paymentPasswordContext';
import {
  isPeerReencryptError,
  savePreparedEthKeystore,
  syncPeerAfterArReplace,
} from '../../wallet/reencryptPeerKeystore';
import { deserializeJwk } from './jwk';
import { encryptJwk, saveEncryptedArKeystore } from './keystore';

export const NO_VERIFIED_PASSWORD_ERROR = 'NO_VERIFIED_PASSWORD';
export { isPeerReencryptError };

interface FinalizeArWalletOptions {
  isReplacement?: boolean;
}

export async function finalizeArWallet(
  jwkJson: string,
  address: string,
  saveArProfile: (item: Subscription) => Promise<void>,
  options?: FinalizeArWalletOptions,
): Promise<void> {
  const oldPassword = getVerifiedOldPassword();
  const isReplacement = options?.isReplacement ?? false;

  if (!oldPassword) {
    const err = new Error(NO_VERIFIED_PASSWORD_ERROR);
    err.name = NO_VERIFIED_PASSWORD_ERROR;
    throw err;
  }

  const jwk = deserializeJwk(jwkJson);

  if (isReplacement) {
    const newPassword = getPendingNewPassword();
    if (!newPassword) {
      const err = new Error(NO_VERIFIED_PASSWORD_ERROR);
      err.name = NO_VERIFIED_PASSWORD_ERROR;
      throw err;
    }

    const reencryptedEth = await syncPeerAfterArReplace(oldPassword, newPassword);
    const arKeystoreJson = await encryptJwk(jwk, newPassword);

    if (reencryptedEth) {
      await savePreparedEthKeystore(reencryptedEth);
    }
    await saveEncryptedArKeystore(arKeystoreJson);
  } else {
    const arKeystoreJson = await encryptJwk(jwk, oldPassword);
    await saveEncryptedArKeystore(arKeystoreJson);
  }

  await saveArProfile({
    id: Date.now().toString(),
    address,
    description: '',
    chain: 'arweave',
    walletType: 'write',
  });

  lockSession();
  clearPaymentPasswordContext();
}
