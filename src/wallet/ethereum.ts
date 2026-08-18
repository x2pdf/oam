import { Wallet, Mnemonic } from 'ethers';

/**
 * Ethereum 钱包管理工具
 */
export const EthereumWalletManager = {
  /**
   * 创建一个新的随机钱包
   * @returns 返回包含助记词、私钥和地址的对象
   */
  createWallet: () => {
    const wallet = Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
    };
  },

  /**
   * 通过助记词恢复钱包
   * @param phrase 助记词字符串
   * @returns 返回恢复的钱包对象信息
   */
  importFromMnemonic: (phrase: string) => {
    try {
      const mnemonic = Mnemonic.fromPhrase(phrase);
      const wallet = Wallet.fromPhrase(mnemonic.phrase);
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase,
      };
    } catch (error) {
      throw new Error('无效的助记词');
    }
  },

  /**
   * 通过私钥恢复钱包
   * @param privateKey 私钥字符串
   * @returns 返回恢复的钱包对象信息
   */
  importFromPrivateKey: (privateKey: string) => {
    try {
      const wallet = new Wallet(privateKey);
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    } catch (error) {
      throw new Error('无效的私钥');
    }
  },
};
