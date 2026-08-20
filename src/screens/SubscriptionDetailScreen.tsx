import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Button, useTheme, Snackbar, IconButton } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { AddressWithActions } from '../components/AddressWithActions';
import { getHeaderChrome } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionDetail'>;

export default function SubscriptionDetailScreen({ route, navigation }: Props) {
  const { subscription } = route.params;
  const theme = useTheme();
  const { t } = useTranslation();
  const { listContentStyle } = useListColumnLayout();
  const { state } = useAppContext();
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  useLayoutEffect(() => {
    const headerChrome = getHeaderChrome(theme);
    navigation.setOptions({
      title: subscription.description || t('nav.subscriptionDetail'),
      headerRight: () => (
        <IconButton
          icon="pencil-outline"
          iconColor={headerChrome.tintColor}
          size={22}
          onPress={() =>
            navigation.navigate('SubscriptionForm', {
              mode: 'edit',
              source: 'subscriptions',
              subscription,
            })
          }
        />
      ),
    });
  }, [navigation, subscription, t, theme]);

  const handleViewAll = useCallback(() => {
    navigation.navigate('AddressDataList', {
      address: subscription.address,
      title: subscription.description,
    });
  }, [navigation, subscription]);

  const handleViewConversation = useCallback(() => {
    const profileAddress = state.profile?.address?.trim();
    if (!profileAddress) {
      Alert.alert(t('common.tip'), t('subscriptions.needProfileForConversation'), [
        { text: t('common.ok') },
      ]);
      return;
    }

    navigation.navigate('AddressDataList', {
      address: subscription.address,
      title: subscription.description,
      peerAddress: profileAddress,
    });
  }, [navigation, subscription, state.profile?.address, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={scrollFill} contentContainerStyle={[styles.content, listContentStyle]}>
        <ListColumn>
        <Text
          variant="titleMedium"
          style={[styles.description, { color: theme.colors.onSurface }]}
        >
          {subscription.description}
        </Text>

        <AddressWithActions
          address={subscription.address}
          label={t('common.address')}
          showFullAddress
          onCopied={() => setSnackbarVisible(true)}
          showInfo={false}
        />

        <View style={styles.buttonGroup}>
          <Button
            mode="contained"
            icon="swap-vertical"
            onPress={handleViewAll}
            style={styles.button}
            buttonColor={theme.colors.primary}
            contentStyle={styles.buttonContent}
          >
            {t('subscriptions.viewAllData')}
          </Button>

          <Button
            mode="outlined"
            icon="message-text-outline"
            onPress={handleViewConversation}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            {t('subscriptions.viewConversation')}
          </Button>
        </View>
        </ListColumn>
      </ScrollView>

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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  description: {
    fontWeight: '700',
    marginBottom: 16,
  },
  buttonGroup: {
    marginTop: 24,
    gap: 12,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 6,
  },
});
