import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import {
  Text,
  Card,
  FAB,
  Avatar,
  useTheme,
  IconButton,
  Searchbar,
  Snackbar,
  TextInput,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { Subscription, RootStackParamList } from '../types';
import { useNavigation } from '@react-navigation/native';
import { CopyableAddress } from '../components/CopyableAddress';
import { AppModal } from '../components/AppModal';
import { getHeaderChrome } from '../theme';
import { shortenAddress } from '../utils/address';
import { DEFAULT_CHAIN } from '../constants';
import {
  buildFollowListExport,
  parseFollowListImport,
  stringifyFollowListExport,
} from '../utils/subscriptionExport';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  关注列表屏幕                                                       */
/* ------------------------------------------------------------------ */

export default function SubscriptionsScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const { state, addSubscriptions } = useAppContext();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();

  // 搜索状态
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [ioModal, setIoModal] = useState<'none' | 'menu' | 'export' | 'import'>('none');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const exportJson = useMemo(
    () =>
      stringifyFollowListExport(
        buildFollowListExport(
          t('nav.subscriptions'),
          state.subscriptions.map((s) => ({
            address: s.address,
            description: s.description,
          })),
        ),
      ),
    [state.subscriptions, t],
  );

  useLayoutEffect(() => {
    const headerChrome = getHeaderChrome(theme);
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon="swap-vertical"
          iconColor={headerChrome.tintColor}
          size={22}
          accessibilityLabel={t('subscriptions.importExport')}
          onPress={() => setIoModal('menu')}
        />
      ),
    });
  }, [navigation, t, theme]);

  // 排序：置顶项按 pinWeight 降序 → 同权重按描述 a-z；普通项按描述 a-z
  const sortedSubscriptions = useMemo(() => {
    return [...state.subscriptions].sort((a, b) => {
      const wa = a.pinWeight ?? 0;
      const wb = b.pinWeight ?? 0;
      const aPinned = wa > 0;
      const bPinned = wb > 0;
      // 置顶项排在普通项之前
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      // 同为置顶：按权重降序，同权重按描述 a-z
      if (aPinned && bPinned) {
        if (wa !== wb) return wb - wa;
        return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
      }
      // 同为普通项：按描述 a-z
      return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
    });
  }, [state.subscriptions]);

  // 搜索过滤：对地址和描述进行正则模糊匹配
  const displaySubscriptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return sortedSubscriptions;
    try {
      const re = new RegExp(q, 'i');
      return sortedSubscriptions.filter(
        (s) => re.test(s.address) || re.test(s.description),
      );
    } catch {
      // 正则语法不完整时回退到普通字符串包含匹配
      const lower = q.toLowerCase();
      return sortedSubscriptions.filter(
        (s) =>
          s.address.toLowerCase().includes(lower) ||
          s.description.toLowerCase().includes(lower),
      );
    }
  }, [sortedSubscriptions, searchQuery]);

  const showSnackbar = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const showCopiedSnackbar = useCallback(() => {
    showSnackbar(t('common.copied'));
  }, [showSnackbar, t]);

  const closeIoModal = useCallback(() => {
    setIoModal('none');
    setImportText('');
    setImportError('');
  }, []);

  const handleCopyExportJson = useCallback(async () => {
    await Clipboard.setStringAsync(exportJson);
    closeIoModal();
    showCopiedSnackbar();
  }, [closeIoModal, exportJson, showCopiedSnackbar]);

  const handleImportConfirm = useCallback(async () => {
    const parsed = parseFollowListImport(importText);
    if (!parsed.ok) {
      const message =
        parsed.error === 'invalidJson'
          ? t('subscriptions.importInvalidJson')
          : parsed.error === 'invalidFormat'
            ? t('subscriptions.importInvalidFormat')
            : t('subscriptions.importEmpty');
      setImportError(message);
      return;
    }

    const existing = new Set(
      state.subscriptions.map((s) => s.address.trim().toLowerCase()),
    );
    const toAdd: Subscription[] = [];
    let skipped = 0;
    const baseId = Date.now();
    parsed.items.forEach((item, index) => {
      const key = item.address.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        return;
      }
      existing.add(key);
      toAdd.push({
        id: `${baseId}-${index}`,
        address: item.address,
        description: item.description,
        chain: DEFAULT_CHAIN,
      });
    });

    if (toAdd.length === 0) {
      closeIoModal();
      showSnackbar(t('subscriptions.importResultNoNew'));
      return;
    }

    await addSubscriptions(toAdd);
    closeIoModal();
    showSnackbar(
      t('subscriptions.importResult', { added: toAdd.length, skipped }),
    );
  }, [
    addSubscriptions,
    closeIoModal,
    importText,
    showSnackbar,
    state.subscriptions,
    t,
  ]);

  const handleToggleSearch = useCallback(() => {
    setSearchVisible((prev) => {
      if (prev) setSearchQuery('');
      return !prev;
    });
  }, []);

  // 每次聚焦时刷新列表（编辑返回后可看到最新数据）
  useFocusEffect(
    useCallback(() => {
      // Context 驱动，无需手动刷新
    }, []),
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('SubscriptionForm', {
      mode: 'add',
      source: 'subscriptions',
    });
  }, [navigation]);

  const handleViewDetail = useCallback(
    (item: Subscription) => {
      navigation.navigate('SubscriptionDetail', {
        subscription: item,
      });
    },
    [navigation],
  );

  const handleEdit = useCallback(
    (item: Subscription) => {
      navigation.navigate('SubscriptionForm', {
        mode: 'edit',
        source: 'subscriptions',
        subscription: item,
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Subscription }) => {
      const isPinned = (item.pinWeight ?? 0) > 0;
      return (
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
          onPress={() => handleViewDetail(item)}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon={isPinned ? 'pin' : 'bookmark-outline'}
                style={{
                  backgroundColor: isPinned
                    ? theme.colors.errorContainer
                    : theme.colors.primaryContainer,
                }}
                color={isPinned ? theme.colors.error : theme.colors.primary}
              />
              <View style={styles.cardTextContainer}>
                <View style={styles.row}>
                  <Text
                    variant="labelMedium"
                    style={{ color: theme.colors.onSurfaceVariant }}
                    numberOfLines={1}
                  >
                    {item.description}
                  </Text>
                  {isPinned && (
                    <View style={[styles.pinTag, { backgroundColor: theme.colors.errorContainer }]}>
                      <Text style={[styles.pinTagText, { color: theme.colors.error, fontSize: Math.round(10 * fontScale) }]}>
                        {t('subscriptions.pin')}
                      </Text>
                    </View>
                  )}
                </View>
                <CopyableAddress
                  address={item.address}
                  variant="titleMedium"
                  style={[styles.addressText, { color: theme.colors.primary }]}
                  onCopied={showCopiedSnackbar}
                >
                  {shortenAddress(item.address)}
                </CopyableAddress>
              </View>
              <IconButton
                icon="pencil"
                onPress={() => handleEdit(item)}
              />
            </View>
          </Card.Content>
        </Card>
      );
    },
    [handleViewDetail, handleEdit, theme, showCopiedSnackbar, t],
  );

  const keyExtractor = useCallback((item: Subscription) => item.id, []);

  const isSearching = searchVisible && searchQuery.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {searchVisible && (
        <Searchbar
          placeholder={t('subscriptions.searchPlaceholder')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchbar, { backgroundColor: theme.colors.elevation.level2 }]}
          inputStyle={[styles.searchbarInput, { fontSize: Math.round(14 * fontScale) }]}
          autoFocus
        />
      )}
      <FlatList
        style={scrollFill}
        data={displaySubscriptions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          listContentStyle,
          displaySubscriptions.length === 0 && styles.emptyList,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {isSearching
                ? t('subscriptions.searchNoResult')
                : t('subscriptions.noSubscriptions')}
            </Text>
            {!isSearching && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
              >
                {t('subscriptions.addHint')}
              </Text>
            )}
          </View>
        }
      />
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {snackbarMessage || t('common.copied')}
      </Snackbar>
      <AppModal
        visible={ioModal === 'menu'}
        onDismiss={closeIoModal}
        title={t('subscriptions.importExportTitle')}
        actions={[
          {
            label: t('subscriptions.exportData'),
            onPress: () => setIoModal('export'),
            mode: 'outlined',
          },
          {
            label: t('subscriptions.importData'),
            onPress: () => {
              setImportText('');
              setImportError('');
              setIoModal('import');
            },
          },
        ]}
      />
      <AppModal
        visible={ioModal === 'export'}
        onDismiss={closeIoModal}
        title={t('subscriptions.exportTitle')}
        scrollable
        actions={[
          { label: t('common.close'), onPress: closeIoModal },
          { label: t('subscriptions.copyJson'), onPress: handleCopyExportJson },
        ]}
      >
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {state.subscriptions.length === 0
            ? t('subscriptions.exportEmpty')
            : t('subscriptions.exportHint')}
        </Text>
        <TextInput
          mode="outlined"
          multiline
          value={exportJson}
          editable={false}
          style={styles.jsonInput}
        />
      </AppModal>
      <AppModal
        visible={ioModal === 'import'}
        onDismiss={closeIoModal}
        title={t('subscriptions.importTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: closeIoModal },
          { label: t('subscriptions.importConfirm'), onPress: handleImportConfirm },
        ]}
      >
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {t('subscriptions.importHint')}
        </Text>
        <TextInput
          mode="outlined"
          multiline
          value={importText}
          onChangeText={(value) => {
            setImportText(value);
            if (importError) setImportError('');
          }}
          placeholder={t('subscriptions.importPlaceholder')}
          error={!!importError}
          style={styles.jsonInput}
        />
        {importError ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
            {importError}
          </Text>
        ) : null}
      </AppModal>
      <FAB
        icon={searchVisible ? 'close' : 'magnify'}
        style={[styles.fabSearch, { backgroundColor: theme.colors.secondaryContainer }]}
        color={theme.colors.onSecondaryContainer}
        onPress={handleToggleSearch}
      />
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#FFFFFF"
        onPress={handleAdd}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  样式                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 88,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 120,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  addressText: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  separator: {
    height: 12,
  },
  pinTag: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  pinTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    elevation: 4,
  },
  fabSearch: {
    position: 'absolute',
    margin: 16,
    left: 0,
    bottom: 0,
    elevation: 4,
  },
  searchbar: {
    marginHorizontal: 12,
    marginTop: 8,
    elevation: 0,
    borderRadius: 12,
  },
  searchbarInput: {
    fontSize: 14,
  },
  jsonInput: {
    minHeight: 180,
  },
});
