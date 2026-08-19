import { ContentKind, InputDataItem } from '../types';
import { parseHexToBytes } from './hex';
import { tryOampFilter } from './oampFilter';
import { toRawHex } from './rawFilter';
import { PipelineContext } from './types';
import { tryDecodeUtf8 } from './utf8Filter';

function markRaw(item: InputDataItem): InputDataItem {
  return {
    ...item,
    contentKind: 'RAW',
    oampItems: undefined,
    textContent: undefined,
    description: item.description || toRawHex(item.rawInput),
  };
}

async function classifyItem(item: InputDataItem, ctx: PipelineContext): Promise<InputDataItem> {
  try {
    const oamp = await tryOampFilter(item, ctx);

    if (oamp.kind === 'OAMP') {
      return {
        ...item,
        contentKind: 'OAMP',
        oampItems: oamp.items,
        textContent: undefined,
      };
    }

    if (oamp.kind === 'OAMP_ENCRYPTED') {
      return {
        ...item,
        contentKind: 'OAMP_ENCRYPTED',
        oampItems: undefined,
        textContent: undefined,
      };
    }

    const bytes = parseHexToBytes(item.rawInput);
    if (bytes) {
      const text = tryDecodeUtf8(bytes);
      if (text) {
        return {
          ...item,
          contentKind: 'UTF-8',
          textContent: text,
          oampItems: undefined,
        };
      }
    }

    return markRaw(item);
  } catch (e) {
    console.warn('Display classify failed for item:', item.id, e);
    return markRaw(item);
  }
}

/**
 * Classify list items: OAMP → (miss only) UTF-8 → RAW.
 * Encrypted OAMP failures stop at OAMP_ENCRYPTED.
 * Never throws; every item gets a contentKind.
 */
export async function applyDisplayPipeline(
  items: InputDataItem[],
  ctx: PipelineContext = {}
): Promise<InputDataItem[]> {
  try {
    const results = await Promise.allSettled(items.map((item) => classifyItem(item, ctx)));
    return results.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      console.warn('Display pipeline item rejected:', items[index]?.id, result.reason);
      return markRaw(items[index]);
    });
  } catch (e) {
    console.warn('Display pipeline failed:', e);
    return items.map(markRaw);
  }
}

export function markAllRaw(items: InputDataItem[]): InputDataItem[] {
  return items.map(markRaw);
}

export const CONTENT_KIND_I18N_KEY: Record<ContentKind, string> = {
  OAMP: 'home.contentKind.OAMP',
  OAMP_ENCRYPTED: 'home.contentKind.OAMP_ENCRYPTED',
  'UTF-8': 'home.contentKind.UTF8',
  RAW: 'home.contentKind.RAW',
};
