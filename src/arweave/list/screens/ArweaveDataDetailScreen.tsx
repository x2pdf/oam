import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, Card, IconButton, useTheme, Snackbar } from 'react-native-paper';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { RootStackParamList } from '../../../types';
import { AddressWithActions } from '../../../components/AddressWithActions';
import { useThemePreference } from '../../../context/ThemeContext';
import { ArweaveContentBody } from '../../../components/ArweaveContentBody';
import { getArListDisplayTime } from '../utils/time';
import { arweaveHref } from '../utils/mime';

type RouteProps = RouteProp<RootStackParamList, 'ArweaveDataDetail'>;

export default function ArweaveDataDetailScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const route = useRoute<RouteProps>();
  const { item } = route.params;
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const displayTime = useMemo(() => getArListDisplayTime(item.timestamp, t), [item.timestamp, t]);
  const uri = useMemo(() => (item.id ? arweaveHref(item.id) : ''), [item.id]);

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarMessage(t('common.copied'));
    setSnackbarVisible(true);
  }, [t]);

  const handleCopyTxId = useCallback(async () => {
    if (!item.id) return;
    await Clipboard.setStringAsync(item.id);
    showCopiedSnackbar();
  }, [item.id, showCopiedSnackbar]);

  const handleCopyUri = useCallback(async () => {
    if (!uri) return;
    await Clipboard.setStringAsync(uri);
    showCopiedSnackbar();
  }, [uri, showCopiedSnackbar]);

  const handleCopyTime = useCallback(async () => {
    if (!displayTime) return;
    await Clipboard.setStringAsync(displayTime);
    showCopiedSnackbar();
  }, [displayTime, showCopiedSnackbar]);

  const renderBody = () => {
    if (!item.contentItems.length) return null;
    return <ArweaveContentBody items={item.contentItems} />;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle]}>
        <ListColumn>
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.contentCardBody}>
              <Text
                variant="titleSmall"
                style={[styles.sectionTitle, { color: theme.colors.primary }]}
              >
                {t('detail.content')}
              </Text>
              {renderBody()}
            </Card.Content>
          </Card>

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text
                variant="titleSmall"
                style={[styles.sectionTitle, { color: theme.colors.primary }]}
              >
                {t('arweave.dataTxId')}
              </Text>
              <View style={styles.valueRow}>
                <Text
                  variant="bodySmall"
                  style={[styles.monoText, styles.valueText, { fontSize: Math.round(12 * fontScale) }]}
                  selectable
                >
                  {item.id}
                </Text>
                <IconButton
                  icon="content-copy"
                  size={18}
                  onPress={handleCopyTxId}
                  iconColor={theme.colors.primary}
                  style={styles.copyIconBtn}
                  accessibilityLabel={t('common.copy')}
                />
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text
                variant="titleSmall"
                style={[styles.sectionTitle, { color: theme.colors.primary }]}
              >
                {t('arweave.dataUri')}
              </Text>
              <View style={styles.valueRow}>
                <Text
                  variant="bodySmall"
                  style={[styles.monoText, styles.valueText, { fontSize: Math.round(12 * fontScale) }]}
                  selectable
                >
                  {uri}
                </Text>
                <IconButton
                  icon="content-copy"
                  size={18}
                  onPress={handleCopyUri}
                  iconColor={theme.colors.primary}
                  style={styles.copyIconBtn}
                  accessibilityLabel={t('common.copy')}
                />
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                {t('detail.addresses')}
              </Text>
              <AddressWithActions
                address={item.address}
                label={t('common.address')}
                showFullAddress
                onCopied={showCopiedSnackbar}
              />
            </Card.Content>
          </Card>

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content>
              {displayTime ? (
                <View style={styles.metaRow}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('detail.time')}
                  </Text>
                  <View style={styles.valueRow}>
                    <Text variant="bodyMedium">{displayTime}</Text>
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
              ) : null}

              <View style={styles.metaRow}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {t('detail.type')}
                </Text>
                <Text
                  variant="labelSmall"
                  style={[
                    styles.kindBadge,
                    {
                      color: theme.colors.primary,
                      borderColor: theme.colors.outline,
                      fontSize: Math.round(10 * fontScale),
                    },
                  ]}
                >
                  {item.badgeLabel}
                </Text>
              </View>
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
  contentCardBody: {
    paddingVertical: 12,
    paddingHorizontal: 8,
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
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
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
});
