import React, { useCallback, useState, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Text, useTheme, Snackbar } from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, InputDataItem } from '../types';
import { dataSourceManager } from '../datasource/DataSourceManager';
import { applyDisplayPipeline, markAllRaw } from '../display';
import { InputDataCard } from '../components/InputDataCard';
import { AddressWithActions } from '../components/AddressWithActions';
import { useAppContext } from '../context/AppContext';

type RouteProps = RouteProp<RootStackParamList, 'AddressDataList'>;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function AddressDataListScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { width: screenWidth } = useWindowDimensions();
  const { state } = useAppContext();
  const { address, title } = route.params;

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

  const cardWidth = screenWidth - 32;

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
        const result = await dataSourceManager.fetchAll(
          address,
          'all',
          nextPageParamsRef.current,
        );

        let processedItems: InputDataItem[];
        try {
          processedItems = await applyDisplayPipeline(result.items, {
            userAddress: state.profile?.address,
            client: null,
          });
        } catch {
          processedItems = markAllRaw(result.items);
        }

        if (isLoadMore) {
          setData((prev) => {
            const map = new Map<string, InputDataItem>();
            prev.forEach((i) => map.set(i.id, i));
            processedItems.forEach((i) => map.set(i.id, i));
            return Array.from(map.values()).sort(
              (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
            );
          });
        } else {
          setData(
            processedItems.sort(
              (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
            ),
          );
        }

        nextPageParamsRef.current = result.next_page_params;
        hasMoreRef.current = !!result.next_page_params;
        setHasMore(!!result.next_page_params);
      } catch (err: any) {
        setError(err.message || t('common.errorFetch'));
      } finally {
        setLoading(false);
        setRefreshing(false);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [address, state.profile?.address, t],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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
        onAddressCopied={showCopiedSnackbar}
        onPress={() => handleItemPress(item)}
      />
    ),
    [cardWidth, showCopiedSnackbar, handleItemPress],
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
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[theme.colors.primary]}
          />
        }
        onEndReached={() => loadData(false, true)}
        onEndReachedThreshold={0.2}
        ListHeaderComponent={
          <View style={styles.header}>
            {title ? (
              <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 8 }}>
                {title}
              </Text>
            ) : null}
            <AddressWithActions
              address={address}
              label={t('common.address')}
              showFullAddress
              onCopied={showCopiedSnackbar}
              showInfo={false}
            />
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
    paddingHorizontal: 16,
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
});
