import { ArweaveContentItem, ArweaveListItem } from '../types';

/** 汇总内容区可复制纯文本（用于一键复制全文）。 */
export function getArweaveContentPlainText(items: ArweaveContentItem[]): string {
  const parts: string[] = [];
  for (const entry of items) {
    if (entry.type === 'link') {
      const label = entry.label?.trim();
      if (label) parts.push(label);
    } else if (entry.type === 'image') {
      const alt = entry.alt?.trim();
      if (alt) parts.push(alt);
    }
  }
  return parts.join('\n').trim();
}

export function getArweaveListItemContentPlainText(item: ArweaveListItem): string {
  return getArweaveContentPlainText(item.contentItems);
}
