import { ContentItem } from '../mypayload';
import { OAMPClient } from '../oamp/client';

export type OampFilterResult =
  | { kind: 'OAMP'; items: ContentItem[] }
  | { kind: 'OAMP_ENCRYPTED' }
  | { kind: 'miss' };

export interface PipelineContext {
  userAddress?: string;
  client?: OAMPClient | null;
}

export function isDisplayableItems(items: ContentItem[] | null | undefined): items is ContentItem[] {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => {
    if (item.type === 'text') return !!item.content;
    if (item.type === 'image') return !!item.data;
    return false;
  });
}
