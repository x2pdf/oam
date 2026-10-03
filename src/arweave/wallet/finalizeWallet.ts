import { Subscription } from '../../types';
import { lockSession } from '../../wallet/session';
import {
  clearPaymentPasswordContext,
  getPendingNewPassword,
  getVerifiedOldPassword,
} from '../../wallet/paymentPasswordContext';
import { commitKeystoreChange, readCurrentSnapshot } from '../../wallet/keystoreTransaction';
import {
  isPeerReencryptError,
  syncPeerAfterArReplace,
} from '../../wallet/reencryptPeerKeystore';
import { deserializeJwk } from './jwk';
import { encryptJwk } from './keystore';

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

  const old = await readCurrentSnapshot();

  if (isReplacement) {
    const newPassword = getPendingNewPassword();
    if (!newPassword) {
      const err = new Error(NO_VERIFIED_PASSWORD_ERROR);
      err.name = NO_VERIFIED_PASSWORD_ERROR;
      throw err;
    }

    // The payment password is shared: the ETH keystore moves to the new one too.
    const reencryptedEth = await syncPeerAfterArReplace(oldPassword, newPassword);
    const arKeystoreJson = await encryptJwk(jwk, newPassword);
    await commitKeystoreChange(old, { eth: reencryptedEth ?? old.eth, ar: arKeystoreJson });
  } else {
    const arKeystoreJson = await encryptJwk(jwk, oldPassword);
    await commitKeystoreChange(old, { eth: old.eth, ar: arKeystoreJson });
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
