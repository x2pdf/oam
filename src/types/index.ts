/**
 * Application-wide type definitions
 */

import type { ArweaveListItem } from '../arweave/list/types';
import { ContentItem } from '../mypayload';
import { DEFAULT_CHAIN } from '../constants';
import { AttachmentFileType, AttachmentSource } from '../utils/attachment';

/** 链标识 slug，便于后续扩展多链 */
export type ChainSlug = 'ethereum' | 'arweave';

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

/** 用户内容过滤器匹配类型 */
export type ContentFilterMatchType = 'text' | 'regex' | 'address' | 'image';

/** 用户内容过滤器规则 */
export interface ContentFilterRule {
  id: string;
  description: string;
  matchType: ContentFilterMatchType;
  matchExpression: string;
}

// 表单可选：text / regex / address
// TODO: image — 等本地 AI 对图片暴力、成人内容识别更准确且更快后再开放
const CONTENT_FILTER_MATCH_TYPES: ContentFilterMatchType[] = [
  'text',
  'regex',
  'address',
  'image',
];

export function isContentFilterMatchType(value: unknown): value is ContentFilterMatchType {
  return CONTENT_FILTER_MATCH_TYPES.includes(value as ContentFilterMatchType);
}

/** 去掉换行并 trim，用于匹配表达式入库与比对 */
export function normalizeMatchExpression(value: string): string {
  return value.replace(/[\r\n]+/g, '').trim();
}

/** 从持久化数据补全过滤器字段；无效 matchType 时返回 null */
export function normalizeContentFilterRule(value: unknown): ContentFilterRule | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  const matchExpression =
    typeof obj.matchExpression === 'string'
      ? normalizeMatchExpression(obj.matchExpression)
      : '';
  if (!id || !description || !matchExpression) return null;
  if (!isContentFilterMatchType(obj.matchType)) return null;
  return {
    id,
    description,
    matchType: obj.matchType,
    matchExpression,
  };
}

/** 导入/去重用键 */
export function contentFilterDedupeKey(
  matchType: ContentFilterMatchType,
  matchExpression: string,
): string {
  return `${matchType}\0${normalizeMatchExpression(matchExpression)}`;
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

/** 发送页本地草稿中的外链 / Arweave 附件 */
export interface SendDraftAttachment {
  source: AttachmentSource;
  fileType: AttachmentFileType;
  input: string;
  href: string;
  mime: string;
  label: string;
  arId?: string;
}

/** 发送页本地草稿 */
export interface SendDraft {
  id: string;
  text: string;
  images: SendDraftImage[];
  attachments?: SendDraftAttachment[];
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
    prefillAddress?: string;
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
  SendData: {
    recipientAddress?: string;
    draftId?: string;
    pendingAttachment?: SendDraftAttachment;
    pendingAttachmentNonce?: number;
  } | undefined;
  AddAttachment: undefined;
  InputDataDetail: { item: InputDataItem };
  SubscriptionDetail: { subscription: Subscription };
  AddressDataList: { address: string; title?: string; peerAddress?: string };
  LocalFavorites: undefined;
  LocalDrafts: undefined;
  ContentFilters: undefined;
  ContentFilterForm: {
    mode: 'add' | 'edit';
    filter?: ContentFilterRule;
  };
  ContentFilterDetail: { filter: ContentFilterRule };
  AppInfo: undefined;
  SettingsChoice: { type: 'language' | 'appearance' | 'fontSize' };
  ApiKeySettings: undefined;
  DataSourceWeights: undefined;
  HomeTabWeights: undefined;
  CacheManagement: undefined;
  FollowListSelection: undefined;
  ExportData: undefined;
  ArweaveProfile: undefined;
  ArweaveWalletDetail: undefined;
  ArweaveAddInfoSelect: undefined;
  ArweaveCreateDisclaimer: undefined;
  ArweaveImportDisclaimer: undefined;
  ArweaveJwkBackup: undefined;
  ArweaveJwkInput: undefined;
  ArweaveJwkVerify: { jwk: string; address: string };
  ArweavePasswordSetup: { jwk: string; address: string };
  ArweaveUpload: undefined;
  ArweaveDataDetail: { item: ArweaveListItem };
};

export type MainTabParamList = {
  Home: undefined;
  Subscriptions: undefined;
  Profile: undefined;
};
