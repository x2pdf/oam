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

export function mapTransactionToListItem(
  tx: ArweaveGraphQLTransaction,
  ownerAddress: string,
): ArweaveListItem {
  const tagMap = parseTags(tx.tags);
  const contentType = tagMap['Content-Type'] || 'application/octet-stream';
  const fileName = tagMap['File-Name']?.trim() || '';
  const note = tagMap['Note']?.trim() || '';
  const href = arweaveHref(tx.id);
  const timestampSec = tx.block?.timestamp ?? 0;

  let contentItems: ArweaveListItem['contentItems'] = [];

  if (isImageMime(contentType)) {
    contentItems = [{ type: 'image', data: href, alt: fileName || note || undefined }];
  } else {
    const label = note || fileName;
    if (label) {
      contentItems = [
        {
          type: 'link',
          href,
          mime: contentType,
          label,
          arId: tx.id,
          download: shouldDownload(contentType),
        },
      ];
    }
  }

  return {
    id: tx.id,
    address: ownerAddress,
    timestamp: timestampSec > 0 ? timestampSec * 1000 : 0,
    badgeLabel: mimeToBadgeLabel(contentType),
    contentItems,
  };
}
