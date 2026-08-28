import React, { useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import { Text, Card, IconButton, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { RootStackParamList, SendDraft } from '../types';
import { isBlackHoleAddress, shortenAddress } from '../utils/address';
import { showConfirm } from '../utils/alert';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const PREVIEW_MAX = 80;

export default function LocalDraftsScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { cardWidth, listContentStyle } = useListColumnLayout();
  const { state, deleteDraft } = useAppContext();

  const drafts = state.drafts;
  const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';

  const recipientLabel = useCallback(
    (address: string) => {
      if (isBlackHoleAddress(address)) return t('send.recipientBlackHole');
      if (state.profile?.address && address.toLowerCase() === state.profile.address.toLowerCase()) {
        return t('send.recipientSelf');
      }
      return shortenAddress(address);
    },
    [state.profile?.address, t],
  );

  const handleOpen = useCallback(
    (draft: SendDraft) => {
      navigation.navigate('SendData', { draftId: draft.id });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    (draft: SendDraft) => {
      showConfirm(
        t('common.confirmDelete'),
        t('common.confirmDeleteMsg'),
        () => {
          void deleteDraft(draft.id);
        },
        undefined,
        t('common.delete'),
        t('common.cancel'),
      );
    },
    [deleteDraft, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: SendDraft }) => {
      const trimmed = item.text.trim();
      const preview = trimmed
        ? trimmed.length > PREVIEW_MAX
          ? `${trimmed.slice(0, PREVIEW_MAX)}…`
          : trimmed
        : t('send.confirmDataEmpty');
      const timeText = new Date(item.updatedAt).toLocaleString(locale);

      return (
        <Card
          style={[
            styles.card,
            cardWidth != null && { width: cardWidth, alignSelf: 'center' },
            { backgroundColor: theme.colors.surface },
          ]}
          mode="elevated"
          onPress={() => handleOpen(item)}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <View style={styles.cardTextContainer}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {t('drafts.recipient', { name: recipientLabel(item.recipientAddress) })}
                </Text>
                <Text variant="bodyMedium" numberOfLines={3} style={styles.preview}>
                  {preview}
                </Text>
                {item.images.length > 0 && (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                  >
                    {t('send.confirmDataImages', { count: item.images.length })}
                  </Text>
                )}
                {(item.attachments?.length ?? 0) > 0 && (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                  >
                    {t('send.confirmDataAttachments', { count: item.attachments?.length ?? 0 })}
                  </Text>
                )}
                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    marginTop: 4,
                    fontSize: Math.round(12 * fontScale),
                  }}
                >
                  {t('drafts.updatedAt', { time: timeText })}
                </Text>
              </View>
              <IconButton icon="delete-outline" onPress={() => handleDelete(item)} />
            </View>
          </Card.Content>
        </Card>
      );
    },
    [cardWidth, fontScale, handleDelete, handleOpen, locale, recipientLabel, t, theme.colors],
  );

  const keyExtractor = useCallback((item: SendDraft) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={scrollFill}
        data={drafts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          listContentStyle,
          drafts.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('drafts.empty')}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
            >
              {t('drafts.emptyHint')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
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
  separator: {
    height: 12,
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
    alignItems: 'flex-start',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 8,
    marginRight: 4,
  },
  preview: {
    marginTop: 4,
    lineHeight: 20,
  },
});
