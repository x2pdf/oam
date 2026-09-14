import { Subscription } from '../../types';
import { deserializeJwk } from './jwk';
import { encryptJwk, saveEncryptedArKeystore } from './keystore';
import { clearVerifiedEthPassword, getVerifiedEthPassword } from './verifiedEthPassword';

export const NO_VERIFIED_PASSWORD_ERROR = 'NO_VERIFIED_PASSWORD';

export async function finalizeArWallet(
  jwkJson: string,
  address: string,
  saveArProfile: (item: Subscription) => Promise<void>,
): Promise<void> {
  const password = getVerifiedEthPassword();
  if (!password) {
    const err = new Error(NO_VERIFIED_PASSWORD_ERROR);
    err.name = NO_VERIFIED_PASSWORD_ERROR;
    throw err;
  }

  const jwk = deserializeJwk(jwkJson);
  const keystoreJson = await encryptJwk(jwk, password);
  await saveEncryptedArKeystore(keystoreJson);

  await saveArProfile({
    id: Date.now().toString(),
    address,
    description: '',
    chain: 'arweave',
    walletType: 'write',
  });

  clearVerifiedEthPassword();
}
