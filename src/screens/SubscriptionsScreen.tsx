import React, { useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import {
  Text,
  List,
  FAB,
  useTheme,
  IconButton,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { Subscription, RootStackParamList } from '../types';
import { useNavigation } from '@react-navigation/native';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

/* ------------------------------------------------------------------ */
/*  订阅列表屏幕                                                       */
/* ------------------------------------------------------------------ */

export default function SubscriptionsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();

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
    ({ item }: { item: Subscription }) => (
      <List.Item
        title={item.description}
        titleNumberOfLines={2}
        description={item.address.length > 20 ? `${item.address.slice(0, 20)}...` : item.address}
        descriptionNumberOfLines={1}
        onPress={() => handleViewDetail(item)}
        style={styles.listItem}
        left={(props) => (
          <List.Icon
            {...props}
            icon="bookmark-outline"
            color={theme.colors.primary}
          />
        )}
        right={(props) => (
          <IconButton
            {...props}
            icon="pencil-outline"
            size={20}
            iconColor={theme.colors.onSurfaceVariant}
            onPress={() => handleEdit(item)}
          />
        )}
      />
    ),
    [handleViewDetail, handleEdit, theme],
  );

  const keyExtractor = useCallback((item: Subscription) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={state.subscriptions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          state.subscriptions.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('subscriptions.noSubscriptions')}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
            >
              {t('subscriptions.addHint')}
            </Text>
          </View>
        }
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
    paddingTop: 8,
    paddingBottom: 88,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
  },
  listItem: {
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    elevation: 4,
  },
});
