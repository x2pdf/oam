import { InputDataItem } from '../types';

export type FetchMode = 'square' | 'self' | 'sent' | 'inbox';

export interface DataSourceResult {
  items: InputDataItem[];
  next_page_params: any;
  errors?: string[];
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
  fetchMessages(address: string, mode: FetchMode, params?: any): Promise<DataSourceResult>;
  fetchOutgoingTransactions(address: string, params?: any): Promise<OutgoingTxResult>;
}
