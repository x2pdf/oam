import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import {
  Text,
  Card,
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
import {
  ContentFilterRule,
  contentFilterDedupeKey,
  RootStackParamList,
} from '../types';
import { useNavigation } from '@react-navigation/native';
import { AppModal } from '../components/AppModal';
import { getHeaderChrome } from '../theme';
import {
  buildContentFilterExport,
  parseContentFilterImport,
  stringifyContentFilterExport,
} from '../utils/contentFilterExport';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function ContentFiltersScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const { state, addContentFilters } = useAppContext();
  const { t } = useTranslation();
  const { cardWidth, listContentStyle, centered } = useListColumnLayout();

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [ioModal, setIoModal] = useState<'none' | 'menu' | 'export' | 'import'>('none');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const matchTypeLabel = useCallback(
    (matchType: ContentFilterRule['matchType']) => {
      switch (matchType) {
        case 'text':
          return t('contentFilters.matchTypeText');
        case 'regex':
          return t('contentFilters.matchTypeRegex');
        case 'address':
          return t('contentFilters.matchTypeAddress');
        case 'image':
          return t('contentFilters.matchTypeImage');
      }
    },
    [t],
  );

  const exportJson = useMemo(
    () =>
      stringifyContentFilterExport(
        buildContentFilterExport(
          t('nav.contentFilters'),
          state.contentFilters.map((f) => ({
            description: f.description,
            matchType: f.matchType,
            matchExpression: f.matchExpression,
          })),
        ),
      ),
    [state.contentFilters, t],
  );

  const handleToggleSearch = useCallback(() => {
    setSearchVisible((prev) => {
      if (prev) setSearchQuery('');
      return !prev;
    });
  }, []);

  const handleAdd = useCallback(() => {
    navigation.navigate('ContentFilterForm', { mode: 'add' });
  }, [navigation]);

  useLayoutEffect(() => {
    const headerChrome = getHeaderChrome(theme);
    navigation.setOptions({
      headerLeft: () => (
        <View style={styles.headerLeft}>
          <IconButton
            icon="arrow-left"
            iconColor={headerChrome.tintColor}
            size={22}
            accessibilityLabel={t('common.back')}
            onPress={() => navigation.goBack()}
          />
          <IconButton
            icon="swap-vertical"
            iconColor={headerChrome.tintColor}
            size={22}
            accessibilityLabel={t('contentFilters.importExport')}
            onPress={() => setIoModal('menu')}
          />
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <IconButton
            icon={searchVisible ? 'close' : 'magnify'}
            iconColor={headerChrome.tintColor}
            size={22}
            accessibilityLabel={t('contentFilters.searchPlaceholder')}
            onPress={handleToggleSearch}
          />
          <IconButton
            icon="plus"
            iconColor={headerChrome.tintColor}
            size={22}
            accessibilityLabel={t('form.addContentFilter')}
            onPress={handleAdd}
          />
        </View>
      ),
    });
  }, [navigation, t, theme, searchVisible, handleToggleSearch, handleAdd]);

  const sortedFilters = useMemo(() => {
    return [...state.contentFilters].sort((a, b) =>
      a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }),
    );
  }, [state.contentFilters]);

  const displayFilters = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return sortedFilters;
    try {
      const re = new RegExp(q, 'i');
      return sortedFilters.filter((f) => {
        const typeLabel = matchTypeLabel(f.matchType);
        return (
          re.test(f.description) ||
          re.test(f.matchType) ||
          re.test(typeLabel) ||
          re.test(f.matchExpression)
        );
      });
    } catch {
      const lower = q.toLowerCase();
      return sortedFilters.filter((f) => {
        const typeLabel = matchTypeLabel(f.matchType);
        return (
          f.description.toLowerCase().includes(lower) ||
          f.matchType.toLowerCase().includes(lower) ||
          typeLabel.toLowerCase().includes(lower) ||
          f.matchExpression.toLowerCase().includes(lower)
        );
      });
    }
  }, [sortedFilters, searchQuery, matchTypeLabel]);

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
    const parsed = parseContentFilterImport(importText);
    if (!parsed.ok) {
      const message =
        parsed.error === 'invalidJson'
          ? t('contentFilters.importInvalidJson')
          : parsed.error === 'invalidFormat'
            ? t('contentFilters.importInvalidFormat')
            : t('contentFilters.importEmpty');
      setImportError(message);
      return;
    }

    const existing = new Set(
      state.contentFilters.map((f) =>
        contentFilterDedupeKey(f.matchType, f.matchExpression),
      ),
    );
    const toAdd: ContentFilterRule[] = [];
    let skipped = 0;
    const baseId = Date.now();
    parsed.items.forEach((item, index) => {
      const key = contentFilterDedupeKey(item.matchType, item.matchExpression);
      if (existing.has(key)) {
        skipped += 1;
        return;
      }
      existing.add(key);
      toAdd.push({
        id: `${baseId}-${index}`,
        description: item.description,
        matchType: item.matchType,
        matchExpression: item.matchExpression,
      });
    });

    if (toAdd.length === 0) {
      closeIoModal();
      showSnackbar(t('contentFilters.importResultNoNew'));
      return;
    }

    await addContentFilters(toAdd);
    closeIoModal();
    showSnackbar(t('contentFilters.importResult', { added: toAdd.length, skipped }));
  }, [addContentFilters, closeIoModal, importText, showSnackbar, state.contentFilters, t]);

  useFocusEffect(
    useCallback(() => {
      // Context 驱动，无需手动刷新
    }, []),
  );

  const handleViewDetail = useCallback(
    (item: ContentFilterRule) => {
      navigation.navigate('ContentFilterDetail', { filter: item });
    },
    [navigation],
  );

  const handleEdit = useCallback(
    (item: ContentFilterRule) => {
      navigation.navigate('ContentFilterForm', { mode: 'edit', filter: item });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: ContentFilterRule }) => {
      const typeLabel = matchTypeLabel(item.matchType);
      return (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, width: cardWidth, alignSelf: 'center' },
          ]}
          mode="elevated"
          onPress={() => handleViewDetail(item)}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={48}
                icon="filter-outline"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface }}
                  numberOfLines={1}
                >
                  {typeLabel}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {item.matchExpression}
                </Text>
              </View>
              <IconButton icon="pencil" onPress={() => handleEdit(item)} />
            </View>
          </Card.Content>
        </Card>
      );
    },
    [handleViewDetail, handleEdit, theme, matchTypeLabel, cardWidth],
  );

  const keyExtractor = useCallback((item: ContentFilterRule) => item.id, []);

  const isSearching = searchVisible && searchQuery.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {searchVisible && (
        <Searchbar
          placeholder={t('contentFilters.searchPlaceholder')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[
            styles.searchbar,
            { backgroundColor: theme.colors.elevation.level2 },
            centered && { width: cardWidth, alignSelf: 'center' },
          ]}
          inputStyle={[styles.searchbarInput, { fontSize: Math.round(14 * fontScale) }]}
          autoFocus
        />
      )}
      <FlatList
        style={scrollFill}
        data={displayFilters}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          listContentStyle,
          displayFilters.length === 0 && styles.emptyList,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {isSearching ? t('contentFilters.searchNoResult') : t('contentFilters.empty')}
            </Text>
            {!isSearching && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
              >
                {t('contentFilters.addHint')}
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
        title={t('contentFilters.importExportTitle')}
        actions={[
          {
            label: t('contentFilters.exportData'),
            onPress: () => setIoModal('export'),
            mode: 'outlined',
          },
          {
            label: t('contentFilters.importData'),
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
        title={t('contentFilters.exportTitle')}
        scrollable
        actions={[
          { label: t('common.close'), onPress: closeIoModal },
          { label: t('contentFilters.copyJson'), onPress: handleCopyExportJson },
        ]}
      >
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {state.contentFilters.length === 0
            ? t('contentFilters.exportEmpty')
            : t('contentFilters.exportHint')}
        </Text>
        <TextInput
          mode="outlined"
          multiline
          value={exportJson}
          editable={false}
          scrollEnabled={false}
          style={styles.jsonInput}
        />
      </AppModal>
      <AppModal
        visible={ioModal === 'import'}
        onDismiss={closeIoModal}
        title={t('contentFilters.importTitle')}
        scrollable
        actions={[
          { label: t('common.cancel'), onPress: closeIoModal },
          { label: t('contentFilters.importConfirm'), onPress: handleImportConfirm },
        ]}
      >
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          {t('contentFilters.importHint')}
        </Text>
        <TextInput
          mode="outlined"
          multiline
          value={importText}
          onChangeText={(value) => {
            setImportText(value);
            if (importError) setImportError('');
          }}
          placeholder={t('contentFilters.importPlaceholder')}
          error={!!importError}
          scrollEnabled={false}
          style={styles.jsonInput}
        />
        {importError ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 8 }}>
            {importError}
          </Text>
        ) : null}
        <View
          style={[
            styles.importRiskBox,
            {
              backgroundColor: theme.colors.errorContainer,
              borderColor: theme.colors.error,
            },
          ]}
        >
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.error,
              fontSize: Math.round(13 * fontScale),
              lineHeight: Math.round(18 * fontScale),
            }}
          >
            {t('contentFilters.importRiskWarning')}
          </Text>
        </View>
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 12,
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
  separator: {
    height: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginRight: 8,
  },
  importRiskBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
});
