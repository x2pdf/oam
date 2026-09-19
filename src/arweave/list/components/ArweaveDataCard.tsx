import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useThemePreference } from '../../../context/ThemeContext';
import { wasRecentImagePress } from '../../../adapter/wrapImagePress';
import { ArweaveListItem } from '../types';
import { ArweaveContentBody } from '../../../components/ArweaveContentBody';
import { getArListDisplayTime } from '../utils/time';

interface ArweaveDataCardProps {
  item: ArweaveListItem;
  cardWidth?: number;
  onPress?: () => void;
}

export const ArweaveDataCard: React.FC<ArweaveDataCardProps> = React.memo(
  ({ item, cardWidth, onPress }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const { fontScale } = useThemePreference();

    const displayTime = getArListDisplayTime(item.timestamp, t);

    const renderBody = () => {
      if (!item.contentItems.length) return null;
      return <ArweaveContentBody items={item.contentItems} truncate />;
    };

    const card = (
      <Card
        style={[
          styles.card,
          cardWidth != null && { width: cardWidth, alignSelf: 'center' },
          { backgroundColor: theme.colors.surface },
        ]}
        mode="elevated"
      >
        <Card.Content style={styles.cardContent}>
          <View style={styles.cardHeader}>
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

          {renderBody()}

          {displayTime ? (
            <Text
              variant="labelSmall"
              style={[
                styles.timeText,
                { color: theme.colors.onSurfaceVariant, fontSize: Math.round(11 * fontScale) },
              ]}
            >
              {displayTime}
            </Text>
          ) : null}
        </Card.Content>
      </Card>
    );

    if (onPress) {
      return (
        <Pressable
          onPress={() => {
            if (wasRecentImagePress()) return;
            onPress();
          }}
          android_ripple={{ color: theme.colors.primary + '20' }}
        >
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  timeText: {
    textAlign: 'right',
    fontSize: 11,
    marginTop: 4,
  },
});
