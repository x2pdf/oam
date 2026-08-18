import React, { useCallback, useState, useRef, useMemo } from 'react';
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
import { Card, Text, useTheme, Button, Snackbar, FAB, Portal, Dialog } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PagerView from 'react-native-pager-view';
import { useTranslation } from 'react-i18next';
import { mockInputDataList } from '../data/mockData';
import { InputDataItem, RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { isOAMP, parseOAMPContent } from '../utils/oampHelper';
import { RichContentRenderer } from '../components/RichContentRenderer';
import { getPrivateKeySecured } from '../wallet/walletManager';
import { OAMPClient } from '../oamp/client';
import { CryptoScheme, MessageType } from '../oamp/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  常量与类型                                                         */
/* ------------------------------------------------------------------ */

const BLACK_HOLE_ADDRESS = '0x0000000000000000000000000000000000000000';

/* ------------------------------------------------------------------ */
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  卡片组件                                                           */
/* ------------------------------------------------------------------ */

interface CardProps {
  item: InputDataItem;
  cardWidth: number;
}

const InputDataCard: React.FC<CardProps> = React.memo(({ item, cardWidth }) => {
  const theme = useTheme();

  const oampContent = useMemo(() => {
    if (item.oampItems) return item.oampItems;
    return parseOAMPContent(item.rawInput, item.from || item.address, item.to);
  }, [item.rawInput, item.address, item.from, item.to, item.oampItems]);

  return (
    <Card
      style={[styles.card, { width: cardWidth, backgroundColor: theme.colors.surface }]}
      mode="elevated"
    >
      <Card.Content style={styles.cardContent}>
        <Text variant="titleMedium" style={[styles.addressLabel, { color: theme.colors.primary }]}>
          {shortenAddress(item.address)} ({item.name})
        </Text>

        {oampContent ? (
          <RichContentRenderer items={oampContent} />
        ) : (
          <Text
            variant="bodyMedium"
            style={styles.inputDataText}
          >
            {item.description}
          </Text>
        )}

        <Text
          variant="labelSmall"
          style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}
        >
          {item.lastActive}
        </Text>
      </Card.Content>
    </Card>
  );
});

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
  const { apiKey, profile, subscriptions } = state;

  const TABS = useMemo(() => [
    t('home.tabs.square'),
    t('home.tabs.sent'),
    t('home.tabs.messages'),
    t('home.tabs.home')
  ], [t]);

  const [activeTab, setActiveTab] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  const [selfData, setSelfData] = useState<InputDataItem[]>([]);
  const [squareData, setSquareData] = useState<InputDataItem[]>([]);
  const [sentData, setSentData] = useState<InputDataItem[]>([]);
  const [inboxData, setInboxData] = useState<InputDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState([false, false, false, false]);
  const [hasMore, setHasMore] = useState([true, true, true, true]);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);

  // 使用 Ref 存储分页参数和状态，避免 loadData 频繁变动导致 useFocusEffect 循环触发
  const nextPageParamsRef = useRef<any[]>([null, null, null, null]);
  const hasMoreRef = useRef<boolean[]>([true, true, true, true]);
  const loadingMoreRef = useRef<boolean[]>([false, false, false, false]);

  const cardWidth = screenWidth - 32;

  const processOAMPItems = useCallback(async (items: InputDataItem[]) => {
    if (!profile?.address) return items;

    const privateKey = await getPrivateKeySecured();
    if (!privateKey) return items;

    // We use a dummy provider for decryption-only client
    const client = new OAMPClient(privateKey, 'https://eth.llamarpc.com');

    return await Promise.all(items.map(async (item) => {
      if (item.rawInput && isOAMP(item.rawInput)) {
        try {
          const from = item.from?.toLowerCase();
          const to = item.to?.toLowerCase();
          const userAddr = profile.address.toLowerCase();

          const msg = client.parseTransaction(item.rawInput, from || '', to || '');
          if (msg) {
            // Case 1: Unencrypted (NONE) - Parse directly
            if (msg.crypto === CryptoScheme.NONE) {
              const decodedItems = parseOAMPContent(item.rawInput, from, to);
              if (decodedItems) {
                return { ...item, oampItems: decodedItems };
              }
            }

            // Case 2: Personal Note (Encrypted A -> A)
            if (from === to && from === userAddr && msg.type === MessageType.PERSONAL) {
              const decrypted = await client.decryptMessage(msg);
              if (decrypted && decrypted.items) {
                return { ...item, oampItems: decrypted.items };
              }
            }

            // Case 3: P2P Encrypted (A -> B or B -> A)
            // Note: Currently we don't have senderPublicKey/recipientPublicKey easily available
            // for every transaction here without extra API calls to recover them from v,r,s.
            // For now, if we can't decrypt, we just leave it as is, or maybe add a placeholder.
          }
        } catch (e) {
          console.log('OAMP processing failed for item:', item.id, e);
        }
      }
      return item;
    }));
  }, [profile?.address]);

  const loadData = useCallback(async (tabIndex: number, isRefreshing = false, isLoadMore = false) => {
    const modeMap: ('square' | 'sent' | 'inbox' | 'self')[] = ['square', 'sent', 'inbox', 'self'];
    const mode = modeMap[tabIndex];

    if (mode !== 'square' && !profile?.address) return;

    // 如果是加载更多，但已经没有更多了，或者正在加载中，则返回
    if (isLoadMore && (!hasMoreRef.current[tabIndex] || loadingMoreRef.current[tabIndex])) return;

    if (isRefreshing) {
      setRefreshing(true);
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
      setLoading(true);
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
            console.warn(`Failed to fetch for ${addr}:`, e);
            return { items: [], next_page_params: null, errors: [e.message] };
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

      // Check for Etherscan API key error in the results
      if (allErrors.includes('MISSING_ETHERSCAN_API_KEY')) {
        setSnackbarMessage(t('home.noApiKeyWarning'));
        setSnackbarVisible(true);
      }

      // Apply OAMP Decryption Filter
      const processedItems = await processOAMPItems(resultItems);

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
      console.error(err);
      if (err.message === 'MISSING_ETHERSCAN_API_KEY') {
        setSnackbarMessage(t('home.setApiKeyHint'));
        setSnackbarVisible(true);
      } else {
        setError(err.message || t('common.errorFetch'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingMoreRef.current[tabIndex] = false;
      setLoadingMore(prev => {
        const next = [...prev];
        next[tabIndex] = false;
        return next;
      });
    }
  }, [profile?.address, apiKey, subscriptions, t]);

  useFocusEffect(
    useCallback(() => {
      loadData(0);
      loadData(1);
      loadData(2);
      loadData(3);
    }, [loadData]),
  );

  const onTabPress = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  };

  const onPageSelected = (e: any) => {
    setActiveTab(e.nativeEvent.position);
  };

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
        />
      );
    },
    [cardWidth, subscriptions],
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

    if (loading && !refreshing && (isSelfList || isSquareList || isSentList || isInboxList)) {
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
            refreshing={refreshing}
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
                <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                  {shortenAddress(profile.address)}
                </Text>
              )}
              {isSquareList && (
                <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>
                  {t('home.sentTo')}: {shortenAddress(BLACK_HOLE_ADDRESS)} {subscriptions.length > 0 ? `+ ${subscriptions.length} ${t('nav.subscriptions')}` : ''}
                </Text>
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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} translucent />
      {/* 自定义 TabBar */}
      <View style={{ backgroundColor: theme.colors.primary, paddingTop: insets.top }}>
        <View style={[styles.tabBar, { backgroundColor: theme.colors.primary, borderBottomColor: theme.colors.outline + '20' }]}>
          {TABS.map((tab, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => onTabPress(index)}
              style={[
                styles.tabItem,
                activeTab === index && { borderBottomColor: '#FFFFFF' },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === index ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)' },
                  activeTab === index && styles.activeTabText,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={0}
        onPageSelected={onPageSelected}
      >
        <View key="1">{renderList(squareData, 0)}</View>
        <View key="2">{renderList(sentData, 1)}</View>
        <View key="3">{renderList(inboxData, 2)}</View>
        <View key="4">{renderList(selfData, 3)}</View>
      </PagerView>

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

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{t('common.tip')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('home.readOnlyWalletTip')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>{t('common.ok')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  addressLabel: {
    fontWeight: '700',
    marginBottom: 6,
  },
  inputDataText: {
    lineHeight: 20,
    marginBottom: 4,
  },
  timeText: {
    textAlign: 'right',
    fontSize: 11,
    marginTop: 4,
  },
});

