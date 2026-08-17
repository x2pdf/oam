import { InputDataItem } from '../types';

export type FetchMode = 'square' | 'self' | 'sent' | 'inbox';

export interface DataSourceResult {
  items: InputDataItem[];
  next_page_params: any;
}

export interface IDataSource {
  readonly name: string;
  readonly weight: number;
  fetchMessages(address: string, mode: FetchMode, params?: any): Promise<DataSourceResult>;
}
