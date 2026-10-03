import type { InputDataItem } from '../types';
import { createRefItem, normalizeTxRef, type ContentItem } from '../mypayload';

export type InteractionType = 'like' | 'comment' | 'repost';

export interface BuildInteractionContentOptions {
  type: InteractionType;
  item: InputDataItem;
  commentText?: string;
}

/**
 * 上链内容（OAM HTML profile）：
 *
 *   <pre>👍👍👍👍</pre><span data-ref="0x…" data-action="like"></span>
 *   <pre>📝📝📝📝\n评论内容</pre><span data-ref="0x…" data-action="comment"></span>
 *   <pre>🔁🔁🔁🔁</pre><span data-ref="0x…" data-action="repost"></span>
 *
 * 不再携带原文：被引用内容由客户端按 data-ref 查链还原。点赞金额即交易本身的 value。
 */
export function buildInteractionContent(options: BuildInteractionContentOptions): ContentItem[] {
  const { type, item, commentText } = options;
  const emojis = interactionEmoji(type).repeat(4);
  const text = type === 'comment' ? `${emojis}\n${commentText ?? ''}` : emojis;

  const items: ContentItem[] = [{ type: 'text', content: text }];
  const ref = normalizeTxRef(item.id);
  if (ref) items.push(createRefItem(ref, type));
  return items;
}

/** 该条数据能否被点赞/评论/转发（需要合法的交易哈希作为引用）。 */
export function canInteractWith(item: InputDataItem | null | undefined): boolean {
  return !!item && normalizeTxRef(item.id) != null;
}

/** 弹窗里“上链文本预览”的可读形式。 */
export function interactionPreviewText(items: ContentItem[]): string {
  const parts: string[] = [];
  for (const entry of items) {
    if (entry.type === 'text') parts.push(entry.content);
    else if (entry.type === 'ref') parts.push(`TxID: ${entry.ref}`);
  }
  return parts.join('\n\n');
}

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
