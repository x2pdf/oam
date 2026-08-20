import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme, Button, Snackbar, FAB, TextInput as PaperTextInput } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import TabPager, { TabPagerRef } from '../components/TabPager';
import { useTranslation } from 'react-i18next';
import { InputDataItem, RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { InputDataCard } from '../components/InputDataCard';
import { CopyableAddress } from '../components/CopyableAddress';
import { shortenAddress } from '../utils/address';
import { OAMPClient } from '../oamp/client';
import { applyDisplayPipeline, markAllRaw } from '../display';
import { DEFAULT_RPC_NODE } from '../config/rpcConfig';
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

const BLACK_HOLE_ADDRESS = '0x0000000000000000000000000000000000000000';
const SELF_TAB_INDEX = 3;

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
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
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
    t('home.tabs.sent'),
    t('home.tabs.messages'),
    t('home.tabs.home')
  ], [t]);

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
  const [loading, setLoading] = useState([false, false, false, false]);
  const [refreshing, setRefreshing] = useState([false, false, false, false]);
  const [loadingMore, setLoadingMore] = useState([false, false, false, false]);
  const [hasMore, setHasMore] = useState([true, true, true, true]);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // 使用 Ref 存储分页参数和状态，避免 loadData 身份变化触发重复请求
  const nextPageParamsRef = useRef<any[]>([null, null, null, null]);
  const hasMoreRef = useRef<boolean[]>([true, true, true, true]);
  const loadingMoreRef = useRef<boolean[]>([false, false, false, false]);
  const initialLoadDoneRef = useRef(false);

  const cardWidth = screenWidth - 32;

  const loadData = useCallback(async (tabIndex: number, isRefreshing = false, isLoadMore = false) => {
    const modeMap: ('square' | 'sent' | 'inbox' | 'self')[] = ['square', 'sent', 'inbox', 'self'];
    const mode = modeMap[tabIndex];

    if (mode !== 'square' && !profile?.address) return;

    // 如果是加载更多，但已经没有更多了，或者正在加载中，则返回
    if (isLoadMore && (!hasMoreRef.current[tabIndex] || loadingMoreRef.current[tabIndex])) return;

    if (isRefreshing) {
      setRefreshing((prev) => {
        const next = [...prev];
        next[tabIndex] = true;
        return next;
      });
      // 下拉刷新重置分页
      nextPageParamsRef.current[tabIndex] = null;
      hasMoreRef.current[tabIndex] = true;
      setHasMore(prev => {
        const next = [...prev];
        next[tabIndex] = true;
        return next;
      });
    } else if (isLoadMore) {
      loadingMoreRef.current[tabIndex] = true;
      setLoadingMore(prev => {
        const next = [...prev];
        next[tabIndex] = true;
        return next;
      });
    } else {
      setLoading((prev) => {
        const next = [...prev];
        next[tabIndex] = true;
        return next;
      });
      // 初次加载重置分页
      nextPageParamsRef.current[tabIndex] = null;
      hasMoreRef.current[tabIndex] = true;
      setHasMore(prev => {
        const next = [...prev];
        next[tabIndex] = true;
        return next;
      });
    }

    setError(null);

    const params = nextPageParamsRef.current[tabIndex];

    try {
      let resultItems: InputDataItem[] = [];
      let nextParams: any = null;
      let allErrors: string[] = [];

      if (mode === 'square') {
        // Square mode: fetch Black Hole + all subscriptions
        const targetAddresses = [BLACK_HOLE_ADDRESS, ...subscriptions.map(s => s.address)];

        // Concurrent fetch
        const results = await Promise.all(
          targetAddresses.map(addr => dataSourceManager.fetchAll(addr, mode, params).catch(e => {
            const message = e instanceof Error ? e.message : String(e);
            return { items: [], next_page_params: null, errors: [message] };
          }))
        );

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
        if (tabIndex === SELF_TAB_INDEX) {
          const wallet = getUnlockedWallet();
          if (wallet) {
            client = new OAMPClient(wallet.privateKey, DEFAULT_RPC_NODE);
          }
        }

        processedItems = await applyDisplayPipeline(resultItems, {
          userAddress: profile?.address,
          client,
        });

        if (tabIndex === SELF_TAB_INDEX) {
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
        if (tabIndex === 0) setSquareData(updateData);
        else if (tabIndex === 1) setSentData(updateData);
        else if (tabIndex === 2) setInboxData(updateData);
        else if (tabIndex === 3) setSelfData(updateData);
      } else {
        if (tabIndex === 0) setSquareData(processedItems);
        else if (tabIndex === 1) setSentData(processedItems);
        else if (tabIndex === 2) setInboxData(processedItems);
        else if (tabIndex === 3) setSelfData(processedItems);

        if (isRefreshing) {
          setSnackbarMessage(t('home.upToDate'));
          setSnackbarVisible(true);
        }
      }

      nextPageParamsRef.current[tabIndex] = nextParams;
      hasMoreRef.current[tabIndex] = !!nextParams;

      setHasMore(prev => {
        const next = [...prev];
        next[tabIndex] = !!nextParams;
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
        next[tabIndex] = false;
        return next;
      });
      setRefreshing((prev) => {
        const next = [...prev];
        next[tabIndex] = false;
        return next;
      });
      loadingMoreRef.current[tabIndex] = false;
      setLoadingMore(prev => {
        const next = [...prev];
        next[tabIndex] = false;
        return next;
      });
    }
  }, [profile?.address, apiKey, subscriptions, t]);

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
    if (contextLoading || initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    loadData(0);
    loadData(1);
    loadData(2);
    loadData(3);
  }, [contextLoading, loadData]);

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
    applyTabIndex(index);
    pagerRef.current?.setPage(index);
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
          onAddressCopied={showCopiedSnackbar}
          onPress={() => handleItemPress({ ...item, name: displayDesc })}
        />
      );
    },
    [cardWidth, subscriptions, showCopiedSnackbar, handleItemPress],
  );

  const keyExtractor = useCallback((item: InputDataItem) => item.id, []);

  const renderList = (data: InputDataItem[], tabIndex: number) => {
    const isSquareList = tabIndex === 0;
    const isSentList = tabIndex === 1;
    const isInboxList = tabIndex === 2;
    const isSelfList = tabIndex === 3;

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

    if (loading[tabIndex] && !refreshing[tabIndex] && data.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12 }}>{t('home.loadingData', { tab: TABS[tabIndex] })}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing[tabIndex]}
            onRefresh={() => loadData(tabIndex, true)}
            colors={[theme.colors.primary]}
            enabled={true}
          />
        }
        onEndReached={() => loadData(tabIndex, false, true)}
        onEndReachedThreshold={0.2}
        ListFooterComponent={
          data.length > 0 ? (
            <View style={styles.footerContainer}>
              {loadingMore[tabIndex] ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : !hasMore[tabIndex] ? (
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
          <View style={styles.headerRow}>
            <View>
              {(isSelfList || isSentList || isInboxList) && profile?.address && (
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
                <CopyableAddress
                  address={BLACK_HOLE_ADDRESS}
                  variant="labelSmall"
                  style={{ color: theme.colors.secondary }}
                  onCopied={showCopiedSnackbar}
                >
                  {t('home.sentTo')}: {shortenAddress(BLACK_HOLE_ADDRESS)} {subscriptions.length > 0 ? `+ ${subscriptions.length} ${t('nav.subscriptions')}` : ''}
                </CopyableAddress>
              )}
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('home.totalItems', { count: data.length })}
            </Text>
          </View>
        }
      />
    );
  };

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
                  { color: activeTab === index ? tabActiveColor : tabInactiveColor },
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
        <View key="1">{renderList(squareData, 0)}</View>
        <View key="2">{renderList(sentData, 1)}</View>
        <View key="3">{renderList(inboxData, 2)}</View>
        <View key="4">{renderList(selfData, 3)}</View>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
});

