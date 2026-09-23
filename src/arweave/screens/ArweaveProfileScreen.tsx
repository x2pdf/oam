import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { scrollFill } from '../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../theme/layout';
import {
  Text,
  Card,
  Button,
  FAB,
  useTheme,
  IconButton,
  Avatar,
  Snackbar,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../../context/AppContext';
import { useThemePreference } from '../../context/ThemeContext';
import { RootStackParamList } from '../../types';
import { CopyableAddress, copyAddress } from '../../components/CopyableAddress';
import { ArweaveDataCard } from '../list/components/ArweaveDataCard';
import { useArweaveTransactions } from '../list/hooks/useArweaveTransactions';
import { ArweaveListItem } from '../list/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function shortenAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export default function ArweaveProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle, cardWidth, centered } = useListColumnLayout();
  const insets = useSafeAreaInsets();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const arProfile = state.arProfile;
  const { state: txState, refresh, loadMore, imageReloadToken } = useArweaveTransactions(
    arProfile?.address,
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('ArweaveAddInfoSelect');
  }, [navigation]);

  const handleWalletDetail = useCallback(() => {
    navigation.navigate('ArweaveWalletDetail');
  }, [navigation]);

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarMessage(t('common.copied'));
    setSnackbarVisible(true);
  }, [t]);

  const handleCopyAddress = useCallback(async () => {
    if (!arProfile?.address) return;
    await copyAddress(arProfile.address);
    showCopiedSnackbar();
  }, [arProfile?.address, showCopiedSnackbar]);

  const onUploadFabPress = useCallback(() => {
    if (!arProfile) {
      setSnackbarMessage(t('arweave.upload.noWallet'));
      setSnackbarVisible(true);
      return;
    }
    navigation.navigate('ArweaveUpload');
  }, [arProfile, navigation, t]);

  const handleItemPress = useCallback(
    (item: ArweaveListItem) => {
      navigation.navigate('ArweaveDataDetail', { item });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: ArweaveListItem }) => (
      <ArweaveDataCard
        item={item}
        cardWidth={cardWidth}
        onPress={() => handleItemPress(item)}
        imageReloadToken={imageReloadToken}
      />
    ),
    [cardWidth, handleItemPress, imageReloadToken],
  );

  const keyExtractor = useCallback((item: ArweaveListItem) => item.id, []);

  const listHeader = useMemo(
    () => (
      <ListColumn>
        {arProfile ? (
          <>
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
              mode="elevated"
              onPress={handleWalletDetail}
            >
              <Card.Content style={styles.cardContent}>
                <View style={styles.row}>
                  <Avatar.Icon
                    size={48}
                    icon="cloud-outline"
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    color={theme.colors.primary}
                  />
                  <View style={styles.cardTextContainer}>
                    <View style={styles.row}>
                      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                        {t('arweave.walletAddress')}
                      </Text>
                      <View style={[styles.typeTag, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text
                          style={[
                            styles.typeTagText,
                            { color: theme.colors.primary, fontSize: Math.round(10 * fontScale) },
                          ]}
                        >
                          {t('profile.fullFunction')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.addressRow}>
                      <View style={styles.addressTextWrap}>
                        <CopyableAddress
                          address={arProfile.address}
                          variant="titleMedium"
                          style={[styles.addressText, { color: theme.colors.primary }]}
                          onCopied={showCopiedSnackbar}
                        >
                          {shortenAddress(arProfile.address)}
                        </CopyableAddress>
                      </View>
                      <IconButton
                        icon="content-copy"
                        size={18}
                        onPress={handleCopyAddress}
                        iconColor={theme.colors.primary}
                        style={styles.copyBtn}
                        accessibilityLabel={t('common.copy')}
                      />
                    </View>
                  </View>
                  <IconButton
                    icon="chevron-right"
                    onPress={handleWalletDetail}
                    iconColor={theme.colors.onSurfaceVariant}
                  />
                </View>
              </Card.Content>
            </Card>
            <Button
              mode="outlined"
              icon="shield-key-outline"
              onPress={handleAdd}
              style={styles.upgradeButton}
            >
              {t('arweave.upgradeWallet')}
            </Button>
          </>
        ) : (
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
            onPress={handleAdd}
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <Avatar.Icon
                  size={48}
                  icon="cloud-plus-outline"
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                  color={theme.colors.primary}
                />
                <View style={styles.cardTextContainer}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {t('common.noData')}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('arweave.addHint')}
                  </Text>
                </View>
                <IconButton icon="plus" onPress={handleAdd} />
              </View>
            </Card.Content>
          </Card>
        )}

        {arProfile ? (
          <Text
            variant="titleSmall"
            style={[styles.listSectionTitle, { color: theme.colors.onSurfaceVariant }]}
          >
            {t('arweave.listSectionTitle')}
          </Text>
        ) : null}
      </ListColumn>
    ),
    [
      arProfile,
      theme.colors,
      t,
      fontScale,
      showCopiedSnackbar,
      handleCopyAddress,
      handleAdd,
      handleWalletDetail,
    ],
  );

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
  }, [arProfile, txState, theme.colors.primary, loadMore, t]);

  const listEmpty = useMemo(() => {
    if (!arProfile) return null;
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
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.scrollContent,
          listContentStyle,
          arProfile && {
            paddingBottom: (Platform.OS === 'web' ? 140 : 88) + insets.bottom,
          },
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

      {arProfile && Platform.OS === 'web' ? (
        <FAB
          icon={txState.refreshing ? 'autorenew' : 'refresh'}
          style={[
            styles.fabRefresh,
            {
              backgroundColor: theme.colors.secondaryContainer,
              bottom: 72 + insets.bottom,
            },
            centered && { marginRight: '25%' },
          ]}
          onPress={refresh}
          disabled={txState.refreshing}
          color={theme.colors.onSecondaryContainer}
          small
          accessibilityLabel={t('home.retry')}
        />
      ) : null}

      {arProfile ? (
        <FAB
          icon="upload"
          style={[
            styles.fab,
            { backgroundColor: theme.colors.primary, bottom: insets.bottom },
            centered && { marginRight: '25%' },
          ]}
          onPress={onUploadFabPress}
          color="white"
          small
          label={t('arweave.upload.fabLabel')}
        />
      ) : null}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
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
  card: { marginBottom: 12, borderRadius: 12 },
  cardContent: { paddingVertical: 12, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTextContainer: { flex: 1, marginLeft: 16 },
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  addressTextWrap: { flex: 1, flexShrink: 1 },
  addressText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: { margin: 0, width: 32, height: 32 },
  typeTag: { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeTagText: { fontWeight: '600' },
  upgradeButton: { marginBottom: 12 },
  listSectionTitle: {
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '700',
  },
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
