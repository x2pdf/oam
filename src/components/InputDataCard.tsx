import React from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { InputDataItem } from '../types';
import { RichContentRenderer } from './RichContentRenderer';
import { CopyableAddress } from './CopyableAddress';
import { shortenAddress } from '../utils/address';
import { CONTENT_KIND_I18N_KEY } from '../display';

interface InputDataCardProps {
  item: InputDataItem;
  cardWidth?: number;
  onAddressCopied?: () => void;
  onPress?: () => void;
}

export const InputDataCard: React.FC<InputDataCardProps> = React.memo(
  ({ item, cardWidth, onAddressCopied, onPress }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const kind = item.contentKind ?? 'RAW';
    const rawHex = item.rawInput || item.description || '';

    const renderBody = () => {
      if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
        return <RichContentRenderer items={item.oampItems} />;
      }

      if (kind === 'UTF-8' && item.textContent) {
        return (
          <Text variant="bodyMedium" style={styles.inputDataText}>
            {item.textContent}
          </Text>
        );
      }

      return (
        <View>
          {kind === 'OAMP_ENCRYPTED' ? (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
            >
              {t('home.encryptedHint')}
            </Text>
          ) : null}
          <Text variant="bodyMedium" style={styles.rawHexText} numberOfLines={8}>
            {rawHex}
          </Text>
        </View>
      );
    };

    const card = (
      <Card
        style={[
          styles.card,
          cardWidth != null && { width: cardWidth },
          { backgroundColor: theme.colors.surface },
        ]}
        mode="elevated"
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <CopyableAddress
              address={item.address}
              variant="titleMedium"
              style={[styles.addressLabel, { color: theme.colors.primary, flex: 1 }]}
              onCopied={onAddressCopied}
            >
              {shortenAddress(item.address)} ({item.name})
            </CopyableAddress>
            <Text
              variant="labelSmall"
              style={[
                styles.kindBadge,
                { color: theme.colors.primary, borderColor: theme.colors.outline },
              ]}
            >
              {t(CONTENT_KIND_I18N_KEY[kind])}
            </Text>
          </View>

          {renderBody()}

          <Text
            variant="labelSmall"
            style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.lastActive}
          </Text>
        </Card.Content>
      </Card>
    );

    if (onPress) {
      return (
        <Pressable onPress={onPress} android_ripple={{ color: theme.colors.primary + '20' }}>
          {card}
        </Pressable>
      );
    }

    return card;
  },
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  addressLabel: {
    fontWeight: '700',
    marginBottom: 0,
    marginRight: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kindBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    fontSize: 10,
    fontWeight: '700',
  },
  inputDataText: {
    lineHeight: 20,
    marginBottom: 4,
  },
  rawHexText: {
    lineHeight: 18,
    marginBottom: 4,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  timeText: {
    textAlign: 'right',
    fontSize: 11,
    marginTop: 4,
  },
});
