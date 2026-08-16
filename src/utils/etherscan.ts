import { InputDataItem } from '../types';

/**
 * 将十六进制字符串转换为 UTF-8 文本 (支持中文/Emoji)
 */
export function decodeHex(hex: string): string {
  if (!hex || hex === '0x') return '';

  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleanHex.length % 2 !== 0) return '';

  try {
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }
    // 使用 TextDecoder 处理 UTF-8 编码，支持多字节字符
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.error('Hex decode error:', e);
    return '';
  }
}

/**
 * 格式化时间戳为本地时间字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/**
 * 获取 Blockscout IDM 消息 (通过 REST API v2)
 * @param address 查询的地址
 * @param mode 'self' - 自发自收; 'square' - 接收地址为该地址; 'sent' - 发送地址为该地址; 'inbox' - 接收者是自己(不含自发)
 * @param params 分页参数
 */
export async function fetchIDMMessages(
  address: string,
  mode: 'self' | 'square' | 'sent' | 'inbox' = 'self',
  params: any = null
): Promise<{ items: InputDataItem[]; next_page_params: any }> {
  const cleanAddress = address.trim().toLowerCase();
  // 使用 Blockscout v2 API
  let baseUrl = `https://eth.blockscout.com/api/v2/addresses/${cleanAddress}/transactions`;

  if (params) {
    const query = new URLSearchParams(params).toString();
    baseUrl += `?${query}`;
  }

  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      throw new Error(`Blockscout API error: ${response.statusText}`);
    }
    const data = await response.json();

    const txs = data.items || [];
    const next_page_params = data.next_page_params || null;

    const items = txs
      .filter((tx: any) => {
        // 1. input data 不为空 (Blockscout v2 使用 raw_input)
        const hasInput = tx.raw_input && tx.raw_input !== '0x';
        if (!hasInput) return false;

        const from = tx.from?.hash?.toLowerCase();
        const to = tx.to?.hash?.toLowerCase();

        if (mode === 'self') {
          // 必须是发送给自己的交易 (from == to == own_address)
          return from === cleanAddress && to === cleanAddress;
        } else if (mode === 'square') {
          // 广场模式：接收地址是目标地址 (如黑洞)，发送地址不限
          return to === cleanAddress;
        } else if (mode === 'sent') {
          // 已发送模式：发送地址是目标地址 (自己)，接收地址不限
          return from === cleanAddress;
        } else {
          // 收件箱模式 (inbox)：接收地址是自己，发送地址不限
          return to === cleanAddress;
        }
      })
      .map((tx: any) => {
        const decoded = decodeHex(tx.raw_input);

        // 转换 Blockscout 的 ISO 时间戳为可读格式
        const lastActive = tx.timestamp
          ? formatTimestamp(Math.floor(new Date(tx.timestamp).getTime() / 1000))
          : 'Unknown';

        let displayAddr = 'Unknown';
        let displayName = 'Message';

        if (mode === 'self') {
          displayAddr = cleanAddress;
          displayName = 'Self Message';
        } else if (mode === 'square' || mode === 'inbox') {
          displayAddr = tx.from?.hash || 'Unknown';
          displayName = `From: ${displayAddr.slice(0, 6)}...`;
        } else {
          displayAddr = tx.to?.hash || 'Unknown';
          displayName = `To: ${displayAddr.slice(0, 6)}...`;
        }

        return {
          id: tx.hash.slice(0, 10),
          name: displayName,
          address: displayAddr,
          description: decoded,
          balance: `${(parseInt(tx.value || '0') / 1e18).toFixed(4)} ETH`,
          txCount: 1,
          lastActive: lastActive,
        };
      })
      .filter((item: any) => item.description.trim().length > 0);

    return { items, next_page_params };
  } catch (error) {
    console.error('fetchIDMMessages error:', error);
    throw error;
  }
}
