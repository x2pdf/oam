import { IDataSource, FetchMode, DataSourceResult } from './types';

export abstract class BaseDataSource implements IDataSource {
  abstract name: string;
  abstract weight: number;

  abstract fetchMessages(address: string, mode: FetchMode, params?: any): Promise<DataSourceResult>;

  /**
   * 将十六进制字符串转换为 UTF-8 文本 (支持中文/Emoji)
   */
  protected decodeHex(hex: string): string {
    if (!hex || hex === '0x') return '';

    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (cleanHex.length % 2 !== 0) return '';

    try {
      const bytes = new Uint8Array(cleanHex.length / 2);
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      console.error(`[${this.name}] Hex decode error:`, e);
      return '';
    }
  }

  /**
   * 格式化时间戳为本地时间字符串 (YYYY-MM-DD HH:mm:ss)
   */
  protected formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }

  protected shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
