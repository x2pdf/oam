import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Avatar, useTheme, IconButton, Dialog, Portal, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function AddInfoSelectScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();

  const [visible, setVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'create' | 'recover' | 'privateKey' | null>(null);

  const handleCreateNewWallet = () => {
    if (state.profile) {
      setPendingAction('create');
      setVisible(true);
    } else {
      navigation.navigate('WalletDisclaimer');
    }
  };

  const handleMnemonicRecover = () => {
    if (state.profile) {
      setPendingAction('recover');
      setVisible(true);
    } else {
      navigation.navigate('RecoverDisclaimer');
    }
  };

  const confirmReplacement = () => {
    setVisible(false);
    if (pendingAction === 'create') {
      navigation.navigate('WalletDisclaimer');
    } else if (pendingAction === 'recover') {
      navigation.navigate('RecoverDisclaimer');
    } else if (pendingAction === 'privateKey') {
      navigation.navigate('PrivateKeyDisclaimer');
    }
  };

  const handlePrivateKeyRecover = () => {
    if (state.profile) {
      setPendingAction('privateKey');
      setVisible(true);
    } else {
      navigation.navigate('PrivateKeyDisclaimer');
    }
  };

  const options = [
    {
      title: t('nav.addAddressForm'),
      icon: 'magnify',
      onPress: () => navigation.navigate('AddAddressForm', { mode: 'add', source: 'profile' }),
      color: theme.colors.primary,
      containerColor: theme.colors.primaryContainer,
    },
    {
      title: t('wallet.createNewWallet'),
      icon: 'plus-circle-outline',
      onPress: handleCreateNewWallet,
      color: theme.colors.secondary,
      containerColor: theme.colors.secondaryContainer,
    },
    {
      title: t('wallet.mnemonicRecover'),
      icon: 'text-box-search-outline',
      onPress: handleMnemonicRecover,
      color: theme.colors.tertiary,
      containerColor: theme.colors.tertiaryContainer,
    },
    {
      title: t('wallet.privateKeyRecover'),
      icon: 'key-outline',
      onPress: handlePrivateKeyRecover,
      color: theme.colors.error,
      containerColor: theme.colors.errorContainer,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}>
        {options.map((option, index) => (
          <Card
            key={index}
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
            onPress={option.onPress}
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.row}>
                <Avatar.Icon
                  size={48}
                  icon={option.icon}
                  style={{ backgroundColor: option.containerColor }}
                  color={option.color}
                />
                <View style={styles.textContainer}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                    {option.title}
                  </Text>
                </View>
                <IconButton icon="chevron-right" />
              </View>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>{t('wallet.confirmReplaceTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('wallet.confirmReplaceMsg', { desc: state.profile?.description })}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>{t('common.cancel')}</Button>
            <Button onPress={confirmReplacement}>{t('common.confirm')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  cardContent: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
});
