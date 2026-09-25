import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { wrapImagePress } from '../adapter/wrapImagePress';

function mimeToIcon(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('video/')) return 'play-circle-outline';
  if (m === 'application/pdf') return 'file-pdf-box';
  if (m === 'application/zip') return 'folder-zip-outline';
  return 'file-outline';
}

export function ExternalOpenCard({
  mime,
  label,
  tapHint,
  onOpen,
}: {
  mime: string;
  label: string;
  tapHint: string;
  onOpen: () => void;
}) {
  const theme = useTheme();

  return wrapImagePress(
    <View
      style={[
        styles.linkCard,
        { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={tapHint}
    >
      <View style={styles.linkCardRow}>
        <Icon source={mimeToIcon(mime)} size={28} color={theme.colors.primary} />
        <View style={styles.linkCardContent}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={2}>
            {label}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
            numberOfLines={2}
          >
            {tapHint}
          </Text>
        </View>
        <Icon source="open-in-new" size={20} color={theme.colors.onSurfaceVariant} />
      </View>
    </View>,
    { onPress: onOpen },
  );
}

const styles = StyleSheet.create({
  linkCard: {
    width: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginVertical: 8,
  },
  linkCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkCardContent: {
    flex: 1,
    minWidth: 0,
  },
});
