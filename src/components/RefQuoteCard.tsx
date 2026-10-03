import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ContentItem } from '../mypayload';
import { InputDataItem } from '../types';
import { useAppContext } from '../context/AppContext';
import { useReferencedTx } from '../datasource/refResolver';
import { isHiddenByContentFilters } from '../utils/contentFilterApply';

const QUOTE_MAX_CHARS = 300;
const QUOTE_MAX_LINES = 6;

/** 被引用内容只取文本：图片 → “[图片]”，链接 → 标签，不嵌套引用。 */
function quoteText(items: ContentItem[] | undefined, imageLabel: string): string {
  const parts: string[] = [];
  for (const entry of items ?? []) {
    if (entry.type === 'text') parts.push(entry.content);
    else if (entry.type === 'image') parts.push(imageLabel);
    else if (entry.type === 'link') parts.push(entry.label || entry.href);
  }
  const joined = parts.filter(Boolean).join('\n').trim();
  return joined.length > QUOTE_MAX_CHARS ? `${joined.slice(0, QUOTE_MAX_CHARS)}…` : joined;
}

interface Props {
  refHash: string;
  action: string;
}

export const RefQuoteCard: React.FC<Props> = ({ refHash }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { state } = useAppContext();
  const { view, retry } = useReferencedTx(refHash);

  const hidden = useMemo(
    () => view.state === 'ok' && isHiddenByContentFilters(view.item as InputDataItem, state.contentFilters),
    [view, state.contentFilters],
  );

  const muted = { color: theme.colors.onSurfaceVariant };
  let body: React.ReactNode;
  let onPress: (() => void) | undefined;

  if (view.state === 'loading') {
    body = (
      <View style={styles.row}>
        <ActivityIndicator size={14} />
        <Text variant="bodySmall" style={[styles.rowText, muted]}>{t('refQuote.loading')}</Text>
      </View>
    );
  } else if (view.state === 'missing' || view.state === 'error') {
    onPress = retry;
    body = (
      <Text variant="bodySmall" style={muted}>
        {view.state === 'missing' ? t('refQuote.missing') : t('refQuote.error')}
        {' · '}
        {t('refQuote.retry')}
      </Text>
    );
  } else if (view.state === 'unreadable') {
    body = (
      <Text variant="bodySmall" style={muted}>
        {view.reason === 'encrypted' ? t('refQuote.encrypted') : t('refQuote.unreadable')}
      </Text>
    );
  } else if (hidden) {
    body = <Text variant="bodySmall" style={muted}>{t('refQuote.filtered')}</Text>;
  } else {
    const text = quoteText(view.item.oampItems, t('refQuote.image'));
    body = (
      <Text variant="bodyMedium" numberOfLines={QUOTE_MAX_LINES} style={{ color: theme.colors.onSurfaceVariant }}>
        {text || t('refQuote.unreadable')}
      </Text>
    );
  }

  const content = (
    <View
      style={[
        styles.card,
        { borderLeftColor: theme.colors.outline, backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      {body}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>
  ) : (
    content
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderRadius: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { marginLeft: 8 },
});
