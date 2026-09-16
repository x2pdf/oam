import { applyDisplayPipeline } from '../display';
import { ContentItem } from '../mypayload';
import { InputDataItem } from '../types';
import { shortenAddress } from '../utils/address';
import { cacheService } from './cacheService';
import { mapTransactionsToMessages } from './transactionMapper';

export interface SearchLocalMessagesParams {
  userAddress: string;
  query: string;
  showSent: boolean;
  showReceived: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function appendOampItemText(parts: string[], item: ContentItem): void {
  if (item.type === 'text') {
    parts.push(item.content);
  } else if (item.type === 'link') {
    parts.push(item.label, item.href);
  } else if (item.type === 'image' && item.alt) {
    parts.push(item.alt);
  }
}

export function extractSearchableText(item: InputDataItem): string {
  const parts: string[] = [
    item.id,
    item.from ?? '',
    item.to ?? '',
    item.address ?? '',
    item.textContent ?? '',
    item.description ?? '',
    item.rawInput ?? '',
  ];

  if (Array.isArray(item.oampItems)) {
    for (const oampItem of item.oampItems) {
      appendOampItemText(parts, oampItem);
    }
  }

  return parts.filter(Boolean).join(' ');
}

export function matchesMessageQuery(item: InputDataItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return extractSearchableText(item).toLowerCase().includes(q);
}

export async function searchLocalMessages(
  params: SearchLocalMessagesParams,
): Promise<InputDataItem[]> {
  const { userAddress, query, showSent, showReceived } = params;
  const trimmedQuery = query.trim();
  if (!trimmedQuery || !userAddress) return [];
  if (!showSent && !showReceived) return [];

  const txs = await cacheService.getAllTransactions([userAddress]);
  const map = new Map<string, InputDataItem>();

  if (showSent) {
    const sent = mapTransactionsToMessages(
      txs,
      userAddress,
      'sent',
      formatTimestamp,
      shortenAddress,
    );
    sent.forEach((item) => map.set(item.id, item));
  }

  if (showReceived) {
    const inbox = mapTransactionsToMessages(
      txs,
      userAddress,
      'inbox',
      formatTimestamp,
      shortenAddress,
    );
    inbox.forEach((item) => map.set(item.id, item));
  }

  const items = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  const processed = await applyDisplayPipeline(items, { userAddress });

  return processed
    .filter((item) => matchesMessageQuery(item, trimmedQuery))
    .sort((a, b) => b.timestamp - a.timestamp);
}
