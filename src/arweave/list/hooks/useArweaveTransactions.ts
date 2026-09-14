import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchOwnerTransactions } from '../api/graphql';
import { arweaveListCacheService } from '../cache/cacheService';
import { ARWEAVE_GRAPHQL_PAGE_SIZE } from '../constants';
import { mapTransactionToListItem } from '../mapToListItem';
import { ArweaveListItem } from '../types';

export interface ArweaveTransactionsState {
  data: ArweaveListItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
}

const initialState: ArweaveTransactionsState = {
  data: [],
  loading: false,
  refreshing: false,
  loadingMore: false,
  hasMore: true,
  error: null,
};

const MAX_EMPTY_FETCH_ATTEMPTS = 5;

async function fetchWithRetry(
  owner: string,
  after: string | null,
  maxAttempts: number,
): Promise<Awaited<ReturnType<typeof fetchOwnerTransactions>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetchOwnerTransactions(owner, { after });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function mergeUniqueItems(existing: ArweaveListItem[], incoming: ArweaveListItem[]): ArweaveListItem[] {
  const map = new Map<string, ArweaveListItem>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

async function readCachePage(owner: string, offset: number): Promise<{
  items: ArweaveListItem[];
  hasMore: boolean;
}> {
  const items = await arweaveListCacheService.getItems(owner, ARWEAVE_GRAPHQL_PAGE_SIZE, offset);
  const hasMore = await arweaveListCacheService.hasMore(owner, offset + items.length);
  return { items, hasMore };
}

export function useArweaveTransactions(address: string | undefined) {
  const [state, setState] = useState<ArweaveTransactionsState>(initialState);
  const cursorRef = useRef<string | null>(null);
  const dataLengthRef = useRef(0);
  const addressRef = useRef(address);
  addressRef.current = address;
  dataLengthRef.current = state.data.length;

  const applyNetworkResult = useCallback(
    async (
      owner: string,
      mode: 'initial' | 'refresh' | 'more',
      mapped: ArweaveListItem[],
      hasNextPage: boolean,
      endCursor: string | null,
    ) => {
      cursorRef.current = endCursor;
      await arweaveListCacheService.saveItems(owner, mapped);

      setState((prev) => ({
        ...prev,
        data: mode === 'more' ? mergeUniqueItems(prev.data, mapped) : mapped,
        loading: false,
        refreshing: false,
        loadingMore: false,
        hasMore: hasNextPage,
        error: null,
      }));
    },
    [],
  );

  const applyCacheFallback = useCallback(
    async (owner: string, mode: 'initial' | 'refresh' | 'more'): Promise<boolean> => {
      const offset = mode === 'more' ? dataLengthRef.current : 0;
      const { items, hasMore } = await readCachePage(owner, offset);
      if (items.length === 0) return false;

      setState((prev) => ({
        ...prev,
        data: mode === 'more' ? mergeUniqueItems(prev.data, items) : items,
        loading: false,
        refreshing: false,
        loadingMore: false,
        hasMore,
        error: null,
      }));
      return true;
    },
    [],
  );

  const loadPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      const owner = addressRef.current;
      if (!owner) {
        setState({ ...initialState, hasMore: false });
        return;
      }

      setState((prev) => ({
        ...prev,
        loading: mode === 'initial' && prev.data.length === 0,
        refreshing: mode === 'refresh',
        loadingMore: mode === 'more',
        error: null,
      }));

      try {
        const after = mode === 'more' ? cursorRef.current : null;
        const result =
          mode === 'more'
            ? await fetchOwnerTransactions(owner, { after })
            : await fetchWithRetry(owner, after, MAX_EMPTY_FETCH_ATTEMPTS);
        const mapped = result.items.map((tx) => mapTransactionToListItem(tx, owner));
        await applyNetworkResult(owner, mode, mapped, result.hasNextPage, result.endCursor);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const usedCache = await applyCacheFallback(owner, mode);

        if (!usedCache) {
          setState((prev) => {
            const noData = prev.data.length === 0 && mode !== 'more';
            return {
              ...prev,
              loading: false,
              refreshing: false,
              loadingMore: false,
              hasMore: noData ? false : prev.hasMore,
              error: noData ? null : message,
            };
          });
        }
      }
    },
    [applyCacheFallback, applyNetworkResult],
  );

  const initializeFromCache = useCallback(async (owner: string) => {
    try {
      const { items, hasMore } = await readCachePage(owner, 0);
      if (items.length === 0) return;

      setState((prev) => ({
        ...prev,
        data: items,
        loading: false,
        hasMore,
        error: null,
      }));
    } catch (e) {
      console.warn('Failed to initialize Arweave list from cache:', e);
    }
  }, []);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    setState((prev) => ({ ...prev, hasMore: true, error: null }));
    return loadPage('refresh');
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!addressRef.current) return;
    return loadPage('more');
  }, [loadPage]);

  useEffect(() => {
    cursorRef.current = null;
    if (!address) {
      setState({ ...initialState, hasMore: false });
      return;
    }

    let cancelled = false;
    (async () => {
      await initializeFromCache(address);
      if (!cancelled) {
        await loadPage('initial');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, initializeFromCache, loadPage]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      if (addressRef.current) {
        refresh();
      }
    }, [refresh]),
  );

  return { state, refresh, loadMore };
}
