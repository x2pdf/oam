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
import { InputDataCard } from '../components/InputDataCard';
import { CopyableAddress } from '../components/CopyableAddress';
import { shortenAddress, BLACK_HOLE_ADDRESS } from '../utils/address';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FILTER_STATE_KEY, getHomeTabOrder, type HomeTabId } from '../constants';
import { useThemePreference } from '../context/ThemeContext';
import { isBlackHoleAddress } from '../utils/address';
import { cacheService } from '../datasource/cacheService';
import { dataRepository } from '../datasource/DataRepository';
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
import { useOutlineFrameStyle } from '../theme/surfaces';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  主页屏幕                                                           */
/* ------------------------------------------------------------------ */

export default function HomeScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { centered, cardWidth, listContentStyle, columnStyle } = useListColumnLayout();
  const outlineFrameStyle = useOutlineFrameStyle();
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

  // ── 仓库状态订阅 ──
  const [repoState, setRepoState] = useState(() => ({
    square: dataRepository.getState('square'),
    following: dataRepository.getState('following'),
    messages: dataRepository.getState('messages'),
    self: dataRepository.getState('self'),
  }));

  useEffect(() => {
    return dataRepository.subscribe((tabId) => {
      setRepoState(prev => ({
        ...prev,
        [tabId]: dataRepository.getState(tabId),
      }));
    });
  }, []);

  // ── 筛选状态 ──
  const [showFilterSent, setShowFilterSent] = useState(true);
  const [showFilterReceived, setShowFilterReceived] = useState(true);
  const [showSquareAll, setShowSquareAll] = useState(false);
  const [showSquareUtf8, setShowSquareUtf8] = useState(true);
  const [showSquareOamp, setShowSquareOamp] = useState(true);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const [activeTabId, setActiveTabId] = useState<HomeTabId | null>(null);
  const [activatedTabs, setActivatedTabs] = useState<Set<HomeTabId>>(new Set());

  const resolvedActiveTabId =
    activeTabId && orderedTabIds.includes(activeTabId) ? activeTabId : leftmostTabId;
  const pagerRef = useRef<TabPagerRef>(null);
  const activeTabIdRef = useRef<HomeTabId>(resolvedActiveTabId);
  activeTabIdRef.current = resolvedActiveTabId;
  const isWriteWalletRef = useRef(isWriteWallet);
  const skipAutoPromptRef = useRef(false);
  const homeFocusedRef = useRef(true);
  const prevUnlockedRef = useRef(unlocked);
  const classifyGenRef = useRef(0);

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

  const initialLoadDoneRef = useRef(false);
  const prevFollowingKeyRef = useRef<string | null>(null);

  // 消息标签页合并显示已发送 + 收到（按 id 去重）
  const messagesData = useMemo(() => {
    const data = repoState.messages.data;
    const map = new Map<string, InputDataItem>();
    data.forEach(item => {
      const isSent = (item.from || '').toLowerCase() === (profile?.address || '').toLowerCase();
      const isInbox = (item.to || '').toLowerCase() === (profile?.address || '').toLowerCase();
      if (showFilterSent && isSent) map.set(item.id, item);
      else if (showFilterReceived && isInbox) map.set(item.id, item);
    });
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [repoState.messages.data, profile?.address, showFilterSent, showFilterReceived]);

  // 广场 OAMP 筛选：仅接收地址为黑洞地址的交易
  const oampFilteredData = useMemo(() => {
    const squareData = repoState.square.data;
    if (showSquareAll) return squareData;
    return squareData.filter(item => isBlackHoleAddress(item.to || ''));
  }, [repoState.square.data, showSquareAll]);

  // 广场 UTF-8 筛选：contentKind 为 UTF-8 的交易
  const utf8FilteredData = useMemo(() => {
    const squareData = repoState.square.data;
    if (showSquareAll) return squareData;
    return squareData.filter(item => item.contentKind === 'UTF-8');
  }, [repoState.square.data, showSquareAll]);

  // 关注页：窗口内 from/to 任一落在关注列表、且 input 非空的交易
  const displayedFollowingData = useMemo(() => {
    const followingRawData = repoState.following.data;
    const subSet = new Set(subscriptions.map(s => s.address.toLowerCase()));
    return followingRawData.filter(item =>
      subSet.has((item.from || '').toLowerCase()) || subSet.has((item.to || '').toLowerCase()),
    );
  }, [repoState.following.data, subscriptions]);

  // 根据广场勾选项决定当前显示的数据
  const displayedSquareData = useMemo(() => {
    const squareData = repoState.square.data;
    if (showSquareAll) return squareData;
    const map = new Map<string, InputDataItem>();
    if (showSquareUtf8) utf8FilteredData.forEach(i => map.set(i.id, i));
    if (showSquareOamp) oampFilteredData.forEach(i => map.set(i.id, i));
    return Array.from(map.values()).sort((a, b) =>
      b.timestamp - a.timestamp
    );
  }, [repoState.square.data, showSquareAll, showSquareUtf8, showSquareOamp, utf8FilteredData, oampFilteredData]);

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

  const triggerRefresh = useCallback((tabId: HomeTabId) => {
    dataRepository.refresh(tabId, profile?.address, subscriptions).catch(err => {
      console.warn(`Refresh failed for ${tabId}:`, err);
    });
  }, [profile?.address, subscriptions]);

  const triggerLoadMore = useCallback((tabId: HomeTabId) => {
    dataRepository.loadMore(tabId, profile?.address, subscriptions).catch(err => {
      console.warn(`LoadMore failed for ${tabId}:`, err);
    });
  }, [profile?.address, subscriptions]);

  useEffect(() => {
    isWriteWalletRef.current = isWriteWallet;
  }, [isWriteWallet]);

  useEffect(() => {
    const wasUnlocked = prevUnlockedRef.current;
    prevUnlockedRef.current = unlocked;

    if (wasUnlocked && !unlocked) {
      // Reprocess all data to wipe decrypted content
      dataRepository.reprocessAll(profile?.address);

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
      dataRepository.reprocessAll(profile?.address);
    }
  }, [unlocked, profile?.address]);

  const activateTab = useCallback(async (tabId: HomeTabId) => {
    if (activatedTabs.has(tabId)) return;
    setActivatedTabs(prev => new Set(prev).add(tabId));

    // 1. Initial load from cache
    await dataRepository.initializeTab(tabId, profile?.address, subscriptions);
    // 2. Trigger network refresh
    triggerRefresh(tabId);
  }, [activatedTabs, profile?.address, subscriptions, triggerRefresh]);

  const applyTabIndex = useCallback((next: number) => {
    const nextId = orderedTabIdsRef.current[next];
    if (!nextId || nextId === activeTabIdRef.current) return;
    const fromId = activeTabIdRef.current;
    activeTabIdRef.current = nextId;
    setActiveTabId(nextId);

    // Activate tab on demand
    activateTab(nextId);

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
  }, [lock, activateTab]);

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

    // Activate the leftmost tab on startup
    activateTab(leftmostTabId);
  }, [contextLoading, filtersLoaded, leftmostTabId, activateTab]);

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
    triggerRefresh('following');
  }, [followingQueryKey, triggerRefresh]);

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
    const state = repoState[tabId];

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

    if ((state.loading || state.refreshing) && data.length === 0) {
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
              refreshing={state.refreshing}
              onRefresh={() => triggerRefresh(tabId)}
              colors={[theme.colors.primary]}
              enabled={true}
            />
          ) : undefined
        }
        onEndReached={() => {
          if (!state.hasMore || state.loadingMore) return;
          triggerLoadMore(tabId);
        }}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          data.length > 0 || state.hasMore ? (
            <View style={styles.footerContainer}>
              {state.loadingMore ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : state.hasMore ? (
                <Button mode="text" onPress={() => triggerLoadMore(tabId)}>
                  {t('home.loadMore')}
                </Button>
              ) : !state.hasMore && data.length > 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('home.noMoreData')}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {state.loadingMore ? (
              <>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodyMedium" style={{ marginTop: 12 }}>
                  {t('home.loadingData', { tab: tabLabels[tabId] })}
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodyMedium">
                  {isFollowingList && subscriptions.length === 0
                    ? t('subscriptions.noSubscriptions')
                    : isFollowingList
                      ? t('home.followingEmpty')
                      : t('home.noMessages')}
                </Text>
                {state.hasMore ? (
                  <Button
                    mode="text"
                    onPress={() => triggerLoadMore(tabId)}
                    style={{ marginTop: 8 }}
                  >
                    {t('home.loadMore')}
                  </Button>
                ) : null}
              </>
            )}
          </View>
        }
        ListHeaderComponent={
          <View>
            {isMessagesList && (
              <View style={[columnStyle, outlineFrameStyle, styles.filterFrame]}>
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
              </View>
            )}
            {isSquareList && (
              <View style={[columnStyle, outlineFrameStyle, styles.filterFrame]}>
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

  const [activeRefreshing, setActiveRefreshing] = useState(false);
  useEffect(() => {
    setActiveRefreshing(!!repoState[resolvedActiveTabId].refreshing);
  }, [resolvedActiveTabId, repoState]);

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
            {tabId === 'self' && renderList(repoState.self.data, 'self')}
          </View>
        ))}
      </TabPager>

      {repoState[resolvedActiveTabId].error && (
        <View style={[styles.errorBar, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }}>{repoState[resolvedActiveTabId].error}</Text>
          <Button onPress={() => triggerRefresh(resolvedActiveTabId)}>{t('home.retry')}</Button>
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
        icon={activeRefreshing ? 'autorenew' : 'refresh'}
        style={[styles.fabRefresh, { backgroundColor: theme.colors.secondaryContainer }, centered && { marginRight: '25%' }]}
        onPress={() => triggerRefresh(resolvedActiveTabId)}
        disabled={activeRefreshing}
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
  filterFrame: {
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 16,
    borderRadius: 12,
    overflow: 'hidden',
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

