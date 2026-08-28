import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import {
  Text,
  Card,
  Avatar,
  useTheme,
  Searchbar,
} from 'react-native-paper';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useThemePreference } from '../context/ThemeContext';
import { Subscription, RootStackParamList } from '../types';
import { useNavigation } from '@react-navigation/native';
import { shortenAddress } from '../utils/address';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function FollowListSelectionScreen() {
  const theme = useTheme();
  const { fontScale } = useThemePreference();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();

  const [searchQuery, setSearchQuery] = useState('');

  const sortedSubscriptions = useMemo(() => {
    return [...state.subscriptions].sort((a, b) => {
      const wa = a.pinWeight ?? 0;
      const wb = b.pinWeight ?? 0;
      const aPinned = wa > 0;
      const bPinned = wb > 0;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        if (wa !== wb) return wb - wa;
        return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
      }
      return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
    });
  }, [state.subscriptions]);

  const displaySubscriptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return sortedSubscriptions;
    try {
      const re = new RegExp(q, 'i');
      return sortedSubscriptions.filter(
        (s) => re.test(s.address) || re.test(s.description),
      );
    } catch {
      const lower = q.toLowerCase();
      return sortedSubscriptions.filter(
        (s) =>
          s.address.toLowerCase().includes(lower) ||
          s.description.toLowerCase().includes(lower),
      );
    }
  }, [sortedSubscriptions, searchQuery]);

  const handleSelect = useCallback(
    (item: Subscription) => {
      navigation.navigate('SendData', { recipientAddress: item.address });
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
          onPress={() => handleSelect(item)}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.row}>
              <Avatar.Icon
                size={40}
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
                <Text
                  variant="titleMedium"
                  style={[styles.addressText, { color: theme.colors.primary }]}
                >
                  {shortenAddress(item.address)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      );
    },
    [handleSelect, theme, fontScale, t],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Searchbar
        placeholder={t('subscriptions.searchPlaceholder')}
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={[styles.searchbar, { backgroundColor: theme.colors.elevation.level2 }]}
        inputStyle={[styles.searchbarInput, { fontSize: Math.round(14 * fontScale) }]}
        autoFocus
      />
      <FlatList
        style={scrollFill}
        data={displaySubscriptions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
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
              {searchQuery.trim().length > 0
                ? t('subscriptions.searchNoResult')
                : t('subscriptions.noSubscriptions')}
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
    paddingTop: 80,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
    marginHorizontal: 12,
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
  searchbar: {
    marginHorizontal: 12,
    marginTop: 8,
    elevation: 0,
    borderRadius: 12,
  },
  searchbarInput: {
    fontSize: 14,
  },
});
