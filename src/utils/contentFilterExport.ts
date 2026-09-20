import { MAX_DESCRIPTION_LENGTH, MAX_MATCH_EXPRESSION_LENGTH } from '../constants';
import {
  ContentFilterMatchType,
  isContentFilterMatchType,
  normalizeMatchExpression,
} from '../types';

export const CONTENT_FILTER_EXPORT_TYPE = 'oam-content-filter-list';

export type ContentFilterExportItem = {
  description: string;
  matchType: ContentFilterMatchType;
  matchExpression: string;
};

export type ContentFilterExportPayload = {
  type: typeof CONTENT_FILTER_EXPORT_TYPE;
  name: string;
  items: ContentFilterExportItem[];
};

export type ParseContentFilterError = 'invalidJson' | 'invalidFormat' | 'empty';

export type ParseContentFilterResult =
  | { ok: true; items: ContentFilterExportItem[] }
  | { ok: false; error: ParseContentFilterError };

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeItem(value: unknown): ContentFilterExportItem | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const description = asTrimmedString(obj.description);
  const matchExpression =
    typeof obj.matchExpression === 'string'
      ? normalizeMatchExpression(obj.matchExpression)
      : '';
  const matchType = obj.matchType;
  if (!description || !matchExpression) return null;
  if (!isContentFilterMatchType(matchType)) return null;
  if (description.length > MAX_DESCRIPTION_LENGTH) return null;
  if (matchExpression.length > MAX_MATCH_EXPRESSION_LENGTH) return null;
  return { description, matchType, matchExpression };
}

function extractRawItems(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items;
  return null;
}

export function buildContentFilterExport(
  name: string,
  items: ContentFilterExportItem[],
): ContentFilterExportPayload {
  return {
    type: CONTENT_FILTER_EXPORT_TYPE,
    name,
    items: items.map((item) => ({
      description: item.description,
      matchType: item.matchType,
      matchExpression: item.matchExpression,
    })),
  };
}

export function stringifyContentFilterExport(payload: ContentFilterExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseContentFilterImport(text: string): ParseContentFilterResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }

  const rawItems = extractRawItems(parsed);
  if (!rawItems) return { ok: false, error: 'invalidFormat' };

  const seen = new Set<string>();
  const items: ContentFilterExportItem[] = [];
  for (const raw of rawItems) {
    const item = normalizeItem(raw);
    if (!item) continue;
    const key = `${item.matchType}\0${item.matchExpression}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  if (items.length === 0) return { ok: false, error: 'empty' };
  return { ok: true, items };
}
