import React, { useCallback } from 'react';
import { Pressable, StyleProp, TextStyle } from 'react-native';
import { Text } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

interface CopyableAddressProps {
  address: string;
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  variant?: React.ComponentProps<typeof Text>['variant'];
  numberOfLines?: number;
  onCopied?: () => void;
}

export function CopyableAddress({
  address,
  children,
  style,
  variant,
  numberOfLines,
  onCopied,
}: CopyableAddressProps) {
  const handleLongPress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    onCopied?.();
  }, [address, onCopied]);

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={400}>
      <Text variant={variant} style={style} numberOfLines={numberOfLines}>
        {children}
      </Text>
    </Pressable>
  );
}

export async function copyAddress(address: string): Promise<void> {
  if (!address) return;
  await Clipboard.setStringAsync(address);
}
