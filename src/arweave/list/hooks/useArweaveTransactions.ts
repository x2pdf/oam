import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { prefetchRemoteImage } from '../../../adapter/remoteImageLoader';
import { isHttpUrl } from '../../../utils/attachment';
import { fetchOwnerTransactions } from '../api/graphql';
import { arweaveListCacheService } from '../cache/cacheService';
import { ARWEAVE_GRAPHQL_PAGE_SIZE } from '../constants';
import {
  compareArweaveListItems,
  filterDisplayableListItems,
  mapTransactionToListItem,
  toArweaveBlockHeight,
  toArweaveTimestampMs,
} from '../mapToListItem';
import { ArweaveListItem } from '../types';
import { isImageMime } from '../utils/mime';

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

function normalizeListItem(item: ArweaveListItem): ArweaveListItem {
  return {
    ...item,
    timestamp: toArweaveTimestampMs(item.timestamp),
    blockHeight: toArweaveBlockHeight(item.blockHeight),
    fileName: item.fileName ?? '',
    note: item.note ?? '',
  };
}

function mergeUniqueItems(existing: ArweaveListItem[], incoming: ArweaveListItem[]): ArweaveListItem[] {
  const map = new Map<string, ArweaveListItem>();
  for (const item of existing) map.set(item.id, normalizeListItem(item));
  for (const raw of incoming) {
    const item = normalizeListItem(raw);
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    // Prefer confirmed height/time when one side is still pending (0).
    const blockHeight =
      item.blockHeight > 0
        ? item.blockHeight
        : prev.blockHeight > 0
          ? prev.blockHeight
          : item.blockHeight;
    const timestamp =
      item.timestamp > 0 ? item.timestamp : prev.timestamp > 0 ? prev.timestamp : item.timestamp;
    map.set(item.id, { ...item, blockHeight, timestamp });
  }
  return Array.from(map.values()).sort(compareArweaveListItems);
}

function prefetchImagesForItems(items: ArweaveListItem[]): void {
  if (Platform.OS === 'web') {
    return;
  }
  for (const item of items) {
    for (const content of item.contentItems) {
      if (content.type === 'image' && isHttpUrl(content.data)) {
        prefetchRemoteImage(content.data, content.mime);
      } else if (
        content.type === 'link' &&
        isImageMime(content.mime) &&
        isHttpUrl(content.href)
      ) {
        prefetchRemoteImage(content.href, content.mime);
      }
    }
  }
}

async function readCachePage(owner: string, offset: number): Promise<{
  items: ArweaveListItem[];
  hasMore: boolean;
}> {
  const rawItems = await arweaveListCacheService.getItems(owner, ARWEAVE_GRAPHQL_PAGE_SIZE, offset);
  const items = filterDisplayableListItems(rawItems);
  const hasMore = await arweaveListCacheService.hasMore(owner, offset + rawItems.length);
  return { items, hasMore };
}

interface FetchDisplayablePageResult {
  mapped: ArweaveListItem[];
  hasNextPage: boolean;
  endCursor: string | null;
}

async function fetchDisplayablePage(
  owner: string,
  after: string | null,
  mode: 'initial' | 'refresh' | 'more',
): Promise<FetchDisplayablePageResult> {
  let currentAfter = after;
  let allMapped: ArweaveListItem[] = [];
  let hasNextPage = false;
  let endCursor: string | null = null;

  for (let attempt = 0; attempt < MAX_EMPTY_FETCH_ATTEMPTS; attempt++) {
    const result =
      mode !== 'more' && attempt === 0
        ? await fetchWithRetry(owner, currentAfter, MAX_EMPTY_FETCH_ATTEMPTS)
        : await fetchOwnerTransactions(owner, { after: currentAfter });

    const mapped = filterDisplayableListItems(
      result.items.map((tx) => mapTransactionToListItem(tx, owner)),
    );
    allMapped = mergeUniqueItems(allMapped, mapped);
    hasNextPage = result.hasNextPage;
    endCursor = result.endCursor;

    if (allMapped.length > 0 || !hasNextPage) {
      break;
    }

    if (!endCursor) {
      break;
    }
    currentAfter = endCursor;
  }

  return { mapped: allMapped, hasNextPage, endCursor };
}

export function useArweaveTransactions(address: string | undefined) {
  const [state, setState] = useState<ArweaveTransactionsState>(initialState);
  const [imageReloadToken, setImageReloadToken] = useState(0);
  const cursorRef = useRef<string | null>(null);
  const dataLengthRef = useRef(0);
  const addressRef = useRef(address);
  const requestIdRef = useRef(0);
  addressRef.current = address;
  dataLengthRef.current = state.data.length;

  const isCurrentRequest = useCallback((requestId: number) => requestIdRef.current === requestId, []);

  const bumpImageReloadToken = useCallback(() => {
    setImageReloadToken((n) => n + 1);
  }, []);

  const applyNetworkResult = useCallback(
    async (
      owner: string,
      mode: 'initial' | 'refresh' | 'more',
      mapped: ArweaveListItem[],
      hasNextPage: boolean,
      endCursor: string | null,
      requestId: number,
    ) => {
      if (!isCurrentRequest(requestId)) return;

      cursorRef.current = endCursor;
      await arweaveListCacheService.saveItems(owner, mapped);

      if (!isCurrentRequest(requestId)) return;

      setState((prev) => ({
        ...prev,
        data: mergeUniqueItems(prev.data, mapped),
        loading: false,
        refreshing: false,
        loadingMore: false,
        hasMore: hasNextPage,
        error: null,
      }));

      prefetchImagesForItems(mapped);

      if (mode === 'initial' || mode === 'refresh') {
        bumpImageReloadToken();
      }
    },
    [bumpImageReloadToken, isCurrentRequest],
  );

  const applyCacheFallback = useCallback(
    async (
      owner: string,
      mode: 'initial' | 'refresh' | 'more',
      requestId: number,
    ): Promise<boolean> => {
      if (!isCurrentRequest(requestId)) return false;

      const offset = mode === 'more' ? dataLengthRef.current : 0;
      const { items, hasMore } = await readCachePage(owner, offset);
      if (!isCurrentRequest(requestId)) return false;
      if (items.length === 0) return false;

      setState((prev) => ({
        ...prev,
        data: mode === 'more' ? mergeUniqueItems(prev.data, items) : mergeUniqueItems([], items),
        loading: false,
        refreshing: false,
        loadingMore: false,
        hasMore,
        error: null,
      }));
      prefetchImagesForItems(items);
      return true;
    },
    [isCurrentRequest],
  );

  const loadPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      const owner = addressRef.current;
      if (!owner) {
        requestIdRef.current += 1;
        setState({ ...initialState, hasMore: false });
        return;
      }

      const requestId = ++requestIdRef.current;

      setState((prev) => ({
        ...prev,
        loading: mode === 'initial' && prev.data.length === 0,
        refreshing: mode === 'refresh',
        loadingMore: mode === 'more',
        error: null,
      }));

      try {
        const after = mode === 'more' ? cursorRef.current : null;
        const { mapped, hasNextPage, endCursor } = await fetchDisplayablePage(owner, after, mode);
        if (!isCurrentRequest(requestId)) return;

        // Empty successful network results must not wipe cache-hydrated UI.
        if (mode !== 'more' && mapped.length === 0) {
          const usedCache = await applyCacheFallback(owner, mode, requestId);
          if (usedCache || !isCurrentRequest(requestId)) {
            if (isCurrentRequest(requestId) && (mode === 'initial' || mode === 'refresh')) {
              bumpImageReloadToken();
            }
            return;
          }

          setState((prev) => {
            if (prev.data.length > 0) {
              return {
                ...prev,
                loading: false,
                refreshing: false,
                loadingMore: false,
                error: null,
              };
            }
            return {
              ...prev,
              data: [],
              loading: false,
              refreshing: false,
              loadingMore: false,
              hasMore: false,
              error: null,
            };
          });
          if (mode === 'initial' || mode === 'refresh') {
            bumpImageReloadToken();
          }
          return;
        }

        await applyNetworkResult(owner, mode, mapped, hasNextPage, endCursor, requestId);
      } catch (e: unknown) {
        if (!isCurrentRequest(requestId)) return;

        const message = e instanceof Error ? e.message : String(e);
        const usedCache = await applyCacheFallback(owner, mode, requestId);

        if (!usedCache && isCurrentRequest(requestId)) {
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
    [applyCacheFallback, applyNetworkResult, bumpImageReloadToken, isCurrentRequest],
  );

  const initializeFromCache = useCallback(
    async (owner: string, requestId: number) => {
      try {
        const { items, hasMore } = await readCachePage(owner, 0);
        if (!isCurrentRequest(requestId) || items.length === 0) return;

        setState((prev) => ({
          ...prev,
          data: mergeUniqueItems([], items),
          loading: false,
          hasMore,
          error: null,
        }));
        prefetchImagesForItems(items);
      } catch (e) {
        console.warn('Failed to initialize Arweave list from cache:', e);
      }
    },
    [isCurrentRequest],
  );

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
    const requestId = ++requestIdRef.current;

    if (!address) {
      setState({ ...initialState, hasMore: false });
      return;
    }

    (async () => {
      await initializeFromCache(address, requestId);
      if (isCurrentRequest(requestId)) {
        await loadPage('initial');
      }
    })();

    return () => {
      requestIdRef.current += 1;
    };
  }, [address, initializeFromCache, isCurrentRequest, loadPage]);

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

  return { state, refresh, loadMore, imageReloadToken };
}
