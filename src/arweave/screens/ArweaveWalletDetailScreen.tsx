import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../theme/layout';
import {
  Text,
  Card,
  useTheme,
  Divider,
  IconButton,
  ActivityIndicator,
  Button,
  Snackbar,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppContext } from '../../context/AppContext';
import { RootStackParamList } from '../../types';
import { CopyableAddress } from '../../components/CopyableAddress';
import {
  clearRemoteImageCache,
  getRemoteImageCacheCount,
} from '../../adapter/remoteImageLoader';
import { getUploadWalletBalanceAr } from '../upload/transaction';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ARWEAVE_VERSION = require('arweave/package.json').version as string;

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatArBalance(balanceAr: string): string {
  const value = parseFloat(balanceAr);
  if (!Number.isFinite(value)) return balanceAr;
  if (value < 0.000001) return '< 0.000001';
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export default function ArweaveWalletDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { listContentStyle } = useListColumnLayout();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();

  const arProfile = state.arProfile;
  const address = arProfile?.address;

  const [balanceAr, setBalanceAr] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const loadBalance = useCallback(async (walletAddress: string) => {
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      const balance = await getUploadWalletBalanceAr(walletAddress);
      setBalanceAr(balance);
    } catch (err) {
      console.warn('loadArBalance failed:', err);
      setBalanceError(true);
      setBalanceAr(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const loadCacheCount = useCallback(async () => {
    try {
      const count = await getRemoteImageCacheCount();
      setCacheCount(count);
    } catch (e) {
      console.warn('loadCacheCount failed:', e);
      setCacheCount(null);
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      await clearRemoteImageCache();
      setCacheCount(0);
      setSnackbarMessage(
        t('arweave.walletDetail.cacheCleared', { defaultValue: '已清除 AR 图片本地缓存' }),
      );
    } catch (e) {
      console.warn('clearRemoteImageCache failed:', e);
      setSnackbarMessage(
        t('arweave.walletDetail.cacheClearFailed', { defaultValue: '清除缓存失败' }),
      );
    } finally {
      setClearingCache(false);
      setSnackbarVisible(true);
    }
  }, [t]);

  useEffect(() => {
    if (!address) {
      navigation.goBack();
      return;
    }
    loadBalance(address);
    loadCacheCount();
  }, [address, loadBalance, loadCacheCount, navigation]);

  const balanceDisplayText = useMemo(() => {
    if (balanceLoading) return t('arweave.walletDetail.balanceLoading');
    if (balanceError || balanceAr == null) {
      return balanceError ? t('arweave.walletDetail.balanceFailed') : '';
    }
    return t('arweave.walletDetail.balanceValue', {
      balance: formatArBalance(balanceAr),
    });
  }, [balanceLoading, balanceError, balanceAr, t]);

  const tipItems = useMemo(
    () => [
      t('arweave.walletDetail.tipsFileSize'),
      t('arweave.walletDetail.tipsForeground'),
      t('arweave.walletDetail.tipsSmallBalance'),
      t('arweave.walletDetail.tipsPublic'),
      t('arweave.walletDetail.tipsVerify'),
    ],
    [t],
  );

  const disclaimerItems = useMemo(
    () => [
      t('arweave.walletDetail.disclaimer1'),
      t('arweave.walletDetail.disclaimer2'),
      t('arweave.walletDetail.disclaimer3'),
      t('arweave.walletDetail.disclaimer4'),
    ],
    [t],
  );

  const libInfoRows = useMemo(
    () => [
      { label: t('arweave.walletDetail.libName'), value: t('arweave.walletDetail.libNameValue') },
      { label: t('arweave.walletDetail.libVersion'), value: ARWEAVE_VERSION },
      { label: t('arweave.walletDetail.libGateway'), value: t('arweave.walletDetail.libGatewayValue') },
      { label: t('arweave.walletDetail.libBuild'), value: t('arweave.walletDetail.libBuildValue') },
      { label: t('arweave.walletDetail.libUsage'), value: t('arweave.walletDetail.libUsageValue') },
    ],
    [t],
  );

  if (!address) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[
          styles.content,
          listContentStyle,
          { paddingBottom: insets.bottom + 20 },
        ]}
      >
        <ListColumn>
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('arweave.walletAddress')}
              </Text>
              <CopyableAddress
                address={address}
                variant="bodyMedium"
                style={[styles.addressText, { color: theme.colors.primary }]}
              >
                {address}
              </CopyableAddress>

              <View style={styles.balanceRow}>
                <View style={styles.balanceTextWrap}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('arweave.walletDetail.balanceLabel')}
                  </Text>
                  {balanceLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} style={styles.balanceSpinner} />
                  ) : (
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                      {balanceDisplayText}
                    </Text>
                  )}
                </View>
                <IconButton
                  icon="refresh"
                  size={20}
                  onPress={() => loadBalance(address)}
                  disabled={balanceLoading}
                  iconColor={theme.colors.primary}
                />
              </View>
            </Card.Content>
          </Card>

          <View style={styles.sectionSpacer} />
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                {t('arweave.walletDetail.cacheTitle', { defaultValue: '本地缓存' })}
              </Text>
              <View style={styles.cacheRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {cacheCount == null
                    ? t('arweave.walletDetail.cacheCountLoading', { defaultValue: '统计中…' })
                    : t('arweave.walletDetail.cacheCount', {
                        count: cacheCount,
                        defaultValue: `已缓存 {{count}} 个文件`,
                      })}
                </Text>
                <Button
                  mode="outlined"
                  onPress={handleClearCache}
                  loading={clearingCache}
                  disabled={clearingCache || cacheCount === 0}
                  icon="trash-can-outline"
                >
                  {t('arweave.walletDetail.clearCache', { defaultValue: '清除缓存' })}
                </Button>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.sectionSpacer} />
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                {t('arweave.walletDetail.libTitle')}
              </Text>
              {libInfoRows.map((row, index) => (
                <View key={row.label} style={[styles.infoRow, index > 0 && styles.infoRowSpaced]}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {row.label}
                  </Text>
                  <Text variant="bodyMedium" style={[styles.infoValue, { color: theme.colors.onSurface }]}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>

          <View style={styles.sectionSpacer} />
          <Card
            style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, { color: theme.colors.onSecondaryContainer }]}
              >
                {t('arweave.walletDetail.tipsTitle')}
              </Text>
              {tipItems.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSecondaryContainer, lineHeight: 22 }}
                  >
                    {index + 1}. {tip}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>

          <View style={styles.sectionSpacer} />
          <Card
            style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}
            mode="elevated"
          >
            <Card.Content style={styles.cardContent}>
              <Text
                variant="titleMedium"
                style={[styles.disclaimerTitle, { color: theme.colors.error }]}
              >
                {t('arweave.walletDetail.disclaimerTitle')}
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.riskHint, { color: theme.colors.onErrorContainer }]}
              >
                {t('arweave.walletDetail.disclaimerRiskHint')}
              </Text>
              <Divider style={[styles.divider, { borderColor: theme.colors.error + '30' }]} />
              {disclaimerItems.map((item, index) => (
                <View key={index} style={styles.disclaimerItem}>
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onErrorContainer, lineHeight: 22 }}
                  >
                    {index + 1}. {item}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        </ListColumn>
      </ScrollView>

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
  content: { padding: 20 },
  card: { borderRadius: 12, elevation: 2 },
  cardContent: { paddingVertical: 16, paddingHorizontal: 8 },
  sectionSpacer: { height: 16 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  addressText: { marginTop: 4, lineHeight: 22 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  balanceTextWrap: { flex: 1 },
  balanceSpinner: { marginTop: 4, alignSelf: 'flex-start' },
  infoRow: {},
  infoRowSpaced: { marginTop: 10 },
  infoValue: { marginTop: 2, lineHeight: 22 },
  cacheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 12,
  },
  tipItem: { marginBottom: 10 },
  disclaimerTitle: { fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  riskHint: { lineHeight: 22, marginBottom: 8 },
  divider: { marginVertical: 12 },
  disclaimerItem: { marginBottom: 10 },
});
