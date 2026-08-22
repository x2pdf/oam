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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
import { FILTER_STATE_KEY } from '../constants';
import { useThemePreference } from '../context/ThemeContext';
import { isBlackHoleAddress } from '../utils/address';
import {
  isDesktopLockPolicy,
  useWalletSession,
} from '../wallet/WalletSessionContext';
import {
  getUnlockedWallet,
  isSessionUnlocked,
  INVALID_PASSWORD_ERROR,
  NO_KEYSTORE_ERROR,
} from '../wallet/session';
import { AppModal } from '../components/AppModal';
import { getHeaderChrome } from '../theme';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  常量与类型                                                         */
/* ------------------------------------------------------------------ */

const SELF_TAB_INDEX = 2;

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

export default function HomeScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { cardWidth, listContentStyle, columnStyle } = useListColumnLayout();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const { apiKey, profile, subscriptions, isLoading: contextLoading } = state;
  const { unlocked, unlock, lock } = useWalletSession();
  const isWriteWallet = profile?.walletType === 'write';

  const headerChrome = getHeaderChrome(theme);
  const tabActiveColor = theme.dark ? theme.colors.onSurface : '#FFFFFF';
  const tabInactiveColor = theme.dark ? theme.colors.onSurfaceVariant : 'rgba(255, 255, 255, 0.7)';
  const tabIndicatorColor = theme.dark ? theme.colors.primary : '#FFFFFF';

  const TABS = useMemo(() => [
    t('home.tabs.square'),
    t('home.tabs.messages'),
    t('home.tabs.home')
  ], [t]);

  // ── 筛选状态 ──
  const [showFilterSent, setShowFilterSent] = useState(true);
  const [showFilterReceived, setShowFilterReceived] = useState(true);
  const [showSquareAll, setShowSquareAll] = useState(false);
  const [showSquareUtf8, setShowSquareUtf8] = useState(true);
  const [showSquareOamp, setShowSquareOamp] = useState(true);
  const [showSquareSubscribed, setShowSquareSubscribed] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<TabPagerRef>(null);
  const activeTabRef = useRef(0);
  const isWriteWalletRef = useRef(isWriteWallet);
  const skipAutoPromptRef = useRef(false);
  const selfDataRef = useRef<InputDataItem[]>([]);
  const homeFocusedRef = useRef(true);
  const prevUnlockedRef = useRef(unlocked);
  const classifyGenRef = useRef(0);

  const [selfData, setSelfData] = useState<InputDataItem[]>([]);
  const [squareData, setSquareData] = useState<InputDataItem[]>([]);
  const [sentData, setSentData] = useState<InputDataItem[]>([]);
  const [inboxData, setInboxData] = useState<InputDataItem[]>([]);
  const [loading, setLoading] = useState([false, false, false]);
  const [refreshing, setRefreshing] = useState([false, false, false]);
  const [loadingMore, setLoadingMore] = useState([false, false, false]);
  const [hasMore, setHasMore] = useState([true, true, true]);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // 使用 Ref 存储分页参数和状态，避免 loadData 身份变化触发重复请求
  const flatListRefs = useRef<(FlatList | null)[]>([null, null, null]);
  const nextPageParamsRef = useRef<any[]>([null, null, null, null]);
  const hasMoreRef = useRef<boolean[]>([true, true, true, true]);
  const loadingMoreRef = useRef<boolean[]>([false, false, false, false]);
  const initialLoadDoneRef = useRef(false);

  // 消息标签页合并显示已发送 + 收到（按 id 去重）
  const messagesData = useMemo(() => {
    const map = new Map<string, InputDataItem>();
    if (showFilterSent) sentData.forEach(i => map.set(i.id, i));
    if (showFilterReceived) inboxData.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
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

  // 广场关注筛选：仅关注列表地址的交易（按 to 地址匹配）
  const subscribedFilteredData = useMemo(() => {
    if (showSquareAll) return squareData;
    const subSet = new Set(subscriptions.map(s => s.address.toLowerCase()));
    return squareData.filter(item => subSet.has((item.to || '').toLowerCase()));
  }, [squareData, showSquareAll, subscriptions]);

  // 根据广场勾选项决定当前显示的数据
  const displayedSquareData = useMemo(() => {
    if (showSquareAll) return squareData;
    const map = new Map<string, InputDataItem>();
    if (showSquareUtf8) utf8FilteredData.forEach(i => map.set(i.id, i));
    if (showSquareOamp) oampFilteredData.forEach(i => map.set(i.id, i));
    if (showSquareSubscribed) subscribedFilteredData.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) =>
      new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
    );
  }, [squareData, showSquareAll, showSquareUtf8, showSquareOamp, showSquareSubscribed, utf8FilteredData, oampFilteredData, subscribedFilteredData]);

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
          if (typeof s.showSquareSubscribed === 'boolean') setShowSquareSubscribed(s.showSquareSubscribed);
        } catch { /* ignore */ }
      }
      setFiltersLoaded(true);
    }).catch(() => setFiltersLoaded(true));
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    AsyncStorage.setItem(FILTER_STATE_KEY, JSON.stringify({
      showFilterSent, showFilterReceived,
      showSquareAll, showSquareUtf8, showSquareOamp, showSquareSubscribed,
    })).catch(() => {});
  }, [showFilterSent, showFilterReceived, showSquareAll, showSquareUtf8, showSquareOamp, showSquareSubscribed, filtersLoaded]);

  const _loadData = useCallback(async (internalIndex: number, uiIndex: number, isRefreshing = false, isLoadMore = false) => {
    const modeMap: ('square' | 'sent' | 'inbox' | 'self')[] = ['square', 'sent', 'inbox', 'self'];
    const mode = modeMap[internalIndex];

    if (mode !== 'square' && !profile?.address) return;

    // 如果是加载更多，但已经没有更多了，或者正在加载中，则返回
    if (isLoadMore && (!hasMoreRef.current[internalIndex] || loadingMoreRef.current[internalIndex])) return;

    if (isRefreshing) {
      setRefreshing((prev) => {
        const next = [...prev];
        next[internalIndex] = true;
        return next;
      });
      // 下拉刷新重置分页
      nextPageParamsRef.current[internalIndex] = null;
      hasMoreRef.current[internalIndex] = true;
      setHasMore(prev => {
        const next = [...prev];
        next[uiIndex] = true;
        return next;
      });
    } else if (isLoadMore) {
      loadingMoreRef.current[internalIndex] = true;
      setLoadingMore(prev => {
        const next = [...prev];
        next[uiIndex] = true;
        return next;
      });
    } else {
      setLoading((prev) => {
        const next = [...prev];
        next[uiIndex] = true;
        return next;
      });
      // 初次加载重置分页
      nextPageParamsRef.current[internalIndex] = null;
      hasMoreRef.current[internalIndex] = true;
      setHasMore(prev => {
        const next = [...prev];
        next[uiIndex] = true;
        return next;
      });
    }

    setError(null);

    const params = nextPageParamsRef.current[internalIndex];

    try {
      let resultItems: InputDataItem[] = [];
      let nextParams: any = null;
      let allErrors: string[] = [];

      if (mode === 'square') {
        // Black hole: mode='square' (仅接收，用于 OAMP)
        // User + Subscriptions: mode='all' (收发，用于 UTF-8 / 关注 / 全部)
        const fetches: Promise<{ items: InputDataItem[]; next_page_params: any; errors?: string[] }>[] = [
          dataSourceManager.fetchAll(BLACK_HOLE_ADDRESS, 'square', params).catch(e => {
            const message = e instanceof Error ? e.message : String(e);
            return { items: [], next_page_params: null, errors: [message] };
          }),
        ];
        if (profile?.address) {
          fetches.push(
            dataSourceManager.fetchAll(profile.address, 'all', params).catch(e => {
              const message = e instanceof Error ? e.message : String(e);
              return { items: [], next_page_params: null, errors: [message] };
            }),
          );
        }
        subscriptions.forEach(s => {
          fetches.push(
            dataSourceManager.fetchAll(s.address, 'all', params).catch(e => {
              const message = e instanceof Error ? e.message : String(e);
              return { items: [], next_page_params: null, errors: [message] };
            }),
          );
        });

        // Concurrent fetch
        const results = await Promise.all(fetches);

        // Merge and deduplicate by ID (tx hash)
        const map = new Map<string, InputDataItem>();
        results.forEach(res => {
          res.items.forEach(item => map.set(item.id, item));
          // Take the first available pagination params
          if (res.next_page_params && !nextParams) nextParams = res.next_page_params;
          if (res.errors) allErrors = [...allErrors, ...res.errors];
        });

        // Sort by time desc
        resultItems = Array.from(map.values()).sort((a, b) =>
          new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
        );
      } else {
        // Other modes: single address fetch
        const result = await dataSourceManager.fetchAll(profile!.address, mode, params);
        resultItems = result.items;
        nextParams = result.next_page_params;
        if (result.errors) allErrors = result.errors;
      }

      if (mode === 'square' && resultItems.length === 0 && allErrors.length > 0) {
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
        if (internalIndex === 3) {
          const wallet = getUnlockedWallet();
          if (wallet) {
            client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
          }
        }

        processedItems = await applyDisplayPipeline(resultItems, {
          userAddress: profile?.address,
          client,
        });

        if (internalIndex === 3) {
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
          new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
        );
      };

      if (isLoadMore) {
        if (internalIndex === 0) setSquareData(updateData);
        else if (internalIndex === 1) setSentData(updateData);
        else if (internalIndex === 2) setInboxData(updateData);
        else if (internalIndex === 3) setSelfData(updateData);
      } else {
        if (internalIndex === 0) setSquareData(processedItems);
        else if (internalIndex === 1) setSentData(processedItems);
        else if (internalIndex === 2) setInboxData(processedItems);
        else if (internalIndex === 3) setSelfData(processedItems);

        if (isRefreshing) {
          setSnackbarMessage(t('home.upToDate'));
          setSnackbarVisible(true);
        }
      }

      nextPageParamsRef.current[internalIndex] = nextParams;
      hasMoreRef.current[internalIndex] = !!nextParams;

      setHasMore(prev => {
        const next = [...prev];
        next[uiIndex] = !!nextParams;
        return next;
      });
    } catch (err: any) {
      if (err.message === 'MISSING_ETHERSCAN_API_KEY') {
        setSnackbarMessage(t('home.setApiKeyHint'));
        setSnackbarVisible(true);
      } else {
        setError(err.message || t('common.errorFetch'));
      }
    } finally {
      setLoading((prev) => {
        const next = [...prev];
        next[uiIndex] = false;
        return next;
      });
      setRefreshing((prev) => {
        const next = [...prev];
        next[internalIndex] = false;
        return next;
      });
      loadingMoreRef.current[internalIndex] = false;
      setLoadingMore(prev => {
        const next = [...prev];
        next[uiIndex] = false;
        return next;
      });
    }
  }, [profile?.address, apiKey, subscriptions, t]);

  const loadData = useCallback(async (tabIndex: number, isRefreshing = false, isLoadMore = false) => {
    // 消息标签页同时加载已发送(internal=1)和收到(internal=2)
    if (tabIndex === 1) {
      _loadData(1, 1, isRefreshing, isLoadMore);
      _loadData(2, 1, isRefreshing, isLoadMore);
      return;
    }
    const uiToInternal: number[] = [0, 1, 3];
    _loadData(uiToInternal[tabIndex], tabIndex, isRefreshing, isLoadMore);
  }, [_loadData]);

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
        activeTabRef.current === SELF_TAB_INDEX &&
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
    const from = activeTabRef.current;
    if (from === next) return;
    activeTabRef.current = next;
    setActiveTab(next);

    if (next === SELF_TAB_INDEX) {
      skipAutoPromptRef.current = false;
      if (isWriteWalletRef.current && !isSessionUnlocked()) {
        setPasswordVisible(true);
      }
    } else if (from === SELF_TAB_INDEX && isDesktopLockPolicy()) {
      skipAutoPromptRef.current = false;
      setPasswordVisible(false);
      setPassword('');
      setPasswordError(null);
      lock();
    }
  }, [lock]);

  const handleUnlock = async () => {
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
    loadData(0);
    loadData(1);
    loadData(2);
  }, [contextLoading, filtersLoaded, loadData]);

  useFocusEffect(
    useCallback(() => {
      homeFocusedRef.current = true;
      if (
        activeTabRef.current === SELF_TAB_INDEX &&
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

  const onTabPress = (index: number) => {
    const isSameTab = activeTabRef.current === index;
    applyTabIndex(index);
    pagerRef.current?.setPage(index);
    // 仅在点击当前已激活的标签页时，列表回到顶部（类似双击行为）
    if (isSameTab) {
      flatListRefs.current[index]?.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const onPageSelected = (e: any) => {
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
    ({ item }: { item: InputDataItem }) => {
      const sub = subscriptions.find(
        (s) => s.address.toLowerCase() === item.address.toLowerCase()
      );
      const displayDesc = sub ? sub.description : item.name;

      return (
        <InputDataCard
          item={{ ...item, name: displayDesc }}
          cardWidth={cardWidth}
          highlightName={!!sub}
          onPress={() => handleItemPress({ ...item, name: displayDesc })}
        />
      );
    },
    [cardWidth, subscriptions, handleItemPress],
  );

  const keyExtractor = useCallback((item: InputDataItem) => item.id, []);

  const renderList = (data: InputDataItem[], tabIndex: number) => {
    const isSquareList = tabIndex === 0;
    const isMessagesList = tabIndex === 1;
    const isSelfList = tabIndex === 2;

    if (!isSquareList && !profile?.address) {
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

    const isMsgLoading = isMessagesList
      ? (loading[1] || loading[2])
      : loading[tabIndex];
    const isMsgRefreshing = isMessagesList
      ? (refreshing[1] || refreshing[2])
      : refreshing[tabIndex];

    if (isMsgLoading && !isMsgRefreshing && data.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12 }}>{t('home.loadingData', { tab: TABS[tabIndex] })}</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={(ref) => { flatListRefs.current[tabIndex] = ref; }}
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
              onRefresh={() => loadData(tabIndex, true)}
              colors={[theme.colors.primary]}
              enabled={true}
            />
          ) : undefined
        }
        onEndReached={() => loadData(tabIndex, false, true)}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          data.length > 0 ? (
            <View style={styles.footerContainer}>
              {loadingMore[tabIndex] ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (isMessagesList ? (!hasMore[1] && !hasMoreRef.current[2]) : !hasMore[tabIndex]) ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('home.noMoreData')}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium">{t('home.noMessages')}</Text>
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
                <TouchableOpacity
                  style={styles.filterItem}
                  onPress={() => setShowSquareSubscribed(prev => !prev)}
                >
                  <Checkbox.Android
                    status={showSquareSubscribed ? 'checked' : 'unchecked'}
                    onPress={() => setShowSquareSubscribed(prev => !prev)}
                    uncheckedColor={theme.colors.outline}
                  />
                  <Text variant="labelMedium">{t('home.tabs.filterSubscribed')}</Text>
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
                      {showSquareOamp && t('home.tabs.filterOAMP')}{showSquareOamp && showSquareSubscribed ? ' + ' : ''}{showSquareSubscribed && t('home.tabs.filterSubscribed')}
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

  const isCurrentRefreshing = useMemo(() => {
    if (activeTab === 1) return refreshing[1] || refreshing[2];
    if (activeTab === 2) return !!refreshing[3];
    return refreshing[0];
  }, [activeTab, refreshing]);

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
        <View style={[styles.tabBar, { backgroundColor: headerChrome.backgroundColor, borderBottomColor: theme.colors.outline + '20' }]}>
          {TABS.map((tab, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => onTabPress(index)}
              style={[
                styles.tabItem,
                activeTab === index && { borderBottomColor: tabIndicatorColor },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === index ? tabActiveColor : tabInactiveColor, fontSize: Math.round(14 * fontScale) },
                  activeTab === index && styles.activeTabText,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TabPager
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={0}
        onPageSelected={onPageSelected}
      >
        <View key="1" style={scrollFill}>{renderList(displayedSquareData, 0)}</View>
        <View key="2" style={scrollFill}>{renderList(messagesData, 1)}</View>
        <View key="3" style={scrollFill}>{renderList(selfData, 2)}</View>
      </TabPager>

      {error && (
        <View style={[styles.errorBar, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }}>{error}</Text>
          <Button onPress={() => loadData(activeTab)}>{t('home.retry')}</Button>
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
          { label: t('common.ok'), onPress: handleUnlock, loading: unlocking, disabled: unlocking },
        ]}
      >
        <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
          {t('home.unlockHint')}
        </Text>
        <PaperTextInput
          label={t('send.passwordLabel')}
          secureTextEntry
          maxLength={16}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(null);
          }}
          autoFocus
          error={!!passwordError}
          disabled={unlocking}
        />
        {passwordError ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
            {passwordError}
          </Text>
        ) : null}
      </AppModal>

      <FAB
        icon={isCurrentRefreshing ? 'autorenew' : 'refresh'}
        style={[styles.fabRefresh, { backgroundColor: theme.colors.secondaryContainer }]}
        onPress={() => loadData(activeTab, true)}
        disabled={isCurrentRefreshing}
        color={theme.colors.onSecondaryContainer}
        small
      />
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
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
    right: 16,
    bottom: 72,
  },
});

