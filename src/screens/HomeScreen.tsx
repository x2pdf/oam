import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme, Button, Snackbar, FAB, TextInput as PaperTextInput, Checkbox } from 'react-native-paper';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import TabPager, { TabPagerRef } from '../components/TabPager';
import { useTranslation } from 'react-i18next';
import { InputDataItem, RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { InputDataCard } from '../components/InputDataCard';
import { CopyableAddress } from '../components/CopyableAddress';
import { shortenAddress, BLACK_HOLE_ADDRESS } from '../utils/address';
import { OAMPClient } from '../oamp/client';
import { applyDisplayPipeline, markAllRaw } from '../display';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FILTER_STATE_KEY, BLACK_HOLE_PAGE_SIZE, BLACK_HOLE_EMPTY_CONTINUE_PAGES, FOLLOWING_BLOCK_WINDOW, getHomeTabOrder, type HomeTabId } from '../constants';
import { useThemePreference } from '../context/ThemeContext';
import { isBlackHoleAddress } from '../utils/address';
import { makeBlockWindow } from '../datasource/blockRange';
import { fetchBlockWindowTransactions, fetchLatestBlockNumberViaRpc } from '../datasource/fetchBlockWindow';
import { filterFollowedWithInput, mapToInputDataItem, mapTransactionsToMessages } from '../datasource/transactionMapper';
import { cacheService } from '../datasource/cacheService';
import {
  isDesktopLockPolicy,
  usePasswordLockRemaining,
  useWalletSession,
} from '../wallet/WalletSessionContext';
import {
  getUnlockedWallet,
  isSessionUnlocked,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
  PASSWORD_LOCKED_ERROR,
} from '../wallet/session';
import { AppModal } from '../components/AppModal';
import { getHeaderChrome } from '../theme';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  常量与类型                                                         */
/* ------------------------------------------------------------------ */

const INTERNAL_SQUARE = 0;
const INTERNAL_SENT = 1;
const INTERNAL_INBOX = 2;
const INTERNAL_SELF = 3;
const INTERNAL_FOLLOWING = 4;

const TAB_LOADING_OFF: Record<HomeTabId, boolean> = {
  square: false,
  following: false,
  messages: false,
  self: false,
};

const TAB_HAS_MORE_ON: Record<HomeTabId, boolean> = {
  square: true,
  following: true,
  messages: true,
  self: true,
};

function wipeDecryptedItems(items: InputDataItem[]): InputDataItem[] {
  return items.map((item) => {
    if (item.contentKind !== 'OAMP' || !item.oampItems) return item;
    return {
      ...item,
      contentKind: 'OAMP_ENCRYPTED',
      oampItems: undefined,
      textContent: undefined,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  主页屏幕                                                           */
/* ------------------------------------------------------------------ */


function formatListTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

export default function HomeScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { centered, cardWidth, listContentStyle, columnStyle } = useListColumnLayout();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const { apiKey, profile, subscriptions, isLoading: contextLoading, homeTabWeights } = state;
  const { unlocked, unlock, lock } = useWalletSession();
  const isWriteWallet = profile?.walletType === 'write';

  const headerChrome = getHeaderChrome(theme);
  const tabActiveColor = theme.dark ? theme.colors.onSurface : '#FFFFFF';
  const tabInactiveColor = theme.dark ? theme.colors.onSurfaceVariant : 'rgba(255, 255, 255, 0.7)';
  const tabIndicatorColor = theme.dark ? theme.colors.primary : '#FFFFFF';

  const tabLabels = useMemo(() => ({
    square: t('home.tabs.square'),
    following: t('home.tabs.following'),
    messages: t('home.tabs.messages'),
    self: t('home.tabs.home'),
  } satisfies Record<HomeTabId, string>), [t]);

  const orderedTabIds = useMemo(
    () => getHomeTabOrder(homeTabWeights),
    [homeTabWeights],
  );
  const orderedTabIdsRef = useRef(orderedTabIds);
  orderedTabIdsRef.current = orderedTabIds;
  const leftmostTabId = orderedTabIds[0] ?? 'square';

  // ── 筛选状态 ──
  const [showFilterSent, setShowFilterSent] = useState(true);
  const [showFilterReceived, setShowFilterReceived] = useState(true);
  const [showSquareAll, setShowSquareAll] = useState(false);
  const [showSquareUtf8, setShowSquareUtf8] = useState(true);
  const [showSquareOamp, setShowSquareOamp] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // null = 尚未手动切换，跟随当前最左标签（冷启动/杀进程后重开）
  const [activeTabId, setActiveTabId] = useState<HomeTabId | null>(null);
  const resolvedActiveTabId =
    activeTabId && orderedTabIds.includes(activeTabId) ? activeTabId : leftmostTabId;
  const pagerRef = useRef<TabPagerRef>(null);
  const activeTabIdRef = useRef<HomeTabId>(resolvedActiveTabId);
  activeTabIdRef.current = resolvedActiveTabId;
  const isWriteWalletRef = useRef(isWriteWallet);
  const skipAutoPromptRef = useRef(false);
  const selfDataRef = useRef<InputDataItem[]>([]);
  const homeFocusedRef = useRef(true);
  const prevUnlockedRef = useRef(unlocked);
  const classifyGenRef = useRef(0);

  const [selfData, setSelfData] = useState<InputDataItem[]>([]);
  const [squareData, setSquareData] = useState<InputDataItem[]>([]);
  const [followingRawData, setFollowingRawData] = useState<InputDataItem[]>([]);
  const [sentData, setSentData] = useState<InputDataItem[]>([]);
  const [inboxData, setInboxData] = useState<InputDataItem[]>([]);
  const [loading, setLoading] = useState<Record<HomeTabId, boolean>>(TAB_LOADING_OFF);
  const [refreshing, setRefreshing] = useState<Record<HomeTabId, boolean>>(TAB_LOADING_OFF);
  const [cacheLoaded, setCacheLoaded] = useState<Record<HomeTabId, boolean>>(TAB_LOADING_OFF);
  const [loadingMore, setLoadingMore] = useState<Record<HomeTabId, boolean>>(TAB_LOADING_OFF);
  const [hasMore, setHasMore] = useState<Record<HomeTabId, boolean>>(TAB_HAS_MORE_ON);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const passwordLockRemainingMs = usePasswordLockRemaining(passwordVisible);
  const passwordLocked = passwordLockRemainingMs > 0;

  // 使用 Ref 存储分页参数和状态，避免 loadData 身份变化触发重复请求
  const flatListRefs = useRef<Partial<Record<HomeTabId, FlatList | null>>>({});
  const scrollToTopRef = useRef({
    scrollToTop: () => {
      flatListRefs.current[activeTabIdRef.current]?.scrollToOffset({
        offset: 0,
        animated: true,
      });
    },
  });
  useScrollToTop(scrollToTopRef);
  const nextPageParamsRef = useRef<any[]>([null, null, null, null, null]);
  /** 关注页下一窗的结束区块；null 表示需要先取最新高度或已耗尽 */
  const followingNextEndBlockRef = useRef<number | null>(null);
  const followingIgnoreEndReachedRef = useRef(false);
  const hasMoreRef = useRef<boolean[]>([true, true, true, true, true]);
  const loadingMoreRef = useRef<boolean[]>([false, false, false, false, false]);
  const initialLoadDoneRef = useRef(false);
  const loadGenRef = useRef<number[]>([0, 0, 0, 0, 0]);
  const prevFollowingKeyRef = useRef<string | null>(null);

  // 消息标签页合并显示已发送 + 收到（按 id 去重）
  const messagesData = useMemo(() => {
    const map = new Map<string, InputDataItem>();
    if (showFilterSent) sentData.forEach(i => map.set(i.id, i));
    if (showFilterReceived) inboxData.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) =>
      b.timestamp - a.timestamp
    );
  }, [sentData, inboxData, showFilterSent, showFilterReceived]);

  // 广场 OAMP 筛选：仅接收地址为黑洞地址的交易
  const oampFilteredData = useMemo(() => {
    if (showSquareAll) return squareData;
    return squareData.filter(item => isBlackHoleAddress(item.to || ''));
  }, [squareData, showSquareAll]);

  // 广场 UTF-8 筛选：contentKind 为 UTF-8 的交易
  const utf8FilteredData = useMemo(() => {
    if (showSquareAll) return squareData;
    return squareData.filter(item => item.contentKind === 'UTF-8');
  }, [squareData, showSquareAll]);

  // 关注页：窗口内 from/to 任一落在关注列表、且 input 非空的交易
  const displayedFollowingData = useMemo(() => {
    const subSet = new Set(subscriptions.map(s => s.address.toLowerCase()));
    return followingRawData.filter(item =>
      subSet.has((item.from || '').toLowerCase()) || subSet.has((item.to || '').toLowerCase()),
    );
  }, [followingRawData, subscriptions]);

  // 根据广场勾选项决定当前显示的数据
  const displayedSquareData = useMemo(() => {
    if (showSquareAll) return squareData;
    const map = new Map<string, InputDataItem>();
    if (showSquareUtf8) utf8FilteredData.forEach(i => map.set(i.id, i));
    if (showSquareOamp) oampFilteredData.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) =>
      b.timestamp - a.timestamp
    );
  }, [squareData, showSquareAll, showSquareUtf8, showSquareOamp, utf8FilteredData, oampFilteredData]);

  // ── 筛选状态持久化 ──
  useEffect(() => {
    AsyncStorage.getItem(FILTER_STATE_KEY).then(raw => {
      if (raw) {
        try {
          const s = JSON.parse(raw);
          if (typeof s.showFilterSent === 'boolean') setShowFilterSent(s.showFilterSent);
          if (typeof s.showFilterReceived === 'boolean') setShowFilterReceived(s.showFilterReceived);
          if (typeof s.showSquareAll === 'boolean') setShowSquareAll(s.showSquareAll);
          if (typeof s.showSquareUtf8 === 'boolean') setShowSquareUtf8(s.showSquareUtf8);
          if (typeof s.showSquareOamp === 'boolean') setShowSquareOamp(s.showSquareOamp);
        } catch { /* ignore */ }
      }
      setFiltersLoaded(true);
    }).catch(() => setFiltersLoaded(true));
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    AsyncStorage.setItem(FILTER_STATE_KEY, JSON.stringify({
      showFilterSent, showFilterReceived,
      showSquareAll, showSquareUtf8, showSquareOamp,
    })).catch(() => {});
  }, [showFilterSent, showFilterReceived, showSquareAll, showSquareUtf8, showSquareOamp, filtersLoaded]);

  const _loadData = useCallback(async (internalIndex: number, tabId: HomeTabId, isRefreshing = false, isLoadMore = false) => {
    const modeMap: ('square' | 'sent' | 'inbox' | 'self' | 'following')[] = ['square', 'sent', 'inbox', 'self', 'following'];
    const mode = modeMap[internalIndex];

    if (mode !== 'square' && mode !== 'following' && !profile?.address) return;

    // 如果是加载更多，但已经没有更多了，或者正在加载中，则返回
    if (isLoadMore && (!hasMoreRef.current[internalIndex] || loadingMoreRef.current[internalIndex])) return;

    // 非加载更多（即刷新或初次加载）时，清除之前会话中可能因网络问题被跳过的数据源
    if (!isLoadMore) {
      dataSourceManager.clearSkipped();
    }

    const loadGen = isLoadMore
      ? loadGenRef.current[internalIndex]
      : ++loadGenRef.current[internalIndex];
    const isStale = () => loadGen !== loadGenRef.current[internalIndex];

    if (isRefreshing) {
      setRefreshing((prev) => ({ ...prev, [tabId]: true }));
      // 下拉刷新重置分页
      nextPageParamsRef.current[internalIndex] = null;
      if (mode === 'following') followingNextEndBlockRef.current = null;
      hasMoreRef.current[internalIndex] = true;
      setHasMore(prev => ({ ...prev, [tabId]: true }));
    } else if (isLoadMore) {
      loadingMoreRef.current[internalIndex] = true;
      setLoadingMore(prev => ({ ...prev, [tabId]: true }));
    } else {
      setLoading((prev) => ({ ...prev, [tabId]: true }));
      // 初次加载重置分页
      nextPageParamsRef.current[internalIndex] = null;
      if (mode === 'following') followingNextEndBlockRef.current = null;
      hasMoreRef.current[internalIndex] = true;
      setHasMore(prev => ({ ...prev, [tabId]: true }));
    }

    setError(null);

    const params = nextPageParamsRef.current[internalIndex];

    try {
      let resultItems: InputDataItem[] = [];
      let nextParams: any = null;
      let allErrors: string[] = [];
      let rawTxs: any[] = [];

      if (mode === 'square') {
        const withBlackHolePageSize = (pageParams: any) => ({
          ...(pageParams && typeof pageParams === 'object' ? pageParams : { page: '1' }),
          offset: String(BLACK_HOLE_PAGE_SIZE),
          items_count: String(BLACK_HOLE_PAGE_SIZE),
        });

        /** 只查黑洞：大页 + 过滤后空页最多再续拉 BLACK_HOLE_EMPTY_CONTINUE_PAGES 次 */
        let pageParams = withBlackHolePageSize(isLoadMore ? params : null);
        const collected: InputDataItem[] = [];
        const collectedRaw: any[] = [];
        const errors: string[] = [];
        let lastNext: any = null;
        let pages = 0;
        const maxPages = 1 + BLACK_HOLE_EMPTY_CONTINUE_PAGES;

        do {
          const res = await dataSourceManager.fetchAll(BLACK_HOLE_ADDRESS, 'square', pageParams).catch(e => {
            const message = e instanceof Error ? e.message : String(e);
            return { items: [] as InputDataItem[], rawTransactions: [], next_page_params: null, errors: [message] };
          });
          res.items.forEach(i => collected.push(i));
          if (res.rawTransactions) collectedRaw.push(...res.rawTransactions);
          if (res.errors) errors.push(...res.errors);
          lastNext = res.next_page_params ?? null;
          pages += 1;
          if (collected.length > 0) break;
          if (!lastNext) break;
          pageParams = withBlackHolePageSize(lastNext);
        } while (pages < maxPages);

        if (errors.length) allErrors = errors;
        nextParams = lastNext;
        resultItems = collected.sort((a, b) => b.timestamp - a.timestamp);
        rawTxs = collectedRaw;
      } else if (mode === 'following') {
        const seen = new Set<string>();
        const followedLower = new Set<string>();
        subscriptions.forEach(s => {
          const trimmed = s.address?.trim();
          if (!trimmed) return;
          const key = trimmed.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          followedLower.add(key);
        });

        if (followedLower.size === 0) {
          followingNextEndBlockRef.current = null;
          nextParams = null;
          resultItems = [];
        } else if (isLoadMore && followingNextEndBlockRef.current == null) {
          nextParams = null;
          resultItems = [];
        } else {
          const windowEnd = isLoadMore
            ? followingNextEndBlockRef.current!
            : await fetchLatestBlockNumberViaRpc();
          const window = makeBlockWindow(windowEnd, FOLLOWING_BLOCK_WINDOW);

          // 先把这一窗区块的交易完整拉回，再在内存里筛关注地址 + 非空 input。
          const windowTxs = await fetchBlockWindowTransactions(window.startBlock, window.endBlock);
          rawTxs = windowTxs;
          const matched = filterFollowedWithInput(windowTxs, followedLower);
          resultItems = matched
            .map(tx => mapToInputDataItem(tx, 'all', '', formatListTimestamp, shortenAddress))
            .sort((a, b) => b.timestamp - a.timestamp);

          nextParams = window.nextEndBlock != null ? { endBlock: window.nextEndBlock } : null;
          followingIgnoreEndReachedRef.current = resultItems.length === 0;
          followingNextEndBlockRef.current = window.nextEndBlock;
        }
      } else {
        // Other modes: single address fetch
        const result = await dataSourceManager.fetchAll(profile!.address, mode, params);
        resultItems = result.items;
        nextParams = result.next_page_params;
        rawTxs = result.rawTransactions || [];
        if (result.errors) allErrors = result.errors;
      }

      if (isStale()) return;

      // Save new data to cache
      if (rawTxs.length > 0) {
        const saveToCache = (address: string, txs: typeof rawTxs) => {
          cacheService.saveTransactions(address, txs).catch((e) => {
            console.warn(`Failed to save cache for ${address}:`, e);
          });
        };
        if (mode === 'square') {
          saveToCache(BLACK_HOLE_ADDRESS, rawTxs);
        } else if (mode === 'following') {
          for (const s of subscriptions) {
            const addr = s.address.toLowerCase();
            const relevantTxs = rawTxs.filter(tx => tx.fromLower === addr || tx.toLower === addr);
            if (relevantTxs.length > 0) {
              saveToCache(addr, relevantTxs);
            }
          }
        } else {
          saveToCache(profile!.address, rawTxs);
        }
      }

      if ((mode === 'square' || mode === 'following') && resultItems.length === 0 && allErrors.length > 0) {
        if (allErrors.includes('MISSING_ETHERSCAN_API_KEY')) {
          setSnackbarMessage(t('home.noApiKeyWarning'));
          setSnackbarVisible(true);
        } else {
          setError(allErrors[0] || t('common.errorFetch'));
        }
        return;
      }
      if (allErrors.includes('MISSING_ETHERSCAN_API_KEY')) {
        setSnackbarMessage(t('home.noApiKeyWarning'));
        setSnackbarVisible(true);
      }

      // Apply display pipeline: OAMP → UTF-8 → RAW (encrypted OAMP stops at OAMP_ENCRYPTED)
      let processedItems: InputDataItem[];
      try {
        let client: OAMPClient | null = null;
        if (internalIndex === INTERNAL_SELF) {
          const wallet = getUnlockedWallet();
          if (wallet) {
            client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
          }
        }

        processedItems = await applyDisplayPipeline(resultItems, {
          userAddress: profile?.address,
          client,
        });

        if (internalIndex === INTERNAL_SELF) {
          const latestWallet = getUnlockedWallet();
          if (!!latestWallet !== !!client) {
            processedItems = await applyDisplayPipeline(resultItems, {
              userAddress: profile?.address,
              client: latestWallet
                ? new OAMPClient(latestWallet.privateKey, DEFAULT_RPC_NODE)
                : null,
            });
          }
        }
      } catch (e) {
        console.warn('Display pipeline failed, falling back to RAW:', e);
        processedItems = markAllRaw(resultItems);
      }

      const updateData = (prev: InputDataItem[]) => {
        const map = new Map<string, InputDataItem>();
        prev.forEach(i => map.set(i.id, i));
        processedItems.forEach(i => map.set(i.id, i));
        return Array.from(map.values()).sort((a, b) =>
          b.timestamp - a.timestamp
        );
      };

      if (isLoadMore || (internalIndex === INTERNAL_FOLLOWING)) {
        if (internalIndex === INTERNAL_SQUARE) setSquareData(updateData);
        else if (internalIndex === INTERNAL_SENT) setSentData(updateData);
        else if (internalIndex === INTERNAL_INBOX) setInboxData(updateData);
        else if (internalIndex === INTERNAL_SELF) setSelfData(updateData);
        else if (internalIndex === INTERNAL_FOLLOWING) setFollowingRawData(updateData);
      } else {
        if (internalIndex === INTERNAL_SQUARE) setSquareData(processedItems);
        else if (internalIndex === INTERNAL_SENT) setSentData(processedItems);
        else if (internalIndex === INTERNAL_INBOX) setInboxData(processedItems);
        else if (internalIndex === INTERNAL_SELF) setSelfData(processedItems);

        if (isRefreshing) {
          setSnackbarMessage(t('home.upToDate'));
          setSnackbarVisible(true);
        }
      }

      nextPageParamsRef.current[internalIndex] = nextParams;
      hasMoreRef.current[internalIndex] = !!nextParams;

      setHasMore(prev => ({ ...prev, [tabId]: !!nextParams }));
    } catch (err: any) {
      if (err.message === 'MISSING_ETHERSCAN_API_KEY') {
        setSnackbarMessage(t('home.setApiKeyHint'));
        setSnackbarVisible(true);
      } else {
        setError(err.message || t('common.errorFetch'));
      }
        } finally {
      if (!isStale()) {
        setLoading((prev) => ({ ...prev, [tabId]: false }));
        setRefreshing((prev) => ({ ...prev, [tabId]: false }));
        loadingMoreRef.current[internalIndex] = false;
        setLoadingMore(prev => ({ ...prev, [tabId]: false }));
      }
    }
  }, [profile?.address, apiKey, subscriptions, t]);

  const loadData = useCallback(async (tabId: HomeTabId, isRefreshing = false, isLoadMore = false) => {
    if (tabId === 'messages') {
      _loadData(INTERNAL_SENT, 'messages', isRefreshing, isLoadMore);
      _loadData(INTERNAL_INBOX, 'messages', isRefreshing, isLoadMore);
      return;
    }
    const tabToInternal: Record<Exclude<HomeTabId, 'messages'>, number> = {
      square: INTERNAL_SQUARE,
      following: INTERNAL_FOLLOWING,
      self: INTERNAL_SELF,
    };
    _loadData(tabToInternal[tabId], tabId, isRefreshing, isLoadMore);
  }, [_loadData]);

  const loadCache = useCallback(async (tabId: HomeTabId) => {
    try {
      if (!(await cacheService.isGlobalCacheEnabled())) {
        return;
      }

      const limit = await cacheService.getDefaultLimit();
      let cachedTxs: any[] = [];
      let items: InputDataItem[] = [];
      let sentItems: InputDataItem[] = [];
      let inboxItems: InputDataItem[] = [];

      if (tabId === 'square') {
        cachedTxs = await cacheService.getTransactions([BLACK_HOLE_ADDRESS], limit);
        items = mapTransactionsToMessages(cachedTxs, BLACK_HOLE_ADDRESS, 'square', formatListTimestamp, shortenAddress);
        if (items.length > 0) setSquareData(items);
      } else if (tabId === 'following') {
        const addresses = subscriptions.map(s => s.address);
        if (addresses.length > 0) {
          cachedTxs = await cacheService.getTransactions(addresses, 50);
          const followedLower = new Set(addresses.map(a => a.toLowerCase()));
          const matched = filterFollowedWithInput(cachedTxs, followedLower);
          items = matched
            .map(tx => mapToInputDataItem(tx, 'all', '', formatListTimestamp, shortenAddress))
            .sort((a, b) => b.timestamp - a.timestamp);
          if (items.length > 0) setFollowingRawData(items);
        }
      } else if (tabId === 'messages') {
        if (profile?.address) {
          const txs = await cacheService.getTransactions([profile.address], limit * 2);
          sentItems = mapTransactionsToMessages(txs, profile.address, 'sent', formatListTimestamp, shortenAddress);
          inboxItems = mapTransactionsToMessages(txs, profile.address, 'inbox', formatListTimestamp, shortenAddress);
          if (sentItems.length > 0) setSentData(sentItems);
          if (inboxItems.length > 0) setInboxData(inboxItems);
        }
      } else if (tabId === 'self') {
        if (profile?.address) {
          cachedTxs = await cacheService.getTransactions([profile.address], limit);
          items = mapTransactionsToMessages(cachedTxs, profile.address, 'self', formatListTimestamp, shortenAddress);
          if (items.length > 0) setSelfData(items);
        }
      }

      const hasData = items.length > 0 || sentItems.length > 0 || inboxItems.length > 0;
      if (hasData) {
        try {
          let client: OAMPClient | null = null;
          if (tabId === 'self' || tabId === 'messages') {
            const wallet = getUnlockedWallet();
            if (wallet) {
              client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
            }
          }

          if (tabId === 'messages') {
            const [pSent, pInbox] = await Promise.all([
              applyDisplayPipeline(sentItems, { userAddress: profile?.address, client }),
              applyDisplayPipeline(inboxItems, { userAddress: profile?.address, client }),
            ]);
            setSentData(pSent);
            setInboxData(pInbox);
          } else {
            const processed = await applyDisplayPipeline(items, {
              userAddress: profile?.address,
              client,
            });
            if (tabId === 'square') setSquareData(processed);
            else if (tabId === 'following') setFollowingRawData(processed);
            else if (tabId === 'self') setSelfData(processed);
          }
        } catch (e) {
          console.warn('Cache display pipeline failed:', e);
        }
      }
    } catch (e) {
      console.warn(`Cache load failed for tab ${tabId}:`, e);
    } finally {
      setCacheLoaded(prev => ({ ...prev, [tabId]: true }));
    }
  }, [profile?.address, subscriptions]);

  const reclassifySelfData = useCallback(async (withClient: boolean) => {
    const gen = ++classifyGenRef.current;
    const items = selfDataRef.current;
    if (items.length === 0) return;
    try {
      let client: OAMPClient | null = null;
      if (withClient) {
        const wallet = getUnlockedWallet();
        if (wallet) {
          client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
        }
      }
      const processed = await applyDisplayPipeline(items, {
        userAddress: profile?.address,
        client,
      });
      if (gen !== classifyGenRef.current) return;
      setSelfData(processed);
    } catch (e) {
      console.warn('Failed to reclassify self list:', e);
    }
  }, [profile?.address]);

  useEffect(() => {
    isWriteWalletRef.current = isWriteWallet;
  }, [isWriteWallet]);

  useEffect(() => {
    selfDataRef.current = selfData;
  }, [selfData]);

  useEffect(() => {
    const wasUnlocked = prevUnlockedRef.current;
    prevUnlockedRef.current = unlocked;

    if (wasUnlocked && !unlocked) {
      classifyGenRef.current += 1;
      setSelfData((prev) => {
        const wiped = wipeDecryptedItems(prev);
        selfDataRef.current = wiped;
        return wiped;
      });
      reclassifySelfData(false);
      if (
        homeFocusedRef.current &&
        activeTabIdRef.current === 'self' &&
        isWriteWalletRef.current &&
        !skipAutoPromptRef.current
      ) {
        setPasswordVisible(true);
      }
      return;
    }

    if (!wasUnlocked && unlocked) {
      reclassifySelfData(true);
    }
  }, [unlocked, reclassifySelfData]);

  const applyTabIndex = useCallback((next: number) => {
    const nextId = orderedTabIdsRef.current[next];
    if (!nextId || nextId === activeTabIdRef.current) return;
    const fromId = activeTabIdRef.current;
    activeTabIdRef.current = nextId;
    setActiveTabId(nextId);

    if (nextId === 'self') {
      skipAutoPromptRef.current = false;
      if (isWriteWalletRef.current && !isSessionUnlocked()) {
        setPasswordVisible(true);
      }
    } else if (fromId === 'self' && isDesktopLockPolicy()) {
      skipAutoPromptRef.current = false;
      setPasswordVisible(false);
      setPassword('');
      setPasswordError(null);
      lock();
    }
  }, [lock]);

  const handleUnlock = async () => {
    if (passwordLocked) return;
    if (!password) {
      setPasswordError(t('send.passwordLabel'));
      return;
    }
    setUnlocking(true);
    setPasswordError(null);
    try {
      await unlock(password);
      skipAutoPromptRef.current = false;
      setPasswordVisible(false);
      setPassword('');
    } catch (e: any) {
      if (e?.name === NO_KEYSTORE_ERROR) {
        setPasswordError(t('send.noPrivateKey'));
      } else if (e?.name === PASSWORD_LOCKED_ERROR) {
        setPasswordError(null);
      } else if (e?.name === INVALID_PASSWORD_ERROR) {
        setPasswordError(t('home.passwordIncorrect'));
      } else {
        setPasswordError(t('home.passwordIncorrect'));
      }
    } finally {
      setUnlocking(false);
    }
  };

  const dismissPasswordDialog = () => {
    if (unlocking) return;
    skipAutoPromptRef.current = true;
    setPasswordVisible(false);
    setPassword('');
    setPasswordError(null);
  };

  useEffect(() => {
    if (contextLoading || !filtersLoaded || initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    (async () => {
      // Load from cache first for all tabs and wait for completion
      await Promise.all([
        loadCache('square'),
        loadCache('following'),
        loadCache('messages'),
        loadCache('self'),
      ]);

      // Then trigger network load
      loadData('square');
      loadData('following');
      loadData('messages');
      loadData('self');
    })();
  }, [contextLoading, filtersLoaded, loadData, loadCache]);

  useEffect(() => {
    if (contextLoading || activeTabId != null) return;
    setActiveTabId(leftmostTabId);
  }, [contextLoading, activeTabId, leftmostTabId]);

  useEffect(() => {
    if (
      resolvedActiveTabId === 'self' &&
      homeFocusedRef.current &&
      isWriteWallet &&
      !isSessionUnlocked() &&
      !skipAutoPromptRef.current
    ) {
      setPasswordVisible(true);
    }
  }, [resolvedActiveTabId, isWriteWallet]);

  const followingQueryKey = useMemo(
    () => subscriptions.map(s => s.address.trim().toLowerCase()).filter(Boolean).sort().join(','),
    [subscriptions],
  );

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (prevFollowingKeyRef.current === null) {
      prevFollowingKeyRef.current = followingQueryKey;
      return;
    }
    if (prevFollowingKeyRef.current === followingQueryKey) return;
    prevFollowingKeyRef.current = followingQueryKey;
    loadData('following');
  }, [followingQueryKey, loadData]);

  useFocusEffect(
    useCallback(() => {
      homeFocusedRef.current = true;
      if (
        activeTabIdRef.current === 'self' &&
        isWriteWalletRef.current &&
        !isSessionUnlocked()
      ) {
        skipAutoPromptRef.current = false;
        setPasswordVisible(true);
      }
      return () => {
        homeFocusedRef.current = false;
        if (isDesktopLockPolicy()) {
          skipAutoPromptRef.current = false;
          setPasswordVisible(false);
          setPassword('');
          setPasswordError(null);
          lock();
        }
      };
    }, [lock]),
  );

  const skipPageEventRef = useRef(false);

  useEffect(() => {
    skipPageEventRef.current = true;
    const timer = setTimeout(() => {
      skipPageEventRef.current = false;
    }, 400);
    return () => clearTimeout(timer);
  }, [orderedTabIds]);

  const onTabPress = (index: number) => {
    skipPageEventRef.current = false;
    applyTabIndex(index);
    pagerRef.current?.setPage(index);
  };

  const onPageSelected = (e: any) => {
    if (skipPageEventRef.current) return;
    applyTabIndex(e.nativeEvent.position);
  };

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarMessage(t('common.copied'));
    setSnackbarVisible(true);
  }, [t]);

  const handleItemPress = useCallback(
    (item: InputDataItem) => {
      navigation.navigate('InputDataDetail', { item });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: InputDataItem }) => (
      <InputDataCard
        item={item}
        cardWidth={cardWidth}
        onPress={() => handleItemPress(item)}
      />
    ),
    [cardWidth, handleItemPress],
  );

  const keyExtractor = useCallback((item: InputDataItem) => item.id, []);

  const renderList = (data: InputDataItem[], tabId: HomeTabId) => {
    const isSquareList = tabId === 'square';
    const isFollowingList = tabId === 'following';
    const isMessagesList = tabId === 'messages';
    const isSelfList = tabId === 'self';

    if (!isSquareList && !isFollowingList && !profile?.address) {
      return (
        <View style={styles.centerContainer}>
          <Text variant="bodyLarge" style={{ color: theme.colors.error, textAlign: 'center', padding: 20 }}>
            {t('home.noAddressError')}
          </Text>
        </View>
      );
    }

    if (isSelfList && profile?.address && !isWriteWallet) {
      return (
        <View style={styles.centerContainer}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', padding: 20 }}>
            {t('home.readOnlyCannotDecrypt')}
          </Text>
        </View>
      );
    }

    if (isSelfList && isWriteWallet && !unlocked) {
      return (
        <View style={styles.centerContainer}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', padding: 20 }}>
            {t('home.unlockHint')}
          </Text>
          <Button mode="contained" onPress={() => {
            skipAutoPromptRef.current = false;
            setPasswordError(null);
            setPasswordVisible(true);
          }}>
            {t('home.unlockButton')}
          </Button>
        </View>
      );
    }

    const isMsgLoading = loading[tabId];
    const isMsgRefreshing = refreshing[tabId];

    if (isMsgLoading && !isMsgRefreshing && data.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12 }}>{t('home.loadingData', { tab: tabLabels[tabId] })}</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={(ref) => { flatListRefs.current[tabId] = ref; }}
        style={scrollFill}
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listContent, listContentStyle]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          Platform.OS !== 'web' ? (
            <RefreshControl
              refreshing={isMsgRefreshing}
              onRefresh={() => loadData(tabId, true)}
              colors={[theme.colors.primary]}
              enabled={true}
            />
          ) : undefined
        }
        onEndReached={() => {
          if (isFollowingList && (data.length === 0 || followingIgnoreEndReachedRef.current)) return;
          loadData(tabId, false, true);
        }}
        onEndReachedThreshold={0.2}
        onScrollBeginDrag={() => {
          if (isFollowingList) followingIgnoreEndReachedRef.current = false;
        }}
        ListFooterComponent={
          data.length > 0 ? (
            <View style={styles.footerContainer}>
              {loadingMore[tabId] ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (isMessagesList ? (!hasMoreRef.current[INTERNAL_SENT] && !hasMoreRef.current[INTERNAL_INBOX]) : !hasMore[tabId]) ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('home.noMoreData')}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {isFollowingList && loadingMore[tabId] ? (
              <>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodyMedium" style={{ marginTop: 12 }}>
                  {t('home.followingLoadingOlder', { count: FOLLOWING_BLOCK_WINDOW })}
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodyMedium">
                  {isFollowingList && subscriptions.length === 0
                    ? t('subscriptions.noSubscriptions')
                    : isFollowingList
                      ? t('home.followingEmptyWindow', { count: FOLLOWING_BLOCK_WINDOW })
                      : t('home.noMessages')}
                </Text>
                {isFollowingList && subscriptions.length > 0 && hasMore[tabId] ? (
                  <Button
                    mode="text"
                    onPress={() => loadData(tabId, false, true)}
                    style={{ marginTop: 8 }}
                  >
                    {t('home.followingLoadOlder', { count: FOLLOWING_BLOCK_WINDOW })}
                  </Button>
                ) : null}
              </>
            )}
          </View>
        }
        ListHeaderComponent={
          <View>
            {isMessagesList && (
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowFilterSent(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showFilterSent ? 'checked' : 'unchecked'}
                    onPress={() => setShowFilterSent(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterSent')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowFilterReceived(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showFilterReceived ? 'checked' : 'unchecked'}
                    onPress={() => setShowFilterReceived(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterReceived')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {isSquareList && (
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowSquareAll(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showSquareAll ? 'checked' : 'unchecked'}
                    onPress={() => setShowSquareAll(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowSquareUtf8(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showSquareUtf8 ? 'checked' : 'unchecked'}
                    onPress={() => setShowSquareUtf8(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterUTF8')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowSquareOamp(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showSquareOamp ? 'checked' : 'unchecked'}
                    onPress={() => setShowSquareOamp(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterOAMP')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* headerRow 已隐藏
            <View style={[styles.headerRow, columnStyle]}>
              <View>
                {(isSelfList || isMessagesList) && profile?.address && (
                  <CopyableAddress
                    address={profile.address}
                    variant="labelSmall"
                    style={{ color: theme.colors.primary }}
                    onCopied={showCopiedSnackbar}
                  >
                    {shortenAddress(profile.address)}
                  </CopyableAddress>
                )}
                {isSquareList && (
                  showSquareAll ? (
                    <CopyableAddress
                      address={BLACK_HOLE_ADDRESS}
                      variant="labelSmall"
                      style={{ color: theme.colors.secondary }}
                      onCopied={showCopiedSnackbar}
                    >
                      {t('home.sentTo')}: {t('send.recipientBlackHole')} {subscriptions.length > 0 ? `+ ${subscriptions.length} ${t('nav.subscriptions')}` : ''}
                    </CopyableAddress>
                  ) : (
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {showSquareOamp && t('home.tabs.filterOAMP')}
                    </Text>
                  )
                )}
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {t('home.totalItems', { count: data.length })}
              </Text>
            </View>
            */}
          </View>
        }
      />
    );
  };

  const activeTabIndex = Math.max(0, orderedTabIds.indexOf(resolvedActiveTabId));

  const isCurrentRefreshing = useMemo(() => {
    return !!refreshing[resolvedActiveTabId];
  }, [resolvedActiveTabId, refreshing]);

  const onFabPress = () => {
    if (!profile) {
      setSnackbarMessage(t('home.noAddressError'));
      setSnackbarVisible(true);
      return;
    }

    if (profile.walletType === 'read') {
      setDialogVisible(true);
    } else {
      navigation.navigate('SendData');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={headerChrome.backgroundColor} translucent />
      {/* 自定义 TabBar */}
      <View style={{ backgroundColor: headerChrome.backgroundColor, paddingTop: insets.top }}>
        <View style={[
          styles.tabBar,
          { backgroundColor: headerChrome.backgroundColor, borderBottomColor: theme.colors.outline + '20' },
          centered && { width: '50%', alignSelf: 'center' },
        ]}>
          {orderedTabIds.map((tabId, index) => (
            <TouchableOpacity
              key={tabId}
              onPress={() => onTabPress(index)}
              style={[
                styles.tabItem,
                resolvedActiveTabId === tabId && { borderBottomColor: tabIndicatorColor },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: resolvedActiveTabId === tabId ? tabActiveColor : tabInactiveColor, fontSize: Math.round(14 * fontScale) },
                  resolvedActiveTabId === tabId && styles.activeTabText,
                ]}
              >
                {tabLabels[tabId]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TabPager
        key={orderedTabIds.join('-')}
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={activeTabIndex}
        onPageSelected={onPageSelected}
      >
        {orderedTabIds.map((tabId) => (
          <View key={tabId} style={scrollFill}>
            {tabId === 'square' && renderList(displayedSquareData, 'square')}
            {tabId === 'following' && renderList(displayedFollowingData, 'following')}
            {tabId === 'messages' && renderList(messagesData, 'messages')}
            {tabId === 'self' && renderList(selfData, 'self')}
          </View>
        ))}
      </TabPager>

      {error && (
        <View style={[styles.errorBar, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }}>{error}</Text>
          <Button onPress={() => loadData(resolvedActiveTabId)}>{t('home.retry')}</Button>
        </View>
      )}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={styles.snackbar}
        action={
          !apiKey
            ? {
                label: t('home.goToSettings'),
                onPress: () => {
                  navigation.navigate('Profile' as any);
                },
              }
            : undefined
        }
      >
        {snackbarMessage}
      </Snackbar>

      <AppModal
        visible={dialogVisible}
        onDismiss={() => setDialogVisible(false)}
        title={t('common.tip')}
        actions={[{ label: t('common.ok'), onPress: () => setDialogVisible(false) }]}
      >
        <Text variant="bodyMedium">
          {t('home.readOnlyWalletTip')}
        </Text>
      </AppModal>

      <AppModal
        visible={passwordVisible}
        onDismiss={dismissPasswordDialog}
        dismissable={!unlocking}
        title={t('send.passwordTitle')}
        actions={[
          { label: t('common.cancel'), onPress: dismissPasswordDialog, disabled: unlocking },
          {
            label: t('common.ok'),
            onPress: handleUnlock,
            loading: unlocking,
            disabled: unlocking || passwordLocked,
          },
        ]}
      >
        <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
          {t('home.unlockHint')}
        </Text>
        <PaperTextInput
          label={t('send.passwordLabel')}
          secureTextEntry
          keyboardType="numeric"
          maxLength={16}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(null);
          }}
          autoFocus
          error={!!passwordError || passwordLocked}
          disabled={unlocking || passwordLocked}
        />
        {passwordLocked ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
            {t('home.passwordLocked', { seconds: Math.ceil(passwordLockRemainingMs / 1000) })}
          </Text>
        ) : passwordError ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
            {passwordError}
          </Text>
        ) : null}
      </AppModal>

      <FAB
        icon={isCurrentRefreshing ? 'autorenew' : 'refresh'}
        style={[styles.fabRefresh, { backgroundColor: theme.colors.secondaryContainer }, centered && { marginRight: '25%' }]}
        onPress={() => loadData(resolvedActiveTabId, true)}
        disabled={isCurrentRefreshing}
        color={theme.colors.onSecondaryContainer}
        small
      />
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }, centered && { marginRight: '25%' }]}
        onPress={onFabPress}
        color="white"
        small
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '700',
  },
  pagerView: {
    flex: 1,
    minHeight: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingHorizontal: 16,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 16,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    height: 12,
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snackbar: {
    bottom: 20,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  fabRefresh: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 56,
  },
});

