import { Subscription } from '../../types';
import { loadEthEncryptedKeystore } from './ethKeystore';

export type EthGateBlockReason = 'no_profile' | 'read_only' | 'no_keystore';

export function checkEthWalletGate(profile: Subscription | null): EthGateBlockReason | null {
  if (!profile) {
    return 'no_profile';
  }
  if (profile.walletType !== 'write') {
    return 'read_only';
  }
  return null;
}

export async function checkEthKeystoreExists(): Promise<boolean> {
  const keystore = await loadEthEncryptedKeystore();
  return keystore !== null && keystore.length > 0;
}
