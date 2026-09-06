import { InputDataItem } from '../types';
import { HomeTabId } from '../constants';
import { cacheService } from './cacheService';
import { dataSourceManager } from './DataSourceManager';
import { applyDisplayPipeline } from '../display';
import { OAMPClient } from '../oamp/client';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
import { getUnlockedWallet } from '../wallet/session';
import { isBlackHoleAddress, shortenAddress, BLACK_HOLE_ADDRESS } from '../utils/address';
import {
  CACHE_LOAD_LIMIT,
  FOLLOWING_BLOCK_WINDOW,
  FOLLOWING_ADDRESS_FETCH_RATE_LIMIT,
  BLACK_HOLE_PAGE_SIZE,
  BLACK_HOLE_EMPTY_CONTINUE_PAGES,
} from '../constants';
import {
  mapTransactionsToMessages,
  filterFollowedWithInput,
  mapToInputDataItem,
} from './transactionMapper';

export interface DataState {
  data: InputDataItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
}

export class DataRepository {
  private static instance: DataRepository;

  private states: Record<HomeTabId, DataState> = {
    square: this.initialState(),
    following: this.initialState(),
    messages: this.initialState(),
    self: this.initialState(),
  };

  // Internal raw data before pipeline (optional, but good for re-processing when wallet unlocks)
  private rawData: Record<HomeTabId, InputDataItem[]> = {
    square: [],
    following: [],
    messages: [],
    self: [],
  };

  private nextParams: Record<string, any> = {};
  private followingNextEndBlock: number | null = null;
  private listeners: Set<(tabId: HomeTabId) => void> = new Set();

  private constructor() {}

  public static getInstance(): DataRepository {
    if (!DataRepository.instance) {
      DataRepository.instance = new DataRepository();
    }
    return DataRepository.instance;
  }

  private initialState(): DataState {
    return {
      data: [],
      loading: false,
      refreshing: false,
      loadingMore: false,
      hasMore: true,
      error: null,
    };
  }

  public subscribe(listener: (tabId: HomeTabId) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(tabId: HomeTabId) {
    this.listeners.forEach(l => l(tabId));
  }

  public getState(tabId: HomeTabId): DataState {
    return this.states[tabId];
  }

  /**
   * Initialize a tab from cache
   */
  public async initializeTab(tabId: HomeTabId, userAddress?: string, subscriptions: any[] = []) {
    if (this.states[tabId].data.length > 0) return;

    this.updateState(tabId, { loading: true });

    try {
      let items: InputDataItem[] = [];
      if (tabId === 'square') {
        const txs = await cacheService.getTransactions([BLACK_HOLE_ADDRESS], CACHE_LOAD_LIMIT);
        items = mapTransactionsToMessages(txs, BLACK_HOLE_ADDRESS, 'square', this.formatTimestamp, shortenAddress);
      } else if (tabId === 'following') {
        const addresses = subscriptions.map(s => s.address).filter(Boolean);
        if (addresses.length > 0) {
          const txs = await cacheService.getTransactions(addresses, CACHE_LOAD_LIMIT);
          const followedLower = new Set(addresses.map(a => a.toLowerCase()));
          items = filterFollowedWithInput(txs, followedLower)
            .map(tx => mapToInputDataItem(tx, 'all', '', this.formatTimestamp, shortenAddress))
            .sort((a, b) => b.timestamp - a.timestamp);
        }
      } else if (tabId === 'messages') {
        if (userAddress) {
          const txs = await cacheService.getTransactions([userAddress], CACHE_LOAD_LIMIT);
          const sent = mapTransactionsToMessages(txs, userAddress, 'sent', this.formatTimestamp, shortenAddress);
          const inbox = mapTransactionsToMessages(txs, userAddress, 'inbox', this.formatTimestamp, shortenAddress);
          const map = new Map<string, InputDataItem>();
          sent.forEach(i => map.set(i.id, i));
          inbox.forEach(i => map.set(i.id, i));
          items = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        }
      } else if (tabId === 'self') {
        if (userAddress) {
          const txs = await cacheService.getTransactions([userAddress], CACHE_LOAD_LIMIT);
          items = mapTransactionsToMessages(txs, userAddress, 'self', this.formatTimestamp, shortenAddress);
        }
      }

      if (items.length > 0) {
        this.rawData[tabId] = items;
        const processed = await this.processItems(items, userAddress);
        this.updateState(tabId, { data: processed, loading: false });
      } else {
        this.updateState(tabId, { loading: false });
      }
    } catch (e) {
      console.warn(`Failed to init tab ${tabId} from cache`, e);
      this.updateState(tabId, { loading: false });
    }
  }

  /**
   * Refresh data from network
   */
  public async refresh(tabId: HomeTabId, userAddress?: string, subscriptions: any[] = []) {
    this.updateState(tabId, { refreshing: true, error: null });
    console.log(`[DataRepository] Refreshing tab: ${tabId}`);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Refresh timed out')), 30000)
    );

    try {
      await Promise.race([
        (async () => {
          dataSourceManager.clearSkipped();

          // Incremental refresh: find latest block in cache
          let startBlock: number | undefined;
          if (tabId === 'square') {
            startBlock = await cacheService.getLatestBlockNumber([BLACK_HOLE_ADDRESS]);
          } else if (tabId === 'following') {
            const addresses = subscriptions.map(s => s.address).filter(Boolean);
            startBlock = await cacheService.getLatestBlockNumber(addresses);
          } else if (userAddress) {
            startBlock = await cacheService.getLatestBlockNumber([userAddress]);
          }

          const isIncremental = !!startBlock;
          // Only reset pagination cursor if this is a full (non-incremental) refresh
          if (!isIncremental) {
            this.nextParams[tabId] = null;
            if (tabId === 'following') this.followingNextEndBlock = null;
          }

          const fetchParams = startBlock ? { startblock: startBlock } : null;
          console.log(`[DataRepository] Fetching from network. tab=${tabId}, isIncremental=${isIncremental}`);
          let result = await this.fetchFromNetwork(tabId, userAddress, subscriptions, fetchParams);

          // Safety check: if incremental but no items and existing data is empty, try full refresh
          if (isIncremental && result.items.length === 0 && this.rawData[tabId].length === 0) {
            console.log(`[DataRepository] Incremental refresh returned nothing and rawData is empty. Retrying with full refresh.`);
            this.nextParams[tabId] = null;
            if (tabId === 'following') this.followingNextEndBlock = null;
            result = await this.fetchFromNetwork(tabId, userAddress, subscriptions, null);
          }

          const mergedRaw = this.mergeData(this.rawData[tabId], result.items);
          this.rawData[tabId] = mergedRaw;
          const processed = await this.processItems(mergedRaw, userAddress);

          // For incremental refresh, only update cursor if we actually found a next page in the NEW results.
          // Otherwise, keep the existing cursor (which points to OLDER data).
          if (!isIncremental || result.nextParams) {
            this.nextParams[tabId] = result.nextParams;
          }
          if (tabId === 'following' && (!isIncremental || result.followingNextEndBlock != null)) {
            this.followingNextEndBlock = result.followingNextEndBlock;
          }

          const hasMore = isIncremental
            ? (this.states[tabId].hasMore || !!result.nextParams)
            : (result.items.length > 0 && (!!result.nextParams || (tabId === 'following' && result.followingNextEndBlock != null)));

          this.updateState(tabId, {
            data: processed,
            hasMore
          });
        })(),
        timeoutPromise
      ]);
    } catch (e: any) {
      console.error(`[DataRepository] Refresh failed for ${tabId}:`, e);
      this.updateState(tabId, { error: e.message || 'Fetch failed' });
    } finally {
      this.updateState(tabId, { refreshing: false });
    }
  }

  /**
   * Load more data (Cache -> Network)
   */
  public async loadMore(tabId: HomeTabId, userAddress?: string, subscriptions: any[] = []) {
    const state = this.states[tabId];
    if (state.loadingMore || !state.hasMore) return;

    this.updateState(tabId, { loadingMore: true });

    try {
      // 1. Try to load more from cache first
      const currentOffset = this.rawData[tabId].length;
      let cachedItems: InputDataItem[] = [];

      if (tabId === 'square') {
        const txs = await cacheService.getTransactions([BLACK_HOLE_ADDRESS], CACHE_LOAD_LIMIT, currentOffset);
        cachedItems = mapTransactionsToMessages(txs, BLACK_HOLE_ADDRESS, 'square', this.formatTimestamp, shortenAddress);
      } else if (tabId === 'following') {
        const addresses = subscriptions.map(s => s.address).filter(Boolean);
        if (addresses.length > 0) {
          const txs = await cacheService.getTransactions(addresses, CACHE_LOAD_LIMIT, currentOffset);
          const followedLower = new Set(addresses.map(a => a.toLowerCase()));
          cachedItems = filterFollowedWithInput(txs, followedLower)
            .map(tx => mapToInputDataItem(tx, 'all', '', this.formatTimestamp, shortenAddress))
            .sort((a, b) => b.timestamp - a.timestamp);
        }
      } else if (tabId === 'self') {
        if (userAddress) {
          const txs = await cacheService.getTransactions([userAddress], CACHE_LOAD_LIMIT, currentOffset);
          cachedItems = mapTransactionsToMessages(txs, userAddress, 'self', this.formatTimestamp, shortenAddress);
        }
      }
      // Note: Following and Messages cache loading more is complex due to multi-address merge.
      // For simplicity, if not in cache, go to network.

      if (cachedItems.length > 0) {
        const mergedRaw = this.mergeData(this.rawData[tabId], cachedItems);
        this.rawData[tabId] = mergedRaw;
        const processed = await this.processItems(mergedRaw, userAddress);
        this.updateState(tabId, { data: processed, loadingMore: false });
        return;
      }

      // 2. Load from Network
      const result = await this.fetchFromNetwork(tabId, userAddress, subscriptions, this.nextParams[tabId]);

      const mergedRaw = this.mergeData(this.rawData[tabId], result.items);
      this.rawData[tabId] = mergedRaw;
      const processed = await this.processItems(mergedRaw, userAddress);

      this.nextParams[tabId] = result.nextParams;
      if (tabId === 'following') this.followingNextEndBlock = result.followingNextEndBlock;

      this.updateState(tabId, {
        data: processed,
        loadingMore: false,
        hasMore: !!result.nextParams || (tabId === 'following' && result.followingNextEndBlock != null)
      });
    } catch (e: any) {
      this.updateState(tabId, { loadingMore: false, error: e.message || 'Load more failed' });
    }
  }

  private async fetchFromNetwork(tabId: HomeTabId, userAddress?: string, subscriptions: any[] = [], params: any) {
    console.log(`[DataRepository] fetchFromNetwork started. tab=${tabId}, params=`, params);
    let resultItems: InputDataItem[] = [];
    let nextParams: any = null;
    let followingNextEndBlock: number | null = null;
    let rawTxs: any[] = [];

    if (tabId === 'square') {
      const withBlackHolePageSize = (p: any) => ({
        ...(p && typeof p === 'object' ? p : { page: '1' }),
        offset: String(BLACK_HOLE_PAGE_SIZE),
        items_count: String(BLACK_HOLE_PAGE_SIZE),
      });

      let pageParams = withBlackHolePageSize(params);
      const collected: InputDataItem[] = [];
      const collectedRaw: any[] = [];
      let pages = 0;
      const maxPages = 1 + BLACK_HOLE_EMPTY_CONTINUE_PAGES;

      do {
        console.log(`[DataRepository] fetchFromNetwork (square) page=${pages + 1}`);
        const res = await dataSourceManager.fetchAll(BLACK_HOLE_ADDRESS, 'square', pageParams).catch(e => {
          throw e;
        });
        res.items.forEach(i => collected.push(i));
        if (res.rawTransactions) collectedRaw.push(...res.rawTransactions);
        nextParams = res.next_page_params ?? null;
        pages += 1;
        if (collected.length > 0 || !nextParams) break;
        pageParams = withBlackHolePageSize(nextParams);
      } while (pages < maxPages);

      resultItems = collected;
      rawTxs = collectedRaw;
    } else if (tabId === 'following') {
      const addresses = subscriptions.map(s => s.address?.toLowerCase()).filter(Boolean) as string[];
      if (addresses.length === 0) {
        console.log('[DataRepository] fetchFromNetwork (following) - No subscriptions.');
        return { items: [], nextParams: null, followingNextEndBlock: null };
      }

      console.log(`[DataRepository] fetchFromNetwork (following) - Fetching latest 20 for ${addresses.length} addresses with rate limit ${FOLLOWING_ADDRESS_FETCH_RATE_LIMIT}/s.`);

      const results: any[] = [];
      for (let i = 0; i < addresses.length; i += FOLLOWING_ADDRESS_FETCH_RATE_LIMIT) {
        const batch = addresses.slice(i, i + FOLLOWING_ADDRESS_FETCH_RATE_LIMIT);
        console.log(`[DataRepository] Fetching batch ${i / FOLLOWING_ADDRESS_FETCH_RATE_LIMIT + 1}, addresses: ${batch.length}`);
        const batchResults = await Promise.all(
          batch.map(async (addr) => {
            try {
              return await dataSourceManager.fetchAll(addr, 'all', params);
            } catch (e) {
              console.warn(`[DataRepository] Failed to fetch for ${addr}:`, e);
              return { items: [], next_page_params: null, rawTransactions: [] };
            }
          })
        );
        results.push(...batchResults);

        // Wait 1 second before next batch to respect 5 requests per second limit
        if (i + FOLLOWING_ADDRESS_FETCH_RATE_LIMIT < addresses.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const allItems: InputDataItem[] = [];
      const allRaw: any[] = [];
      results.forEach(res => {
        allItems.push(...res.items);
        if (res.rawTransactions) allRaw.push(...res.rawTransactions);
      });

      const map = new Map<string, InputDataItem>();
      allItems.forEach(i => map.set(i.id, i));
      resultItems = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
      rawTxs = allRaw;

      nextParams = null;
      followingNextEndBlock = null;
    } else if (tabId === 'messages') {
      if (!userAddress) throw new Error('Address required');
      console.log(`[DataRepository] fetchFromNetwork (messages) address=${userAddress}`);
      const res = await dataSourceManager.fetchAll(userAddress, 'all', params);
      resultItems = res.items;
      nextParams = res.next_page_params;
      rawTxs = res.rawTransactions || [];
    } else if (tabId === 'self') {
      if (!userAddress) throw new Error('Address required');
      console.log(`[DataRepository] fetchFromNetwork (self) address=${userAddress}`);
      const res = await dataSourceManager.fetchAll(userAddress, 'self', params);
      resultItems = res.items;
      nextParams = res.next_page_params;
      rawTxs = res.rawTransactions || [];
    }

    console.log(`[DataRepository] fetchFromNetwork completed. tab=${tabId}, itemsFetched=${resultItems.length}, hasNext=${!!nextParams}`);
    // Save to cache
    if (rawTxs.length > 0) {
      if (tabId === 'square') {
        cacheService.saveTransactions(BLACK_HOLE_ADDRESS, rawTxs);
      } else if (tabId === 'following') {
        for (const s of subscriptions) {
          const addr = s.address.toLowerCase();
          const relevantTxs = rawTxs.filter(tx => tx.fromLower === addr || tx.toLower === addr);
          if (relevantTxs.length > 0) cacheService.saveTransactions(addr, relevantTxs);
        }
      } else if (userAddress) {
        cacheService.saveTransactions(userAddress, rawTxs);
      }
    }

    return { items: resultItems, nextParams, followingNextEndBlock };
  }

  private mergeData(prev: InputDataItem[], next: InputDataItem[]): InputDataItem[] {
    const map = new Map<string, InputDataItem>();
    prev.forEach(i => map.set(i.id, i));
    next.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  private async processItems(items: InputDataItem[], userAddress?: string): Promise<InputDataItem[]> {
    try {
      let client: OAMPClient | null = null;
      const wallet = getUnlockedWallet();
      if (wallet) {
        client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
      }
      return await applyDisplayPipeline(items, { userAddress, client });
    } catch (e) {
      console.warn('Pipeline failed', e);
      return items;
    }
  }

  private updateState(tabId: HomeTabId, update: Partial<DataState>) {
    this.states[tabId] = { ...this.states[tabId], ...update };
    this.notify(tabId);
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, '0');
    const D = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }

  /**
   * Re-process data when wallet state changes (e.g. unlocked)
   */
  public async reprocessAll(userAddress?: string) {
    for (const tabId of Object.keys(this.states) as HomeTabId[]) {
      if (this.rawData[tabId].length > 0) {
        const processed = await this.processItems(this.rawData[tabId], userAddress);
        this.updateState(tabId, { data: processed });
      }
    }
  }
}

export const dataRepository = DataRepository.getInstance();
