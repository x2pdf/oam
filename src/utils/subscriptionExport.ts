import { MAX_ADDRESS_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants';

export const FOLLOW_LIST_EXPORT_TYPE = 'oam-follow-list';

export type FollowListExportItem = {
  address: string;
  description: string;
};

export type FollowListExportPayload = {
  type: typeof FOLLOW_LIST_EXPORT_TYPE;
  name: string;
  items: FollowListExportItem[];
};

export type ParseFollowListError = 'invalidJson' | 'invalidFormat' | 'empty';

export type ParseFollowListResult =
  | { ok: true; items: FollowListExportItem[] }
  | { ok: false; error: ParseFollowListError };

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeItem(value: unknown): FollowListExportItem | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const address = asTrimmedString(obj.address);
  const description = asTrimmedString(obj.description);
  if (!address || !description) return null;
  if (address.length > MAX_ADDRESS_LENGTH) return null;
  if (description.length > MAX_DESCRIPTION_LENGTH) return null;
  return { address, description };
}

function extractRawItems(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items;
  return null;
}

export function buildFollowListExport(
  name: string,
  items: FollowListExportItem[],
): FollowListExportPayload {
  return {
    type: FOLLOW_LIST_EXPORT_TYPE,
    name,
    items: items.map((item) => ({
      address: item.address,
      description: item.description,
    })),
  };
}

export function stringifyFollowListExport(payload: FollowListExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseFollowListImport(text: string): ParseFollowListResult {
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
  const items: FollowListExportItem[] = [];
  for (const raw of rawItems) {
    const item = normalizeItem(raw);
    if (!item) continue;
    const key = item.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  if (items.length === 0) return { ok: false, error: 'empty' };
  return { ok: true, items };
}
