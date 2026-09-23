import { ContentItem } from '../mypayload';
import { InputDataItem } from '../types';

export type InputDataContentViewMode = 'default' | 'payload' | 'hex';

type CopyPlainTextParams = {
  item: InputDataItem;
  viewMode: InputDataContentViewMode;
  rawHex: string;
  oampPayloadText: string | null;
};

/** 详情页「复制全文」与展示模式一致的纯文本。 */
export function getInputDataCopyablePlainText({
  item,
  viewMode,
  rawHex,
  oampPayloadText,
}: CopyPlainTextParams): string {
  const kind = item.contentKind ?? 'RAW';

  if (viewMode === 'hex') {
    return rawHex;
  }
  if (viewMode === 'payload' && oampPayloadText) {
    return oampPayloadText;
  }
  if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
    return item.oampItems
      .filter((entry): entry is ContentItem & { type: 'text' } => entry.type === 'text')
      .map((entry) => entry.content)
      .join('\n')
      .trim();
  }
  if (kind === 'UTF-8' && item.textContent) {
    return item.textContent;
  }
  return rawHex;
}
