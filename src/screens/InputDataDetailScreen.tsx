import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Card, Button, IconButton, useTheme, Snackbar } from 'react-native-paper';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../types';
import { AddressWithActions } from '../components/AddressWithActions';
import { RichContentRenderer } from '../components/RichContentRenderer';
import { CONTENT_KIND_I18N_KEY } from '../display';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';

type RouteProps = RouteProp<RootStackParamList, 'InputDataDetail'>;

export default function InputDataDetailScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const route = useRoute<RouteProps>();
  const { item } = route.params;
  const { addFavorite, removeFavorite, isFavorite } = useAppContext();
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const kind = item.contentKind ?? 'RAW';
  const rawHex = item.rawInput || item.description || '';
  const favorited = isFavorite(item.id);

  const copyableContent = useMemo(() => {
    if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
      return item.oampItems
        .filter((entry) => entry.type === 'text')
        .map((entry) => (entry.type === 'text' ? entry.content : ''))
        .join('\n')
        .trim();
    }
    if (kind === 'UTF-8' && item.textContent) {
      return item.textContent;
    }
    return rawHex;
  }, [kind, item.oampItems, item.textContent, rawHex]);

  const showSnackbar = useCallback((message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  }, []);

  const showCopiedSnackbar = useCallback(() => {
    showSnackbar(t('common.copied'));
  }, [showSnackbar, t]);

  const handleCopyContent = useCallback(async () => {
    if (!copyableContent) return;
    await Clipboard.setStringAsync(copyableContent);
    showCopiedSnackbar();
  }, [copyableContent, showCopiedSnackbar]);

  const handleCopyTxHash = useCallback(async () => {
    if (!item.id) return;
    await Clipboard.setStringAsync(item.id);
    showCopiedSnackbar();
  }, [item.id, showCopiedSnackbar]);

  const handleCopyTime = useCallback(async () => {
    if (!item.lastActive) return;
    await Clipboard.setStringAsync(item.lastActive);
    showCopiedSnackbar();
  }, [item.lastActive, showCopiedSnackbar]);

  const handleToggleFavorite = useCallback(async () => {
    if (favorited) {
      await removeFavorite(item.id);
      showSnackbar(t('detail.unfavorited'));
    } else {
      await addFavorite(item);
      showSnackbar(t('detail.favorited'));
    }
  }, [favorited, item, addFavorite, removeFavorite, showSnackbar, t]);

  const renderBody = () => {
    if (showRaw) {
      return (
        <Text variant="bodyMedium" style={[styles.rawHexText, { fontSize: Math.round(12 * fontScale) }]} selectable>
          {rawHex}
        </Text>
      );
    }

    if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
      return <RichContentRenderer items={item.oampItems} selectable />;
    }

    if (kind === 'UTF-8' && item.textContent) {
      return (
        <Text variant="bodyMedium" style={styles.contentText} selectable>
          {item.textContent}
        </Text>
      );
    }

    return (
      <View>
        {kind === 'OAMP_ENCRYPTED' ? (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
          >
            {t('home.encryptedHint')}
          </Text>
        ) : null}
        <Text variant="bodyMedium" style={[styles.rawHexText, { fontSize: Math.round(12 * fontScale) }]} selectable>
          {rawHex}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle]}>
        <ListColumn>
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleSmall"
                style={[styles.sectionTitle, styles.sectionHeaderTitle, { color: theme.colors.primary }]}
              >
                {t('detail.content')}
              </Text>
              <View style={styles.headerActions}>
                {copyableContent ? (
                  <IconButton
                    icon="content-copy"
                    size={18}
                    onPress={handleCopyContent}
                    iconColor={theme.colors.primary}
                    style={styles.copyBtn}
                    accessibilityLabel={t('common.copy')}
                  />
                ) : null}
                <IconButton
                  icon="information-outline"
                  size={18}
                  onPress={() => setShowRaw(!showRaw)}
                  iconColor={showRaw ? theme.colors.tertiary : theme.colors.primary}
                  style={styles.copyBtn}
                  accessibilityLabel={t('detail.showRaw')}
                />
              </View>
            </View>
            {renderBody()}
          </Card.Content>
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              {t('detail.addresses')}
            </Text>
            {item.from ? (
              <AddressWithActions
                address={item.from}
                label={t('detail.from')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
            {item.to ? (
              <AddressWithActions
                address={item.to}
                label={t('detail.to')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
            {!item.from && !item.to ? (
              <AddressWithActions
                address={item.address}
                label={t('common.address')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            ) : null}
          </Card.Content>
        </Card>

        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.txHash')}
              </Text>
              <View style={styles.valueRow}>
                <Text variant="bodySmall" style={[styles.monoText, styles.valueText, { fontSize: Math.round(12 * fontScale) }]} selectable>
                  {item.id}
                </Text>
                <IconButton
                  icon="content-copy"
                  size={18}
                  onPress={handleCopyTxHash}
                  iconColor={theme.colors.primary}
                  style={styles.copyIconBtn}
                  accessibilityLabel={t('common.copy')}
                />
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.time')}
              </Text>
              <View style={styles.valueRow}>
                <Text variant="bodyMedium">{item.lastActive}</Text>
                <IconButton
                  icon="content-copy"
                  size={18}
                  onPress={handleCopyTime}
                  iconColor={theme.colors.primary}
                  style={styles.copyIconBtn}
                  accessibilityLabel={t('common.copy')}
                />
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('detail.type')}
              </Text>
              <Text
                variant="labelSmall"
                style={[
                  styles.kindBadge,
                  { color: theme.colors.primary, borderColor: theme.colors.outline, fontSize: Math.round(10 * fontScale) },
                ]}
              >
                {t(CONTENT_KIND_I18N_KEY[kind])}
              </Text>
            </View>

            {item.balance ? (
              <View style={styles.metaRow}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('detail.value')}
                </Text>
                <Text variant="bodyMedium">{item.balance}</Text>
              </View>
            ) : null}
          </Card.Content>
        </Card>

        <Button
          mode={favorited ? 'outlined' : 'contained'}
          icon={favorited ? 'star-off' : 'star-outline'}
          onPress={handleToggleFavorite}
          style={styles.favoriteButton}
        >
          {favorited ? t('detail.unfavorite') : t('detail.favorite')}
        </Button>
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
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 12,
    marginBottom: 12,
  },
  metaRow: {
    marginBottom: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  valueText: {
    flex: 1,
  },
  copyIconBtn: {
    margin: 0,
    width: 32,
    height: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderTitle: {
    marginBottom: 0,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  copyBtn: {
    margin: 0,
    width: 32,
    height: 32,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    marginTop: 4,
  },
  kindBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  contentText: {
    lineHeight: 22,
  },
  rawHexText: {
    lineHeight: 20,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  favoriteButton: {
    marginTop: 4,
    borderRadius: 12,
  },
});
