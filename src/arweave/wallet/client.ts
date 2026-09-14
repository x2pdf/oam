// React Native 无 Node crypto，必须使用 web 构建（WebCrypto）
import Arweave from 'arweave/web';
import type { ArweaveJwk } from './jwk';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

export async function generateArweaveWallet(): Promise<{ jwk: ArweaveJwk; address: string }> {
  const jwk = await arweave.wallets.generate() as ArweaveJwk;
  const address = await arweave.wallets.jwkToAddress(jwk);
  return { jwk, address };
}

export async function jwkToAddress(jwk: ArweaveJwk): Promise<string> {
  return arweave.wallets.jwkToAddress(jwk);
}
