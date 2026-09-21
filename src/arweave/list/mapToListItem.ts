import { ArweaveGraphQLTransaction, ArweaveListItem } from './types';
import { arweaveHref, isImageMime, mimeToBadgeLabel, shouldDownload } from './utils/mime';

function parseTags(tags: { name: string; value: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tag of tags) {
    if (!tag.name) continue;
    map[tag.name] = tag.value ?? '';
  }
  return map;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** GraphQL block.timestamp 一般为秒；若已是毫秒则不再乘 1000。未确认返回 0。 */
export function toArweaveTimestampMs(blockTimestamp: unknown): number {
  const n = toFiniteNumber(blockTimestamp);
  if (n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

export function toArweaveBlockHeight(blockHeight: unknown): number {
  const n = toFiniteNumber(blockHeight);
  return n > 0 ? Math.floor(n) : 0;
}

/** 与 GraphQL `sort: HEIGHT_DESC` 对齐：双方都有高度时按高度；否则按时间。 */
export function compareArweaveListItems(a: ArweaveListItem, b: ArweaveListItem): number {
  const ha = a.blockHeight > 0 ? a.blockHeight : 0;
  const hb = b.blockHeight > 0 ? b.blockHeight : 0;
  if (ha > 0 && hb > 0 && ha !== hb) return hb - ha;

  const ta = a.timestamp > 0 ? a.timestamp : 0;
  const tb = b.timestamp > 0 ? b.timestamp : 0;
  if (ta !== tb) return tb - ta;

  if (ha !== hb) return hb - ha;
  return b.id.localeCompare(a.id);
}

export function mapTransactionToListItem(
  tx: ArweaveGraphQLTransaction,
  ownerAddress: string,
): ArweaveListItem {
  const tagMap = parseTags(tx.tags);
  const contentType = tagMap['Content-Type'] || 'application/octet-stream';
  const fileName = tagMap['File-Name']?.trim() || '';
  const note = tagMap['Note']?.trim() || '';
  const href = arweaveHref(tx.id);

  let contentItems: ArweaveListItem['contentItems'] = [];

  if (isImageMime(contentType)) {
    contentItems = [
      {
        type: 'image',
        data: href,
        alt: fileName || note || undefined,
        mime: contentType,
      },
    ];
  } else {
    contentItems = [
      {
        type: 'link',
        href,
        mime: contentType,
        label: note || fileName || tx.id,
        arId: tx.id,
        download: shouldDownload(contentType),
      },
    ];
  }

  return {
    id: tx.id,
    address: ownerAddress,
    timestamp: toArweaveTimestampMs(tx.block?.timestamp),
    blockHeight: toArweaveBlockHeight(tx.block?.height),
    badgeLabel: mimeToBadgeLabel(contentType),
    contentItems,
  };
}

export function isDisplayableListItem(item: ArweaveListItem): boolean {
  return item.contentItems.length > 0;
}

export function filterDisplayableListItems(items: ArweaveListItem[]): ArweaveListItem[] {
  return items.filter(isDisplayableListItem);
}
