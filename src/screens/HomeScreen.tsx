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
import { Card, Text, useTheme, Button, Snackbar } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PagerView from 'react-native-pager-view';
import { useTranslation } from 'react-i18next';
import { mockInputDataList } from '../data/mockData';
import { InputDataItem, RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { dataSourceManager } from '../datasource/DataSourceManager';

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

  return (
    <Card
      style={[styles.card, { width: cardWidth, backgroundColor: theme.colors.surface }]}
      mode="elevated"
    >
      <Card.Content style={styles.cardContent}>
        <Text variant="titleMedium" style={[styles.addressLabel, { color: theme.colors.primary }]}>
          {shortenAddress(item.address)} ({item.name})
        </Text>

        <Text
          variant="bodyMedium"
          style={styles.inputDataText}
        >
          {item.description}
        </Text>

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
    t('home.tabs.home'),
    t('home.tabs.sent'),
    t('home.tabs.messages')
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

  // 使用 Ref 存储分页参数和状态，避免 loadData 频繁变动导致 useFocusEffect 循环触发
  const nextPageParamsRef = useRef<any[]>([null, null, null, null]);
  const hasMoreRef = useRef<boolean[]>([true, true, true, true]);
  const loadingMoreRef = useRef<boolean[]>([false, false, false, false]);

  const cardWidth = screenWidth - 32;

  const loadData = useCallback(async (tabIndex: number, isRefreshing = false, isLoadMore = false) => {
    if (!profile?.address) return;

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

    const modeMap: ('square' | 'self' | 'sent' | 'inbox')[] = ['square', 'self', 'sent', 'inbox'];
    const mode = modeMap[tabIndex];
    const targetAddr = mode === 'square' ? BLACK_HOLE_ADDRESS : profile.address;
    const params = nextPageParamsRef.current[tabIndex];

    try {
      const result = await dataSourceManager.fetchAll(targetAddr, mode, params);

      // Check for Etherscan API key error in the results
      if (result.errors?.includes('MISSING_ETHERSCAN_API_KEY')) {
        setSnackbarMessage(t('home.noApiKeyWarning'));
        setSnackbarVisible(true);
      }

      if (isLoadMore) {
        const updateData = (prev: InputDataItem[]) => {
          const map = new Map<string, InputDataItem>();
          prev.forEach(i => map.set(i.id, i));
          result.items.forEach(i => map.set(i.id, i));
          return Array.from(map.values()).sort((a, b) =>
            new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
          );
        };

        if (tabIndex === 0) setSquareData(updateData);
        else if (tabIndex === 1) setSelfData(updateData);
        else if (tabIndex === 2) setSentData(updateData);
        else if (tabIndex === 3) setInboxData(updateData);
      } else {
        if (tabIndex === 0) setSquareData(result.items);
        else if (tabIndex === 1) setSelfData(result.items);
        else if (tabIndex === 2) setSentData(result.items);
        else if (tabIndex === 3) setInboxData(result.items);

        if (isRefreshing) {
          setSnackbarMessage(t('home.upToDate'));
          setSnackbarVisible(true);
        }
      }

      nextPageParamsRef.current[tabIndex] = result.next_page_params;
      hasMoreRef.current[tabIndex] = !!result.next_page_params;

      setHasMore(prev => {
        const next = [...prev];
        next[tabIndex] = !!result.next_page_params;
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
  }, [profile?.address, apiKey, t]);

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
    const isSelfList = tabIndex === 1;
    const isSentList = tabIndex === 2;
    const isInboxList = tabIndex === 3;

    if (!profile?.address) {
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
                  {t('home.sentTo')}: {shortenAddress(BLACK_HOLE_ADDRESS)}
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
        <View key="2">{renderList(selfData, 1)}</View>
        <View key="3">{renderList(sentData, 2)}</View>
        <View key="4">{renderList(inboxData, 3)}</View>
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

