import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import { Text, useTheme, Snackbar, IconButton, Button } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList, InputDataItem } from '../types';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { applyDisplayPipeline, markAllRaw } from '../display';
import { InputDataCard } from '../components/InputDataCard';
import { AddressWithActions } from '../components/AddressWithActions';
import { useAppContext } from '../context/AppContext';

type RouteProps = RouteProp<RootStackParamList, 'AddressDataList'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

const MAX_PAGES_PER_LOAD = 10;

function isBetweenAddresses(
  item: InputDataItem,
  addrA: string,
  addrB: string,
): boolean {
  const from = (item.from || '').toLowerCase();
  const to = (item.to || '').toLowerCase();
  return (from === addrA && to === addrB) || (from === addrB && to === addrA);
}

function sortByTimeDesc(items: InputDataItem[]): InputDataItem[] {
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

function mergeById(prev: InputDataItem[], next: InputDataItem[]): InputDataItem[] {
  const map = new Map<string, InputDataItem>();
  prev.forEach((i) => map.set(i.id, i));
  next.forEach((i) => map.set(i.id, i));
  return sortByTimeDesc(Array.from(map.values()));
}

export default function AddressDataListScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { cardWidth, listContentStyle, columnStyle } = useListColumnLayout();
  const { state } = useAppContext();
  const { address, title, peerAddress } = route.params;

  const [data, setData] = useState<InputDataItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const nextPageParamsRef = useRef<any>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const conversationMode = !!peerAddress;

  const processItems = useCallback(
    async (items: InputDataItem[]): Promise<InputDataItem[]> => {
      try {
        return await applyDisplayPipeline(items, {
          userAddress: state.profile?.address,
          client: null,
        });
      } catch {
        return markAllRaw(items);
      }
    },
    [state.profile?.address],
  );

  const filterConversation = useCallback(
    (items: InputDataItem[]): InputDataItem[] => {
      if (!peerAddress) return items;
      const a = address.toLowerCase();
      const b = peerAddress.toLowerCase();
      return items.filter((item) => isBetweenAddresses(item, a, b));
    },
    [address, peerAddress],
  );

  /**
   * 拉取一页或多页（对话模式下若过滤后为空则自动续拉），返回处理后的条目。
   */
  const fetchPages = useCallback(
    async (startParams: any): Promise<{ items: InputDataItem[]; nextParams: any }> => {
      let pageParams = startParams;
      let collected: InputDataItem[] = [];
      let pages = 0;

      do {
        const result = await dataSourceManager.fetchAll(address, 'all', pageParams);
        const processed = await processItems(result.items);
        const filtered = filterConversation(processed);
        collected = collected.concat(filtered);
        pageParams = result.next_page_params ?? null;
        pages += 1;

        // 非对话模式：只拉一页；对话模式：过滤后为空且还有下一页则继续
        if (!conversationMode) break;
        if (collected.length > 0) break;
        if (!pageParams) break;
      } while (pages < MAX_PAGES_PER_LOAD);

      return { items: collected, nextParams: pageParams };
    },
    [address, conversationMode, filterConversation, processItems],
  );

  const loadData = useCallback(
    async (isRefreshing = false, isLoadMore = false) => {
      if (isLoadMore && (!hasMoreRef.current || loadingMoreRef.current)) return;

      if (isRefreshing) {
        setRefreshing(true);
        nextPageParamsRef.current = null;
        hasMoreRef.current = true;
        setHasMore(true);
      } else if (isLoadMore) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
        nextPageParamsRef.current = null;
        hasMoreRef.current = true;
        setHasMore(true);
      }

      setError(null);

      try {
        const { items, nextParams } = await fetchPages(
          isLoadMore ? nextPageParamsRef.current : null,
        );

        if (isLoadMore) {
          setData((prev) => mergeById(prev, items));
        } else {
          setData(sortByTimeDesc([...items]));
        }

        nextPageParamsRef.current = nextParams;
        hasMoreRef.current = !!nextParams;
        setHasMore(!!nextParams);
      } catch (err: any) {
        setError(err.message || t('common.errorFetch'));
      } finally {
        setLoading(false);
        setRefreshing(false);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [fetchPages, t],
  );

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    setData([]);
    nextPageParamsRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    loadDataRef.current();
  }, [address, peerAddress]);

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarVisible(true);
  }, []);

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

  if (loading && !refreshing && data.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 12 }}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
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
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={[theme.colors.primary]}
            />
          ) : undefined
        }
        onEndReached={() => loadData(false, true)}
        onEndReachedThreshold={0.2}
        ListHeaderComponent={
          <View style={[styles.header, columnStyle]}>
            {title ? (
              <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 8 }}>
                {conversationMode
                  ? t('nav.conversation')
                  : title}
              </Text>
            ) : conversationMode ? (
              <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 8 }}>
                {t('nav.conversation')}
              </Text>
            ) : null}
            <AddressWithActions
              address={address}
              label={t('common.address')}
              showFullAddress
              onCopied={showCopiedSnackbar}
              showInfo={false}
            />
            {conversationMode && peerAddress ? (
              <AddressWithActions
                address={peerAddress}
                label={t('subscriptions.myAddress')}
                showFullAddress
                onCopied={showCopiedSnackbar}
                showInfo={false}
              />
            ) : null}
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('home.totalItems', { count: data.length })}
            </Text>
          </View>
        }
        ListFooterComponent={
          data.length > 0 ? (
            <View style={styles.footerContainer}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : Platform.OS === 'web' && hasMore ? (
                <Button mode="text" onPress={() => loadData(false, true)}>
                  {t('home.loadMore')}
                </Button>
              ) : !hasMore ? (
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
      />

      {/* Web 端刷新按钮 */}
      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={[styles.webRefreshBtn, { backgroundColor: theme.colors.surface }]}
          onPress={() => loadData(true)}
          activeOpacity={0.7}
        >
          <IconButton icon="refresh" size={20} iconColor={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      )}

      {error ? (
        <View style={[styles.errorBar, { backgroundColor: theme.colors.errorContainer }]}>
          <Text style={{ color: theme.colors.onErrorContainer, flex: 1 }}>{error}</Text>
        </View>
      ) : null}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {t('common.copied')}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 12,
  },
  separator: {
    height: 12,
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorBar: {
    padding: 8,
    paddingHorizontal: 16,
  },
  webRefreshBtn: {
    position: 'absolute',
    right: 22,
    bottom: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
