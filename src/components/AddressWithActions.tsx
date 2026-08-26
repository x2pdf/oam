import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { copyAddress } from './CopyableAddress';
import { shortenAddress } from '../utils/address';
import { RootStackParamList } from '../types';
import { useAppContext } from '../context/AppContext';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface AddressWithActionsProps {
  address: string;
  label?: string;
  showFullAddress?: boolean;
  onCopied?: () => void;
  showInfo?: boolean;
  showFollow?: boolean;
}

export function AddressWithActions({
  address,
  label,
  showFullAddress = false,
  onCopied,
  showInfo = true,
  showFollow = true,
}: AddressWithActionsProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { state } = useAppContext();

  const handleCopy = useCallback(async () => {
    if (!address) return;
    await copyAddress(address);
    onCopied?.();
  }, [address, onCopied]);

  const handleInfo = useCallback(() => {
    if (!address) return;
    navigation.navigate('AddressDataList', { address });
  }, [address, navigation]);

  const alreadyFollowed = useMemo(() => {
    const trimmed = address.trim().toLowerCase();
    if (!trimmed) return false;
    return state.subscriptions.some((s) => s.address.toLowerCase() === trimmed);
  }, [address, state.subscriptions]);

  const handleFollow = useCallback(() => {
    if (!address) return;
    navigation.navigate('SubscriptionForm', {
      mode: 'add',
      source: 'subscriptions',
      prefillAddress: address,
    });
  }, [address, navigation]);

  if (!address) return null;

  const displayText = showFullAddress ? address : shortenAddress(address);

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          {label}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text
          variant="bodyMedium"
          style={[styles.addressText, { color: theme.colors.onSurface }]}
          selectable
        >
          {displayText}
        </Text>
        <IconButton
          icon="content-copy"
          size={18}
          onPress={handleCopy}
          iconColor={theme.colors.primary}
          style={styles.iconBtn}
          accessibilityLabel={t('common.copy')}
        />
        {showInfo ? (
          <IconButton
            icon="information-outline"
            size={18}
            onPress={handleInfo}
            iconColor={theme.colors.primary}
            style={styles.iconBtn}
            accessibilityLabel={t('subscriptions.viewAllData')}
          />
        ) : null}
        {showFollow && !alreadyFollowed ? (
          <IconButton
            icon="plus"
            size={18}
            onPress={handleFollow}
            iconColor={theme.colors.primary}
            style={styles.iconBtn}
            accessibilityLabel={t('detail.follow')}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  iconBtn: {
    margin: 0,
    width: 32,
    height: 32,
  },
});
