import { InputDataItem } from '../types';
import { ChainTransaction } from './ChainTransaction';

export type FetchMode = 'square' | 'self' | 'sent' | 'inbox' | 'all';

export interface DataSourceResult {
  items: InputDataItem[];
  rawTransactions?: ChainTransaction[];
  next_page_params: any;
  errors?: string[];
  /** 本次实际扫描的区块数（供 UI 展示回溯范围） */
  blocksScanned?: number;
}

/** 发出交易索引：只需 hash，完整签名通过 RPC 获取。 */
export interface OutgoingTx {
  hash: string;
}

export interface OutgoingTxResult {
  items: OutgoingTx[];
  next_page_params?: any;
}

export interface IDataSource {
  readonly name: string;
  readonly weight: number;
  /** 是否需要 API Key 才能正常工作 */
  readonly requiresApiKey: boolean;
  /** 若数据源支持 API Key，返回当前配置的 Key（空字符串视为未设置） */
  readonly apiKey?: string;
  fetchMessages(address: string, mode: FetchMode, params?: any): Promise<DataSourceResult>;
  fetchOutgoingTransactions(address: string, params?: any): Promise<OutgoingTxResult>;
  /** 当前链最新区块高度，供关注页按区块窗口分页。 */
  fetchLatestBlockNumber(): Promise<number>;
}
