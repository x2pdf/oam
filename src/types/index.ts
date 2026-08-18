/**
 * Application-wide type definitions
 */

import { ContentItem } from '../mypayload';

/** 订阅/地址记录 */
export interface Subscription {
  id: string;
  address: string;
  description: string;
  walletType?: 'read' | 'write';
}

/** 主页卡片数据 */
export interface InputDataItem {
  id: string;
  name: string;
  address: string;
  from?: string;
  to?: string;
  description: string;
  balance: string;
  txCount: number;
  lastActive: string;
  rawInput?: string;
  oampItems?: ContentItem[];
}

/** 导航路由参数 */
export type RootStackParamList = {
  MainTabs: undefined;
  SubscriptionForm: {
    mode: 'add' | 'edit';
    source: 'subscriptions' | 'profile';
    subscription?: Subscription;
  };
  AddInfoSelect: undefined;
  AddAddressForm: {
    mode: 'add' | 'edit';
    source: 'profile';
    subscription?: Subscription;
  };
  WalletDisclaimer: undefined;
  RecoverDisclaimer: undefined;
  MnemonicBackup: undefined;
  MnemonicInput: undefined;
  WalletVerify: { mnemonic: string };
  WalletSetup: { mnemonic: string };
  PrivateKeyDisclaimer: undefined;
  PrivateKeyInput: undefined;
  PrivateKeyVerify: { privateKey: string };
  PrivateKeySetup: { privateKey: string };
  SendData: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Subscriptions: undefined;
  Profile: undefined;
};
