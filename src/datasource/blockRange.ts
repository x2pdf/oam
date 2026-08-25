import { FOLLOWING_BLOCK_WINDOW } from '../constants';

export function parseLatestBlockNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    if (n < 0) throw new Error('Invalid block number');
    return n;
  }
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('Invalid block number');
  const n = s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid block number');
  return n;
}

export function getBlockRangeParams(params: any): { start: number; end: number; pageSize: number } | null {
  if (params?.startblock == null || params?.endblock == null) return null;
  const start = Number(params.startblock);
  const end = Number(params.endblock);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const pageSize = Number(params.offset ?? params.items_count ?? 1000);
  return {
    start,
    end,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 1000,
  };
}

export function makeBlockWindow(
  endBlock: number,
  windowSize: number = FOLLOWING_BLOCK_WINDOW,
): { startBlock: number; endBlock: number; nextEndBlock: number | null } {
  const end = Math.max(0, Math.floor(endBlock));
  const size = Math.max(1, Math.floor(windowSize));
  const start = Math.max(0, end - size + 1);
  return {
    startBlock: start,
    endBlock: end,
    nextEndBlock: start > 0 ? start - 1 : null,
  };
}
