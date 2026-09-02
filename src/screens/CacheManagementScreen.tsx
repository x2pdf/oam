import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  Switch,
  List,
  Divider,
  TextInput,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { cacheService, CacheStats } from '../datasource/cacheService';
import { useAppContext } from '../context/AppContext';
import { BLACK_HOLE_ADDRESS } from '../utils/address';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout, ListColumn } from '../theme/layout';
import { AppModal } from '../components/AppModal';

export default function CacheManagementScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { listContentStyle } = useListColumnLayout();

  const [isEnabled, setIsEnabled] = useState(true);
  const [limit, setLimit] = useState('100');
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ index: 0, total: 0, address: '' });
  const [clearDialogVisible, setClearDialogVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [enabled, defaultLimit, currentStats] = await Promise.all([
        cacheService.isGlobalCacheEnabled(),
        cacheService.getDefaultLimit(),
        cacheService.getCacheStats(),
      ]);
      setIsEnabled(enabled);
      setLimit(defaultLimit.toString());
      setStats(currentStats);
    } catch (e) {
      console.warn('Failed to load cache settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleEnabled = async (value: boolean) => {
    setIsEnabled(value);
    await cacheService.setGlobalCacheEnabled(value);
  };

  const handleLimitChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/[^0-9]/g, '');
    setLimit(cleaned);
  };

  const handleSaveLimit = async () => {
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1 || num > 1000) {
      setSnackbarMessage(t('subscriptions.pinInvalid'));
      setSnackbarVisible(true);
      return;
    }
    await cacheService.setDefaultLimit(num);
    setSnackbarMessage(t('common.success'));
    setSnackbarVisible(true);
    // Refresh stats as limit change might have triggered cleanup
    const currentStats = await cacheService.getCacheStats();
    setStats(currentStats);
  };

  const handleClearCache = async () => {
    setClearDialogVisible(false);
    await cacheService.clearCache();
    setSnackbarMessage(t('profile.cacheCleared'));
    setSnackbarVisible(true);
    const currentStats = await cacheService.getCacheStats();
    setStats(currentStats);
  };

  const handleRefreshCache = async () => {
    const addresses: string[] = [];
    if (state.profile?.address) addresses.push(state.profile.address);
    addresses.push(BLACK_HOLE_ADDRESS);
    state.subscriptions.forEach(s => addresses.push(s.address));

    setRefreshing(true);
    setSnackbarMessage(t('profile.cacheRefreshHint'));
    setSnackbarVisible(true);

    try {
      await cacheService.refreshCache(addresses, (index, total, address) => {
        setRefreshProgress({ index: index + 1, total, address });
      });
      setSnackbarMessage(t('profile.cacheRefreshComplete'));
      setSnackbarVisible(true);
      const currentStats = await cacheService.getCacheStats();
      setStats(currentStats);
    } catch (e) {
      setSnackbarMessage(t('profile.cacheRefreshFailed'));
      setSnackbarVisible(true);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.scrollContent, listContentStyle]}
      >
        <ListColumn>
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated">
            <Card.Content>
              <List.Item
                title={t('profile.cacheEnabled')}
                right={() => (
                  <Switch
                    value={isEnabled}
                    onValueChange={handleToggleEnabled}
                    disabled={refreshing}
                  />
                )}
              />
              <Divider />
              <View style={styles.inputRow}>
                <TextInput
                  label={t('profile.cacheLimit')}
                  value={limit}
                  onChangeText={handleLimitChange}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  style={styles.input}
                  disabled={!isEnabled || refreshing}
                />
                <Button
                  mode="contained"
                  onPress={handleSaveLimit}
                  disabled={!isEnabled || refreshing}
                  style={styles.saveButton}
                >
                  {t('common.save')}
                </Button>
              </View>
            </Card.Content>
          </Card>

          <View style={styles.sectionSpacer} />

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated">
            <Card.Title title={t('common.tip')} />
            <Card.Content>
              {stats && (
                <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                  {t('profile.cacheStats', {
                    txCount: stats.transactionCount,
                    addrCount: stats.addressCount,
                  })}
                </Text>
              )}

              {refreshing && (
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                  <Text variant="bodySmall" style={{ flex: 1 }}>
                    {t('profile.cacheRefreshProgress', {
                      index: refreshProgress.index,
                      total: refreshProgress.total,
                      address: refreshProgress.address.slice(0, 10) + '...',
                    })}
                  </Text>
                </View>
              )}

              <View style={styles.buttonRow}>
                <Button
                  mode="outlined"
                  onPress={handleRefreshCache}
                  disabled={!isEnabled || refreshing}
                  loading={refreshing}
                  icon="refresh"
                  style={styles.flexButton}
                >
                  {t('home.retry')}
                </Button>
                <View style={{ width: 12 }} />
                <Button
                  mode="outlined"
                  onPress={() => setClearDialogVisible(true)}
                  disabled={refreshing}
                  textColor={theme.colors.error}
                  icon="delete-outline"
                  style={styles.flexButton}
                >
                  {t('common.delete')}
                </Button>
              </View>
            </Card.Content>
          </Card>
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={clearDialogVisible}
        onDismiss={() => setClearDialogVisible(false)}
        title={t('common.confirmDelete')}
        actions={[
          { label: t('common.cancel'), onPress: () => setClearDialogVisible(false) },
          {
            label: t('common.delete'),
            onPress: handleClearCache,
            mode: 'contained',
            style: { backgroundColor: theme.colors.error },
          },
        ]}
      >
        <Text variant="bodyMedium" style={{ textAlign: 'center' }}>
          {t('profile.cacheClearConfirm')}
        </Text>
      </AppModal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  sectionSpacer: {
    height: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  input: {
    flex: 1,
    marginRight: 12,
  },
  saveButton: {
    height: 40,
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  flexButton: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
});
