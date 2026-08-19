import { InputDataItem } from '../types';

export type FetchMode = 'square' | 'self' | 'sent' | 'inbox';

export interface DataSourceResult {
  items: InputDataItem[];
  next_page_params: any;
  errors?: string[];
}

/** 最小公约数：只要求发出交易 hash。各源多余字段不要映射进来。 */
export interface OutgoingTx {
  hash: string;
  from?: string;
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
