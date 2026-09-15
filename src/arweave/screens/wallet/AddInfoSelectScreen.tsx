import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { scrollFill } from '../../../theme/scroll';
import { ListColumn, useListColumnLayout } from '../../../theme/layout';
import { Text, Card, Avatar, useTheme, IconButton, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../../types';
import { useAppContext } from '../../../context/AppContext';
import { AppModal } from '../../../components/AppModal';
import { EthPasswordGateModal } from '../../components/EthPasswordGateModal';
import { checkEthKeystoreExists, checkEthWalletGate } from '../../wallet/ethWalletGate';
import { setVerifiedOldPassword } from '../../wallet/verifiedEthPassword';
import { copyAddress } from '../../../components/CopyableAddress';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PendingAction = 'create' | 'import' | null;

function shortenAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AddInfoSelectScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();
  const { t } = useTranslation();
  const arProfile = state.arProfile;
  const ethProfile = state.profile;
  const { listContentStyle } = useListColumnLayout();

  const [replaceVisible, setReplaceVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [ethGateVisible, setEthGateVisible] = useState(false);
  const [ethGateMessage, setEthGateMessage] = useState('');
  const [passwordGateVisible, setPasswordGateVisible] = useState(false);
  const [pendingAfterPassword, setPendingAfterPassword] = useState<PendingAction>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showCopiedSnackbar = useCallback(() => {
    setSnackbarVisible(true);
  }, []);

  const handleCopyAddress = useCallback(async () => {
    if (!arProfile?.address) return;
    await copyAddress(arProfile.address);
    showCopiedSnackbar();
  }, [arProfile?.address, showCopiedSnackbar]);

  const proceedToAction = (action: PendingAction) => {
    if (action === 'create') {
      navigation.navigate('ArweaveCreateDisclaimer');
    } else if (action === 'import') {
      navigation.navigate('ArweaveImportDisclaimer');
    }
  };

  const startPasswordGate = (action: PendingAction) => {
    setPendingAfterPassword(action);
    setPasswordGateVisible(true);
  };

  const handleEthGateRequired = async (action: PendingAction) => {
    const gateReason = checkEthWalletGate(ethProfile);
    if (gateReason === 'no_profile') {
      setEthGateMessage(t('arweave.ethWalletRequired'));
      setPendingAction(action);
      setEthGateVisible(true);
      return;
    }
    if (gateReason === 'read_only') {
      setEthGateMessage(t('arweave.ethWalletReadOnly'));
      setPendingAction(action);
      setEthGateVisible(true);
      return;
    }

    const hasKeystore = await checkEthKeystoreExists();
    if (!hasKeystore) {
      setEthGateMessage(t('arweave.ethWalletRequired'));
      setPendingAction(action);
      setEthGateVisible(true);
      return;
    }

    startPasswordGate(action);
  };

  const askReplaceThen = (action: PendingAction) => {
    if (arProfile) {
      setPendingAction(action);
      setReplaceVisible(true);
    } else {
      handleEthGateRequired(action);
    }
  };

  const confirmReplacement = () => {
    setReplaceVisible(false);
    if (pendingAction) {
      handleEthGateRequired(pendingAction);
    }
  };

  const handlePasswordVerified = (password: string) => {
    setVerifiedOldPassword(password);
    setPasswordGateVisible(false);
    if (pendingAfterPassword) {
      proceedToAction(pendingAfterPassword);
      setPendingAfterPassword(null);
    }
  };

  const handlePasswordDismiss = () => {
    setPasswordGateVisible(false);
    setPendingAfterPassword(null);
  };

  const goCreateEthWallet = () => {
    setEthGateVisible(false);
    setPendingAction(null);
    navigation.navigate('AddInfoSelect');
  };

  const dialogCopy = useMemo(() => {
    const desc = shortenAddress(arProfile?.address || '');
    return {
      title: t('arweave.confirmReplaceTitle'),
      message: t('arweave.confirmReplaceMsg', { desc }),
    };
  }, [arProfile, t]);

  const options = [
    {
      title: t('arweave.createNewWallet'),
      hint: t('arweave.optionCreateHint'),
      icon: 'plus-circle-outline',
      onPress: () => askReplaceThen('create'),
      color: theme.colors.primary,
      containerColor: theme.colors.primaryContainer,
    },
    {
      title: t('arweave.importJwk'),
      hint: t('arweave.optionImportHint'),
      icon: 'key-outline',
      onPress: () => askReplaceThen('import'),
      color: theme.colors.secondary,
      containerColor: theme.colors.secondaryContainer,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={scrollFill}
        contentContainerStyle={[styles.scrollContent, listContentStyle, { paddingBottom: insets.bottom + 20 }]}
      >
        <ListColumn>
          {arProfile && (
            <Card
              mode="contained"
              style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
            >
              <Card.Content>
                <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                  {t('arweave.currentWalletLabel')}
                </Text>
                <View style={styles.addressRow}>
                  <Text
                    variant="bodyMedium"
                    selectable
                    style={[styles.addressText, { color: theme.colors.onSurface }]}
                  >
                    {arProfile.address}
                  </Text>
                  <IconButton
                    icon="content-copy"
                    size={18}
                    onPress={handleCopyAddress}
                    iconColor={theme.colors.primary}
                    style={styles.copyBtn}
                    accessibilityLabel={t('common.copy')}
                  />
                </View>
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
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
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
        visible={replaceVisible}
        onDismiss={() => setReplaceVisible(false)}
        title={dialogCopy.title}
        actions={[
          { label: t('common.cancel'), onPress: () => setReplaceVisible(false) },
          { label: t('common.confirm'), onPress: confirmReplacement },
        ]}
      >
        <Text variant="bodyMedium">{dialogCopy.message}</Text>
      </AppModal>

      <AppModal
        visible={ethGateVisible}
        onDismiss={() => setEthGateVisible(false)}
        title={t('common.tip')}
        actions={[
          { label: t('common.cancel'), onPress: () => setEthGateVisible(false) },
          { label: t('arweave.ethWalletCreateButton'), onPress: goCreateEthWallet },
        ]}
      >
        <Text variant="bodyMedium">{ethGateMessage}</Text>
      </AppModal>

      <EthPasswordGateModal
        visible={passwordGateVisible}
        onDismiss={handlePasswordDismiss}
        onVerified={handlePasswordVerified}
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
  container: { flex: 1 },
  scrollContent: { paddingVertical: 16 },
  banner: { marginBottom: 16, borderRadius: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  addressText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  copyBtn: { margin: 0, width: 32, height: 32 },
  card: { marginBottom: 12, borderRadius: 12 },
  cardContent: { paddingVertical: 12, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  textContainer: { flex: 1, marginLeft: 16 },
});
