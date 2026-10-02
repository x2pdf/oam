import { toUtf8Bytes } from 'ethers';
import type { InputDataItem } from '../types';
import type { ContentItem } from '../mypayload';

export type InteractionType = 'like' | 'comment' | 'repost';

export interface BuildInteractionContentOptions {
  type: InteractionType;
  item: InputDataItem;
  commentText?: string;
  multiplier?: number;
  ethValue?: string;
  maxTotalBytes?: number;
}

const DEFAULT_MAX_BYTES = 100_000;

function truncateToBytes(text: string, maxBytes: number): string {
  const bytes = toUtf8Bytes(text);
  if (bytes.length <= maxBytes) return text;

  let low = 0;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = text.slice(0, mid);
    if (toUtf8Bytes(slice).length <= maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return text.slice(0, best);
}

function contentItemToText(item: ContentItem): string | null {
  if (item.type === 'text') {
    return item.content;
  }
  if (item.type === 'image') {
    // 不包含 base64 图片数据，但保留可选的 alt 描述作为纯文本提示。
    if (item.alt) {
      return `[图片: ${item.alt}]`;
    }
    return null;
  }
  if (item.type === 'link') {
    const parts: string[] = [];
    if (item.label) parts.push(item.label);
    parts.push(item.href);
    if (item.arId) parts.push(`(arId: ${item.arId})`);
    return parts.join(' ');
  }
  return null;
}

export function extractReferenceText(item: InputDataItem, maxBytes = DEFAULT_MAX_BYTES): string {
  const parts: string[] = [];

  const hasOampItems =
    (item.contentKind === 'OAMP' || item.contentKind === 'OAMP_ENCRYPTED') &&
    Array.isArray(item.oampItems) &&
    item.oampItems.length > 0;

  if (hasOampItems) {
    for (const oi of item.oampItems!) {
      const text = contentItemToText(oi);
      if (text != null) parts.push(text);
    }
  } else if (item.contentKind === 'UTF-8' && item.textContent) {
    parts.push(item.textContent);
  } else if (item.rawInput) {
    parts.push(item.rawInput);
  }

  return truncateToBytes(parts.join('\n').trim(), maxBytes);
}

/**
 * 上链文本格式：
 *
 * 点赞:
 *   👍👍👍👍
 *   <空行>
 *   <原始文本>
 *   <空行>
 *   TxID: xxx
 *   1x, 0.0002322243 ETH
 *
 * 评论:
 *   📝📝📝📝
 *   <评论文本>
 *   <空行>
 *   <原始文本>
 *   <空行>
 *   TxID: xxx
 *
 * 转发:
 *   🔁🔁🔁🔁
 *   <空行>
 *   <原始文本>
 *   <空行>
 *   TxID: xxx
 */
export function buildInteractionContent(options: BuildInteractionContentOptions): string {
  const { type, item, commentText, multiplier, ethValue, maxTotalBytes = DEFAULT_MAX_BYTES } = options;
  const txId = item.id || '';

  let head: string;
  if (type === 'like') {
    head = '👍👍👍👍\n\n';
  } else if (type === 'comment') {
    head = `📝📝📝📝\n${commentText || ''}\n\n`;
  } else {
    head = '🔁🔁🔁🔁\n\n';
  }

  const footLines = ['', `TxID: ${txId}`];
  if (type === 'like' && ethValue) {
    footLines.push(`${multiplier ?? 1}x, ${ethValue} ETH`);
  }
  const foot = `\n${footLines.join('\n')}`;

  const reserved = toUtf8Bytes(head).length + toUtf8Bytes(foot).length;
  const remainingBytes = Math.max(0, maxTotalBytes - reserved);
  const referenceText = extractReferenceText(item, remainingBytes);

  return `${head}${referenceText}${foot}`;
}

/** 将 emoji 数量补齐到 4 个，用于 UI 提示或格式化（当前方案固定 4 个）。 */
export function interactionEmoji(type: InteractionType): string {
  if (type === 'like') return '👍';
  if (type === 'comment') return '📝';
  return '🔁';
}

export function interactionTitleKey(type: InteractionType): string {
  if (type === 'like') return 'interaction.like';
  if (type === 'comment') return 'interaction.comment';
  return 'interaction.repost';
}
