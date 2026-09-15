import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { scrollFill } from '../theme/scroll';
import { ListColumn, useListColumnLayout } from '../theme/layout';
import { Text, Card, Avatar, useTheme, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';
import { AppModal } from '../components/AppModal';
import { EthPasswordGateModal } from '../arweave/components/EthPasswordGateModal';
import { setVerifiedOldPassword } from '../wallet/paymentPasswordContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PendingAction = 'create' | 'recover' | 'privateKey' | 'readOnly' | null;
type WalletReplaceAction = 'create' | 'recover' | 'privateKey';

function shortenAddress(address: string): string {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function AddInfoSelectScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const profile = state.profile;
  const isWriteWallet = profile?.walletType === 'write';
  const { listContentStyle } = useListColumnLayout();

  const [visible, setVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [passwordGateVisible, setPasswordGateVisible] = useState(false);
  const [pendingAfterPassword, setPendingAfterPassword] = useState<WalletReplaceAction | null>(null);

  const askReplaceThen = (action: PendingAction, fallback: () => void) => {
    if (profile) {
      setPendingAction(action);
      setVisible(true);
    } else {
      fallback();
    }
  };

  const handleManualAddress = () => {
    if (!profile) {
      navigation.navigate('AddAddressForm', { mode: 'add', source: 'profile' });
      return;
    }
    if (isWriteWallet) {
      setPendingAction('readOnly');
      setVisible(true);
      return;
    }
    navigation.navigate('AddAddressForm', {
      mode: 'edit',
      source: 'profile',
      subscription: profile,
    });
  };

  const proceedToWalletAction = (action: WalletReplaceAction) => {
    if (action === 'create') {
      navigation.navigate('WalletDisclaimer');
    } else if (action === 'recover') {
      navigation.navigate('RecoverDisclaimer');
    } else {
      navigation.navigate('PrivateKeyDisclaimer');
    }
  };

  const confirmReplacement = () => {
    setVisible(false);
    if (pendingAction === 'readOnly') {
      navigation.navigate('AddAddressForm', { mode: 'add', source: 'profile' });
      return;
    }
    if (
      pendingAction === 'create'
      || pendingAction === 'recover'
      || pendingAction === 'privateKey'
    ) {
      if (isWriteWallet) {
        setPendingAfterPassword(pendingAction);
        setPasswordGateVisible(true);
      } else {
        proceedToWalletAction(pendingAction);
      }
    }
  };

  const handlePasswordVerified = (password: string) => {
    setVerifiedOldPassword(password);
    setPasswordGateVisible(false);
    if (pendingAfterPassword) {
      proceedToWalletAction(pendingAfterPassword);
      setPendingAfterPassword(null);
    }
  };

  const handlePasswordDismiss = () => {
    setPasswordGateVisible(false);
    setPendingAfterPassword(null);
  };

  const dialogCopy = useMemo(() => {
    const desc = profile?.description || shortenAddress(profile?.address || '');
    if (pendingAction === 'readOnly') {
      return {
        title: t('wallet.confirmReplaceToReadOnlyTitle'),
        message: t('wallet.confirmReplaceToReadOnlyMsg', { desc }),
      };
    }
    if (isWriteWallet) {
      return {
        title: t('wallet.confirmReplaceTitle'),
        message: t('wallet.confirmReplaceMsg', { desc }),
      };
    }
    return {
      title: t('wallet.confirmReplaceReadOnlyTitle'),
      message: t('wallet.confirmReplaceReadOnlyMsg', { desc }),
    };
  }, [pendingAction, isWriteWallet, profile, t]);

  const options = [
    {
      title: profile ? t('wallet.editCurrentAddress') : t('nav.addAddressForm'),
      hint: t('wallet.optionAddAddressHint'),
      icon: 'magnify',
      onPress: handleManualAddress,
      color: theme.colors.primary,
      containerColor: theme.colors.primaryContainer,
    },
    {
      title: t('wallet.createNewWallet'),
      hint: t('wallet.optionCreateHint'),
      icon: 'plus-circle-outline',
      onPress: () => askReplaceThen('create', () => navigation.navigate('WalletDisclaimer')),
      color: theme.colors.secondary,
      containerColor: theme.colors.secondaryContainer,
    },
    {
      title: t('wallet.mnemonicRecover'),
      hint: t('wallet.optionMnemonicHint'),
      icon: 'text-box-search-outline',
      onPress: () => askReplaceThen('recover', () => navigation.navigate('RecoverDisclaimer')),
      color: theme.colors.tertiary,
      containerColor: theme.colors.tertiaryContainer,
    },
    {
      title: t('wallet.privateKeyRecover'),
      hint: t('wallet.optionPrivateKeyHint'),
      icon: 'key-outline',
      onPress: () => askReplaceThen('privateKey', () => navigation.navigate('PrivateKeyDisclaimer')),
      color: theme.colors.error,
      containerColor: theme.colors.errorContainer,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.scrollContent, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
        {profile && (
          <Card
            mode="contained"
            style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          >
            <Card.Content>
              <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                {t('wallet.currentWalletLabel')}
                {' · '}
                {isWriteWallet ? t('profile.fullFunction') : t('profile.readOnly')}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 4 }}>
                {profile.description || shortenAddress(profile.address)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {shortenAddress(profile.address)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurface, marginTop: 10, lineHeight: 20 }}>
                {isWriteWallet ? t('wallet.currentWriteHint') : t('wallet.currentReadOnlyHint')}
              </Text>
            </Card.Content>
          </Card>
        )}

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
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  >
                    {option.hint}
                  </Text>
                </View>
                <IconButton icon="chevron-right" />
              </View>
            </Card.Content>
          </Card>
        ))}
        </ListColumn>
      </ScrollView>

      <AppModal
        visible={visible}
        onDismiss={() => setVisible(false)}
        title={dialogCopy.title}
        actions={[
          { label: t('common.cancel'), onPress: () => setVisible(false) },
          { label: t('common.confirm'), onPress: confirmReplacement },
        ]}
      >
        <Text variant="bodyMedium">{dialogCopy.message}</Text>
      </AppModal>

      <EthPasswordGateModal
        visible={passwordGateVisible}
        onDismiss={handlePasswordDismiss}
        onVerified={handlePasswordVerified}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  banner: {
    marginBottom: 16,
    borderRadius: 12,
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
