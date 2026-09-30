import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { scrollFill } from '../../../theme/scroll';
import { useListColumnLayout } from '../../../theme/layout';
import { useAppContext } from '../../../context/AppContext';
import { RootStackParamList } from '../../../types';
import { ArweaveDataCard } from '../components/ArweaveDataCard';
import { useArweaveTransactions } from '../hooks/useArweaveTransactions';
import { ArweaveListItem } from '../types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/** 从「我的上传」列表中选择一条，将其 Arweave ID 回填到附件页 */
export default function ArweaveFileSelectScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const { listContentStyle, cardWidth } = useListColumnLayout();
  const insets = useSafeAreaInsets();

  const arProfile = state.arProfile;
  const { state: txState, refresh, loadMore } = useArweaveTransactions(arProfile?.address);

  const handleSelect = useCallback(
    (item: ArweaveListItem) => {
      const mime = item.contentItems.find((c) => !!c.mime)?.mime;
      // 显示名字：优先备注(Note)，其次上传时文件名(File-Name)，都没有则不回填
      const label = item.note?.trim() || item.fileName?.trim() || undefined;
      navigation.navigate({
        name: 'AddAttachment',
        params: {
          pickedArweaveId: item.id,
          pickedArweaveMime: mime,
          pickedArweaveLabel: label,
          pickedArweaveNonce: Date.now(),
        },
        merge: true,
        pop: true,
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: ArweaveListItem }) => (
      <ArweaveDataCard item={item} cardWidth={cardWidth} onPress={() => handleSelect(item)} />
    ),
    [cardWidth, handleSelect],
  );

  const keyExtractor = useCallback((item: ArweaveListItem) => item.id, []);

  const listFooter = useMemo(() => {
    if (!arProfile) return null;
    if (txState.loading && txState.data.length === 0) return null;
    return (
      <View style={styles.footerContainer}>
        {txState.loadingMore ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : txState.hasMore ? (
          <Button mode="text" onPress={loadMore}>
            {t('home.loadMore')}
          </Button>
        ) : txState.data.length > 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('home.noMoreData')}
          </Text>
        ) : null}
      </View>
    );
  }, [arProfile, txState, theme.colors, loadMore, t]);

  const listEmpty = useMemo(() => {
    if (!arProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
          >
            {t('arweave.upload.noWallet')}
          </Text>
        </View>
      );
    }
    if (txState.loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 12 }}>{t('arweave.listLoading')}</Text>
        </View>
      );
    }
    if (txState.error) {
      return (
        <View style={styles.emptyContainer}>
          <Text variant="bodyMedium" style={{ color: theme.colors.error, textAlign: 'center' }}>
            {t('arweave.listError', { message: txState.error })}
          </Text>
          <Button mode="text" onPress={refresh} style={{ marginTop: 8 }}>
            {t('home.retry')}
          </Button>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('arweave.listEmpty')}
        </Text>
      </View>
    );
  }, [arProfile, txState, theme.colors, refresh, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={scrollFill}
        data={arProfile ? txState.data : []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListFooterComponent={listFooter}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.scrollContent,
          listContentStyle,
          { paddingBottom: 24 + insets.bottom },
          txState.data.length === 0 && { flexGrow: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          arProfile && Platform.OS !== 'web' ? (
            <RefreshControl
              refreshing={txState.refreshing}
              onRefresh={refresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          ) : undefined
        }
        onEndReached={() => {
          if (
            !arProfile ||
            txState.data.length === 0 ||
            !txState.hasMore ||
            txState.loadingMore ||
            txState.refreshing ||
            txState.loading
          ) {
            return;
          }
          loadMore();
        }}
        onEndReachedThreshold={0.2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
  separator: { height: 12 },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
});
