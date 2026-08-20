import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { useListColumnLayout } from '../theme/layout';
import { Text, useTheme, Snackbar } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { FavoriteItem, InputDataItem, RootStackParamList } from '../types';
import { InputDataCard } from '../components/InputDataCard';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function LocalFavoritesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { cardWidth, listContentStyle } = useListColumnLayout();
  const { state } = useAppContext();
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const favorites = state.favorites;

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarVisible(true);
  }, []);

  const handleItemPress = useCallback(
    (item: InputDataItem) => {
      navigation.navigate('InputDataDetail', { item });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: FavoriteItem }) => (
      <InputDataCard
        item={item.item}
        cardWidth={cardWidth}
        onAddressCopied={showCopiedSnackbar}
        onPress={() => handleItemPress(item.item)}
      />
    ),
    [cardWidth, showCopiedSnackbar, handleItemPress],
  );

  const keyExtractor = useCallback((entry: FavoriteItem) => entry.item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={scrollFill}
        data={favorites}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          listContentStyle,
          favorites.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {t('favorites.empty')}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
            >
              {t('favorites.emptyHint')}
            </Text>
          </View>
        }
      />

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={2000}
      >
        {t('common.copied')}
      </Snackbar>
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
});
