/**
 * Application-wide type definitions
 */

import { ContentItem } from '../mypayload';
import { DEFAULT_CHAIN } from '../constants';

/** 链标识 slug，便于后续扩展多链 */
export type ChainSlug = 'ethereum';

/** 订阅/地址记录 */
export interface Subscription {
  id: string;
  address: string;
  description: string;
  chain: ChainSlug;
  walletType?: 'read' | 'write';
  pinWeight?: number;
}

/** 补全旧数据缺失的 chain 字段 */
export function normalizeSubscription(
  item: Omit<Subscription, 'chain'> & Partial<Pick<Subscription, 'chain'>>,
): Subscription {
  return {
    ...item,
    chain: item.chain ?? DEFAULT_CHAIN,
    pinWeight: item.pinWeight ?? 0,
  };
}

/** 列表条目的展示类型（过滤器链写入） */
export type ContentKind = 'OAMP' | 'OAMP_ENCRYPTED' | 'UTF-8' | 'RAW';

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
  timestamp: number;
  rawInput?: string;
  /** Transaction account nonce; needed to rebuild AES-GCM AAD. */
  txNonce?: number;
  /** Chain id of the tx; needed to rebuild AES-GCM AAD. */
  chainId?: number;
  contentKind?: ContentKind;
  oampItems?: ContentItem[];
  textContent?: string;
}

/** 本地收藏条目（完整数据快照 + 收藏时间） */
export interface FavoriteItem {
  item: InputDataItem;
  favoritedAt: number;
}

/** 发送页本地草稿中的图片（不保存临时 uri，用 base64 还原） */
export interface SendDraftImage {
  base64: string;
  name?: string;
  type: 'image/jpeg' | 'image/png' | 'image/gif';
}

/** 发送页本地草稿 */
export interface SendDraft {
  id: string;
  text: string;
  images: SendDraftImage[];
  recipientAddress: string;
  encryptEnabled: boolean;
  updatedAt: number;
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
  SendData: { recipientAddress?: string; draftId?: string } | undefined;
  InputDataDetail: { item: InputDataItem };
  SubscriptionDetail: { subscription: Subscription };
  AddressDataList: { address: string; title?: string; peerAddress?: string };
  LocalFavorites: undefined;
  LocalDrafts: undefined;
  AppInfo: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Subscriptions: undefined;
  Profile: undefined;
};
