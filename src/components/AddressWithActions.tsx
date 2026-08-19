import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { copyAddress } from './CopyableAddress';
import { shortenAddress } from '../utils/address';
import { RootStackParamList } from '../types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface AddressWithActionsProps {
  address: string;
  label?: string;
  showFullAddress?: boolean;
  onCopied?: () => void;
  showInfo?: boolean;
}

export function AddressWithActions({
  address,
  label,
  showFullAddress = false,
  onCopied,
  showInfo = true,
}: AddressWithActionsProps) {
  const theme = useTheme();
  const navigation = useNavigation<NavProp>();

  const handleCopy = useCallback(async () => {
    if (!address) return;
    await copyAddress(address);
    onCopied?.();
  }, [address, onCopied]);

  const handleInfo = useCallback(() => {
    if (!address) return;
    navigation.navigate('AddressDataList', { address });
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
        />
        {showInfo ? (
          <IconButton
            icon="information-outline"
            size={18}
            onPress={handleInfo}
            iconColor={theme.colors.primary}
            style={styles.iconBtn}
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
